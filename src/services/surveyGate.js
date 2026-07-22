// Gates the end-of-session survey. Each completed dialogue is one opportunity with
// an independent SURVEY_PROBABILITY chance of prompting — a real random draw, not a
// fixed cadence, and NOT tied to the first dialogue. Keeps the prompt rare and the
// collected sample unbiased. Stateless: the per-chat `surveyed` flag (in App) is what
// stops the same dialogue from being re-rolled.

export const SURVEY_PROBABILITY = 0.1;

// Pure decision for one completed dialogue. `random` (0..1) is injectable for tests;
// defaults to Math.random().
export function shouldShowSurvey(random = Math.random()) {
  return random < SURVEY_PROBABILITY;
}
