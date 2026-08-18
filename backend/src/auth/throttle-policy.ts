/**
 * Login throttling policy — pure functions, no database and no clock of their
 * own, so every branch is unit-testable and the persistence layer stays dumb.
 *
 * Design notes:
 * - We LOCK for a bounded period rather than disabling the account. A permanent
 *   lock would hand any attacker a trivial denial-of-service against a known
 *   admin email; a 15-minute lock still cuts brute force to a few hundred
 *   guesses a day, which no real password survives losing to.
 * - Lockouts get progressively longer for repeat offenders, so a fat-fingered
 *   admin waits minutes while someone grinding the endpoint waits hours.
 * - The failure window slides: isolated typos weeks apart never accumulate into
 *   a lockout.
 */

export type ThrottleState = {
  failures: number;
  firstFailureAt: Date | null;
  lockedUntil: Date | null;
  lockoutCount: number;
};

export type ThrottlePolicy = {
  /** Failures inside the window before locking. */
  maxFailures: number;
  /** Window (ms) over which failures accumulate. */
  windowMs: number;
  /** First lockout duration (ms). */
  baseLockoutMs: number;
  /** Lockout duration ceiling (ms), however many times they trip it. */
  maxLockoutMs: number;
};

export const DEFAULT_POLICY: ThrottlePolicy = {
  maxFailures: 5,
  windowMs: 15 * 60_000,
  baseLockoutMs: 15 * 60_000,
  maxLockoutMs: 4 * 60 * 60_000
};

/** Env overrides so thresholds are tunable without a deploy-time code change. */
export function policyFromEnv(env: NodeJS.ProcessEnv = process.env): ThrottlePolicy {
  const int = (name: string, fallback: number) => {
    const raw = env[name];
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    maxFailures: int("AUTH_THROTTLE_MAX_FAILURES", DEFAULT_POLICY.maxFailures),
    windowMs: int("AUTH_THROTTLE_WINDOW_SECONDS", DEFAULT_POLICY.windowMs / 1000) * 1000,
    baseLockoutMs: int("AUTH_THROTTLE_LOCKOUT_SECONDS", DEFAULT_POLICY.baseLockoutMs / 1000) * 1000,
    maxLockoutMs: int("AUTH_THROTTLE_MAX_LOCKOUT_SECONDS", DEFAULT_POLICY.maxLockoutMs / 1000) * 1000
  };
}

export const EMPTY_STATE: ThrottleState = {
  failures: 0,
  firstFailureAt: null,
  lockedUntil: null,
  lockoutCount: 0
};

export type ThrottleDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Is this key currently locked out? */
export function evaluate(state: ThrottleState, now: Date): ThrottleDecision {
  if (state.lockedUntil && state.lockedUntil.getTime() > now.getTime()) {
    const remainingMs = state.lockedUntil.getTime() - now.getTime();
    return {
      allowed: false,
      // Round UP: never tell a caller to retry a moment before the lock lifts.
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000))
    };
  }
  return { allowed: true };
}

/**
 * Fold a failed attempt into the state. Returns the state to persist plus
 * whether this attempt tripped a lockout (for audit logging).
 */
export function registerFailure(
  state: ThrottleState,
  now: Date,
  policy: ThrottlePolicy
): { next: ThrottleState; lockedOut: boolean } {
  // A lapsed window (or a lock that has since expired) starts a fresh count,
  // so unrelated typos far apart never add up.
  const windowLapsed =
    !state.firstFailureAt || now.getTime() - state.firstFailureAt.getTime() > policy.windowMs;
  const lockExpired = Boolean(state.lockedUntil && state.lockedUntil.getTime() <= now.getTime());

  const failures = windowLapsed || lockExpired ? 1 : state.failures + 1;
  const firstFailureAt = windowLapsed || lockExpired ? now : state.firstFailureAt;

  if (failures >= policy.maxFailures) {
    const lockoutCount = state.lockoutCount + 1;
    // Exponential with a ceiling: 15m, 30m, 60m, 2h, 4h, 4h…
    const durationMs = Math.min(
      policy.baseLockoutMs * Math.pow(2, lockoutCount - 1),
      policy.maxLockoutMs
    );
    return {
      next: {
        failures: 0,
        firstFailureAt: null,
        lockedUntil: new Date(now.getTime() + durationMs),
        lockoutCount
      },
      lockedOut: true
    };
  }

  return {
    next: { failures, firstFailureAt, lockedUntil: null, lockoutCount: state.lockoutCount },
    lockedOut: false
  };
}

/**
 * State after a successful login. `lockoutCount` is deliberately NOT reset:
 * a correct password proves the account, but an attacker who eventually
 * guesses it should not also earn back the short early lockouts. It ages out
 * naturally when the row is pruned.
 */
export function clearFailures(state: ThrottleState): ThrottleState {
  return { failures: 0, firstFailureAt: null, lockedUntil: null, lockoutCount: state.lockoutCount };
}
