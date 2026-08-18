import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POLICY,
  EMPTY_STATE,
  clearFailures,
  evaluate,
  policyFromEnv,
  registerFailure,
  type ThrottleState
} from "./throttle-policy.js";

const T0 = new Date("2026-08-18T09:00:00.000Z");
const at = (msFromT0: number) => new Date(T0.getTime() + msFromT0);

/**
 * Fold n failures in immediate succession. Also returns the offset of the LAST
 * failure, because a lockout is measured from that moment - not from T0.
 */
function failNTimes(n: number, start: ThrottleState = EMPTY_STATE, stepMs = 1000) {
  let state = start;
  let lockedOut = false;
  let lastOffsetMs = 0;
  for (let i = 0; i < n; i++) {
    lastOffsetMs = i * stepMs;
    const result = registerFailure(state, at(lastOffsetMs), DEFAULT_POLICY);
    state = result.next;
    lockedOut = result.lockedOut;
  }
  return { state, lockedOut, lastOffsetMs };
}

test("a fresh key is allowed", () => {
  assert.deepEqual(evaluate(EMPTY_STATE, T0), { allowed: true });
});

test("failures below the threshold do not lock", () => {
  const { state, lockedOut } = failNTimes(DEFAULT_POLICY.maxFailures - 1);
  assert.equal(lockedOut, false);
  assert.equal(state.failures, DEFAULT_POLICY.maxFailures - 1);
  assert.equal(evaluate(state, at(5000)).allowed, true);
});

test("hitting the threshold locks the key and reports a retry-after", () => {
  const { state, lockedOut } = failNTimes(DEFAULT_POLICY.maxFailures);
  assert.equal(lockedOut, true);
  const decision = evaluate(state, at(5000));
  assert.equal(decision.allowed, false);
  if (!decision.allowed) {
    // ~15 minutes, minus the 5s already elapsed.
    assert.ok(decision.retryAfterSeconds > 890 && decision.retryAfterSeconds <= 900);
  }
});

test("the lock lifts once it expires", () => {
  const { state, lastOffsetMs } = failNTimes(DEFAULT_POLICY.maxFailures);
  // The lock runs from the LAST failure, not from the first.
  assert.equal(evaluate(state, at(lastOffsetMs + DEFAULT_POLICY.baseLockoutMs - 1000)).allowed, false);
  assert.equal(evaluate(state, at(lastOffsetMs + DEFAULT_POLICY.baseLockoutMs + 1000)).allowed, true);
});

test("a lapsed window resets the count, so occasional typos never accumulate", () => {
  // Four failures, then a fifth long after the window - must NOT lock.
  const { state } = failNTimes(DEFAULT_POLICY.maxFailures - 1);
  const late = at(DEFAULT_POLICY.windowMs + 60_000);
  const { next, lockedOut } = registerFailure(state, late, DEFAULT_POLICY);
  assert.equal(lockedOut, false, "an isolated later failure must not trip the lock");
  assert.equal(next.failures, 1, "the window restarted");
});

test("failures after an expired lock start a fresh window rather than instantly re-locking", () => {
  const { state, lastOffsetMs } = failNTimes(DEFAULT_POLICY.maxFailures);
  const afterLock = at(lastOffsetMs + DEFAULT_POLICY.baseLockoutMs + 1000);
  const { next, lockedOut } = registerFailure(state, afterLock, DEFAULT_POLICY);
  assert.equal(lockedOut, false);
  assert.equal(next.failures, 1);
});

test("repeat lockouts back off exponentially and stop at the ceiling", () => {
  let state = EMPTY_STATE;
  const durations: number[] = [];
  let cursor = 0;
  for (let round = 0; round < 7; round++) {
    for (let i = 0; i < DEFAULT_POLICY.maxFailures; i++) {
      cursor += 1000;
      state = registerFailure(state, at(cursor), DEFAULT_POLICY).next;
    }
    assert.ok(state.lockedUntil, "expected a lock");
    durations.push(state.lockedUntil!.getTime() - at(cursor).getTime());
    // Jump past the lock so the next round starts clean.
    cursor = state.lockedUntil!.getTime() - T0.getTime() + 1000;
  }
  assert.equal(durations[0], DEFAULT_POLICY.baseLockoutMs, "first lockout is the base duration");
  assert.ok(durations[1]! > durations[0]!, "second lockout is longer");
  assert.ok(durations[2]! > durations[1]!, "third lockout is longer again");
  for (const duration of durations) {
    assert.ok(duration <= DEFAULT_POLICY.maxLockoutMs, "never exceeds the ceiling");
  }
  assert.equal(durations[durations.length - 1], DEFAULT_POLICY.maxLockoutMs, "settles at the ceiling");
});

test("a successful login clears failures but keeps the lockout history", () => {
  const { state } = failNTimes(DEFAULT_POLICY.maxFailures);
  const cleared = clearFailures(state);
  assert.equal(cleared.failures, 0);
  assert.equal(cleared.lockedUntil, null);
  assert.equal(evaluate(cleared, at(1000)).allowed, true);
  assert.equal(cleared.lockoutCount, 1, "history survives so a guesser does not earn back short locks");
});

test("retryAfter always rounds up, never inviting a retry before the lock lifts", () => {
  const state: ThrottleState = { ...EMPTY_STATE, lockedUntil: at(1500) };
  const decision = evaluate(state, T0);
  assert.equal(decision.allowed, false);
  if (!decision.allowed) assert.equal(decision.retryAfterSeconds, 2);
});

test("policyFromEnv reads overrides and ignores nonsense", () => {
  const parsed = policyFromEnv({
    AUTH_THROTTLE_MAX_FAILURES: "3",
    AUTH_THROTTLE_WINDOW_SECONDS: "600",
    AUTH_THROTTLE_LOCKOUT_SECONDS: "not-a-number"
  } as NodeJS.ProcessEnv);
  assert.equal(parsed.maxFailures, 3);
  assert.equal(parsed.windowMs, 600_000);
  assert.equal(parsed.baseLockoutMs, DEFAULT_POLICY.baseLockoutMs, "garbage falls back to the default");
});
