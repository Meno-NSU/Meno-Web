// One-time Arena intro popup. Shown the first time the user turns Arena mode on
// (tooltips are invisible on touch devices, so the intro is the mobile-friendly
// way to explain the mode). The seen-flag lives in localStorage next to the
// consent flags.

export const ARENA_INTRO_SEEN_FLAG = 'meno.arenaIntroSeen';

export function hasSeenArenaIntro() {
  try {
    return localStorage.getItem(ARENA_INTRO_SEEN_FLAG) === '1';
  } catch {
    // localStorage unavailable — treat as seen so the intro can't nag on every toggle.
    return true;
  }
}

export function markArenaIntroSeen() {
  try {
    localStorage.setItem(ARENA_INTRO_SEEN_FLAG, '1');
  } catch {
    // Non-fatal; the intro may show again next time.
  }
}
