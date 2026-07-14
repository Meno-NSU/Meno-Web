import { beforeEach, describe, it, expect } from 'vitest';
import {
  decideSurvey,
  readSurveyState,
  writeSurveyState,
  SURVEY_INTERVAL,
} from './surveyGate.js';

describe('decideSurvey — show once on the first dialogue, then at most once per interval', () => {
  it('shows on the first completed dialogue and marks the user as seen', () => {
    const { show, next } = decideSurvey({ seenOnce: false, sinceShown: 0 });
    expect(show).toBe(true);
    expect(next).toEqual({ seenOnce: true, sinceShown: 0 });
  });

  it('suppresses the dialogues between surveys while counting them', () => {
    let state = { seenOnce: true, sinceShown: 0 };
    for (let i = 1; i <= SURVEY_INTERVAL - 1; i++) {
      const { show, next } = decideSurvey(state);
      expect(show).toBe(false);
      expect(next.sinceShown).toBe(i);
      state = next;
    }
  });

  it('shows again exactly on the interval-th dialogue and resets the counter', () => {
    const { show, next } = decideSurvey({ seenOnce: true, sinceShown: SURVEY_INTERVAL - 1 });
    expect(show).toBe(true);
    expect(next).toEqual({ seenOnce: true, sinceShown: 0 });
  });

  it('respects a custom interval', () => {
    expect(decideSurvey({ seenOnce: true, sinceShown: 2 }, 3).show).toBe(true);
    expect(decideSurvey({ seenOnce: true, sinceShown: 1 }, 3).show).toBe(false);
  });

  it('never shows more than once in any window of SURVEY_INTERVAL dialogues', () => {
    let state = { seenOnce: false, sinceShown: 0 };
    const shows = [];
    for (let i = 0; i < 100; i++) {
      const { show, next } = decideSurvey(state);
      shows.push(show);
      state = next;
    }
    // First dialogue + every interval-th afterwards => exactly 10 across 100.
    expect(shows.filter(Boolean).length).toBe(100 / SURVEY_INTERVAL);
    for (let start = 0; start < shows.length; start++) {
      const windowShows = shows.slice(start, start + SURVEY_INTERVAL).filter(Boolean).length;
      expect(windowShows).toBeLessThanOrEqual(1);
    }
  });
});

describe('read/writeSurveyState — localStorage persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips the state through localStorage', () => {
    writeSurveyState({ seenOnce: true, sinceShown: 4 });
    expect(readSurveyState()).toEqual({ seenOnce: true, sinceShown: 4 });
  });

  it('returns the default state when nothing is stored', () => {
    expect(readSurveyState()).toEqual({ seenOnce: false, sinceShown: 0 });
  });

  it('returns the default state when the stored value is corrupt', () => {
    localStorage.setItem('meno_survey_gate', '{not json');
    expect(readSurveyState()).toEqual({ seenOnce: false, sinceShown: 0 });
  });
});
