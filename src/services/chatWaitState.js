// Pure policy for the slow/overloaded chat experience: the two wait thresholds,
// the load-display threshold, and small helpers. No React, no DOM beyond
// setTimeout — so it unit-tests like surveyGate.js.

export const SLOW_WARNING_MS = 40_000;
export const RESPONSE_TIMEOUT_MS = 120_000;
export const LOAD_DISPLAY_THRESHOLD = 5;

// Decide whether to show the approximate load figure and normalise the count.
export function resolveOverload({ active, limit } = {}) {
  const count = Number.isFinite(active) ? active : 0;
  return {
    showLoad: count >= LOAD_DISPLAY_THRESHOLD,
    count,
    limit: Number.isFinite(limit) ? limit : null,
  };
}

// One-shot two-stage timers for a pending request: a soft "slow" warning, then a
// hard timeout. Returns { clear } to cancel both (call on first token / finish).
export function createWaitTimers({
  onSlowWarning,
  onTimeout,
  slowMs = SLOW_WARNING_MS,
  timeoutMs = RESPONSE_TIMEOUT_MS,
} = {}) {
  const slowTimer = setTimeout(() => onSlowWarning && onSlowWarning(), slowMs);
  const timeoutTimer = setTimeout(() => onTimeout && onTimeout(), timeoutMs);
  return {
    clear() {
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
    },
  };
}
