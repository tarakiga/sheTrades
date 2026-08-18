/**
 * Persistence for login throttling. Thin on purpose — all the decision-making
 * lives in throttle-policy.ts, which is pure and fully unit-tested.
 */
import { prisma } from "../admin/prisma.js";
import { logger } from "../lib/logging.js";
import {
  EMPTY_STATE,
  clearFailures,
  evaluate,
  policyFromEnv,
  registerFailure,
  type ThrottleDecision,
  type ThrottleState
} from "./throttle-policy.js";

export type ThrottleScope = "email";

function normalizeKey(scope: ThrottleScope, key: string): string {
  return scope === "email" ? key.trim().toLowerCase() : key.trim();
}

type Row = {
  failures: number;
  firstFailureAt: Date | null;
  lockedUntil: Date | null;
  lockoutCount: number;
};

function toState(row: Row | null): ThrottleState {
  if (!row) return EMPTY_STATE;
  return {
    failures: row.failures ?? 0,
    firstFailureAt: row.firstFailureAt ?? null,
    lockedUntil: row.lockedUntil ?? null,
    lockoutCount: row.lockoutCount ?? 0
  };
}

async function readState(scope: ThrottleScope, key: string): Promise<ThrottleState> {
  const row = await prisma.authThrottle.findUnique({
    where: { scope_key: { scope, key } },
    select: { failures: true, firstFailureAt: true, lockedUntil: true, lockoutCount: true }
  });
  return toState(row);
}

async function writeState(scope: ThrottleScope, key: string, state: ThrottleState): Promise<void> {
  await prisma.authThrottle.upsert({
    where: { scope_key: { scope, key } },
    create: { scope, key, ...state },
    update: state
  });
}

/**
 * Is this identity allowed to attempt a login right now?
 *
 * FAILS OPEN. If the throttle store is unreachable we let the attempt proceed
 * rather than locking every admin out of their own dashboard over a database
 * blip — the password check still stands behind it. The failure is logged so
 * the degradation is visible rather than silent.
 */
export async function checkLoginAllowed(
  scope: ThrottleScope,
  rawKey: string
): Promise<ThrottleDecision> {
  const key = normalizeKey(scope, rawKey);
  try {
    return evaluate(await readState(scope, key), new Date());
  } catch (error) {
    logger.warn("auth.throttle.read_failed", {
      scope,
      error: error instanceof Error ? error.message : String(error)
    });
    return { allowed: true };
  }
}

/** Record a failed attempt. Returns true if this attempt tripped a lockout. */
export async function recordLoginFailure(
  scope: ThrottleScope,
  rawKey: string
): Promise<{ lockedOut: boolean; retryAfterSeconds: number | null }> {
  const key = normalizeKey(scope, rawKey);
  try {
    const now = new Date();
    const { next, lockedOut } = registerFailure(await readState(scope, key), now, policyFromEnv());
    await writeState(scope, key, next);
    const retryAfterSeconds =
      lockedOut && next.lockedUntil
        ? Math.max(1, Math.ceil((next.lockedUntil.getTime() - now.getTime()) / 1000))
        : null;
    return { lockedOut, retryAfterSeconds };
  } catch (error) {
    logger.warn("auth.throttle.write_failed", {
      scope,
      error: error instanceof Error ? error.message : String(error)
    });
    return { lockedOut: false, retryAfterSeconds: null };
  }
}

/** Clear the failure count after a successful login. */
export async function clearLoginFailures(scope: ThrottleScope, rawKey: string): Promise<void> {
  const key = normalizeKey(scope, rawKey);
  try {
    const state = await readState(scope, key);
    if (state.failures === 0 && !state.lockedUntil) return; // nothing to do
    await writeState(scope, key, clearFailures(state));
  } catch (error) {
    logger.warn("auth.throttle.clear_failed", {
      scope,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/** Test seam: drop all throttle state. */
export async function resetThrottleForTests(): Promise<void> {
  await prisma.authThrottle.deleteMany({});
}
