import { describe, it, expect, vi } from 'vitest';
import { shouldShowSurvey, SURVEY_PROBABILITY } from './surveyGate.js';

describe('shouldShowSurvey — real 10% chance per completed dialogue', () => {
  it('uses a 10% probability', () => {
    expect(SURVEY_PROBABILITY).toBe(0.1);
  });

  it('shows when the draw falls under the probability', () => {
    expect(shouldShowSurvey(0)).toBe(true);
    expect(shouldShowSurvey(0.05)).toBe(true);
    expect(shouldShowSurvey(0.099)).toBe(true);
  });

  it('does not show at or above the probability', () => {
    expect(shouldShowSurvey(0.1)).toBe(false);
    expect(shouldShowSurvey(0.5)).toBe(false);
    expect(shouldShowSurvey(0.9999)).toBe(false);
  });

  it('is stateless — no "first dialogue" special case, each call independent', () => {
    // Same draw always yields the same decision: there is no history to bias it.
    expect(shouldShowSurvey(0.05)).toBe(true);
    expect(shouldShowSurvey(0.05)).toBe(true);
    expect(shouldShowSurvey(0.5)).toBe(false);
  });

  it('draws from Math.random() when no value is injected', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.05);
    expect(shouldShowSurvey()).toBe(true);
    spy.mockReturnValue(0.5);
    expect(shouldShowSurvey()).toBe(false);
    spy.mockRestore();
  });
});
