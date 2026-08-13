// Detects a browser-level frame-rate cap. Chrome's Energy Saver (and macOS Low
// Power Mode) throttle rAF/compositing to ~30fps — the theme-switch circle
// (View Transitions, 550ms of per-frame animation) looks stuttery at that rate,
// so toggleTheme falls back to the plain instant switch while the cap is on.
//
// Sampling is passive: a short rAF burst a moment after startup (so initial
// rendering doesn't inflate the deltas), re-run whenever the tab becomes
// visible again — the cap appears/disappears when the user (un)plugs power,
// which typically happens while the tab is hidden.

// >25ms median frame ≈ under 40fps. A 60Hz display renders at ~16.7ms and a
// capped one at ~33ms, so the threshold sits well clear of both.
export const LOW_FPS_FRAME_MS = 25;
const SAMPLE_FRAMES = 12; // ~200ms at 60fps, ~400ms when capped at 30fps
const STARTUP_SETTLE_MS = 1500;
const VISIBLE_SETTLE_MS = 500;

let lowFrameRate = false;
let sampling = false;

// Pure classifier, exported for tests: median of the deltas (first one dropped —
// it lands on the next vsync at an arbitrary offset) against the threshold.
// The median shrugs off one-off spikes from unrelated main-thread work.
export function isCappedSample(deltas) {
  if (deltas.length < 4) return false;
  const sorted = deltas.slice(1).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return median > LOW_FPS_FRAME_MS;
}

export function isLowFrameRate() {
  return lowFrameRate;
}

export function sampleFrameRate() {
  if (sampling || typeof requestAnimationFrame !== 'function') return;
  sampling = true;
  const deltas = [];
  let last = performance.now();
  const tick = (t) => {
    deltas.push(t - last);
    last = t;
    if (deltas.length < SAMPLE_FRAMES) {
      requestAnimationFrame(tick);
      return;
    }
    lowFrameRate = isCappedSample(deltas);
    sampling = false;
  };
  requestAnimationFrame(tick);
}

// Mount-once watcher (returns its cleanup, ready for useEffect).
export function watchFrameRate() {
  const startupTimer = setTimeout(sampleFrameRate, STARTUP_SETTLE_MS);
  let visibleTimer = null;
  const onVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return;
    clearTimeout(visibleTimer);
    visibleTimer = setTimeout(sampleFrameRate, VISIBLE_SETTLE_MS);
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    clearTimeout(startupTimer);
    clearTimeout(visibleTimer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
