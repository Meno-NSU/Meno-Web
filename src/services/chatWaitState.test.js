import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SLOW_WARNING_MS,
  RESPONSE_TIMEOUT_MS,
  LOAD_DISPLAY_THRESHOLD,
  resolveOverload,
  createWaitTimers,
} from './chatWaitState.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveOverload — show the load figure only past the threshold', () => {
  it('hides the count below the threshold', () => {
    expect(resolveOverload({ active: LOAD_DISPLAY_THRESHOLD - 1, limit: 256 })).toEqual({
      showLoad: false,
      count: LOAD_DISPLAY_THRESHOLD - 1,
      limit: 256,
    });
  });

  it('shows the count at/above the threshold', () => {
    expect(resolveOverload({ active: LOAD_DISPLAY_THRESHOLD, limit: 256 })).toEqual({
      showLoad: true,
      count: LOAD_DISPLAY_THRESHOLD,
      limit: 256,
    });
  });

  it('defaults missing/garbage input to a hidden zero count', () => {
    expect(resolveOverload()).toEqual({ showLoad: false, count: 0, limit: null });
    expect(resolveOverload({ active: 'x' })).toEqual({ showLoad: false, count: 0, limit: null });
  });
});

describe('createWaitTimers — 40s warning then 120s timeout, both cancellable', () => {
  it('fires the slow warning at SLOW_WARNING_MS and the timeout at RESPONSE_TIMEOUT_MS', () => {
    vi.useFakeTimers();
    const onSlowWarning = vi.fn();
    const onTimeout = vi.fn();
    createWaitTimers({ onSlowWarning, onTimeout });

    vi.advanceTimersByTime(SLOW_WARNING_MS);
    expect(onSlowWarning).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(RESPONSE_TIMEOUT_MS - SLOW_WARNING_MS);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('clear() cancels both callbacks', () => {
    vi.useFakeTimers();
    const onSlowWarning = vi.fn();
    const onTimeout = vi.fn();
    const timers = createWaitTimers({ onSlowWarning, onTimeout });
    timers.clear();

    vi.advanceTimersByTime(RESPONSE_TIMEOUT_MS + 1000);
    expect(onSlowWarning).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
