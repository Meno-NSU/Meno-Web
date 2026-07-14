// Gates how often the end-of-session survey is shown so it stops nagging users
// and keeps the collected statistics meaningful. Show it once on the user's first
// completed dialogue, then at most once per SURVEY_INTERVAL completed dialogues.
//
// All of the "when to ask" policy lives here (behind decideSurvey) so a smarter,
// topic-aware policy can replace it later without touching the App wiring.

export const SURVEY_INTERVAL = 10;

const STORAGE_KEY = 'meno_survey_gate';
const DEFAULT_STATE = { seenOnce: false, sinceShown: 0 };

function normalizeState(raw) {
  return {
    seenOnce: Boolean(raw?.seenOnce),
    sinceShown:
      Number.isInteger(raw?.sinceShown) && raw.sinceShown >= 0 ? raw.sinceShown : 0,
  };
}

// Pure decision for one completed dialogue: whether to show the survey now and the
// next persisted state. `interval` is injectable for testing/tuning.
export function decideSurvey({ seenOnce, sinceShown } = {}, interval = SURVEY_INTERVAL) {
  if (!seenOnce) {
    return { show: true, next: { seenOnce: true, sinceShown: 0 } };
  }
  const counted = (sinceShown || 0) + 1;
  if (counted >= interval) {
    return { show: true, next: { seenOnce: true, sinceShown: 0 } };
  }
  return { show: false, next: { seenOnce: true, sinceShown: counted } };
}

export function readSurveyState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_STATE };
    return normalizeState(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeSurveyState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
  } catch {
    // localStorage unavailable/full — non-fatal; the gate just won't persist.
  }
}
