import { beforeEach, describe, it, expect } from 'vitest';
import {
  CONSENT_KIND,
  IMPROVEMENT_BANNER_FLAG,
  hasSeenImprovementBanner,
  setImprovementBannerSeen,
  shouldShowImprovementBanner,
} from './consentGate.js';

describe('shouldShowImprovementBanner — non-blocking improvement opt-in visibility', () => {
  it('shows when not seen and the server has no service consent yet', () => {
    expect(
      shouldShowImprovementBanner({ seen: false, serverState: { serviceAndHistory: false } }),
    ).toBe(true);
  });

  it('shows when nothing is known yet (unseen, server state unknown)', () => {
    expect(shouldShowImprovementBanner({ seen: false, serverState: null })).toBe(true);
    expect(shouldShowImprovementBanner({ seen: false })).toBe(true);
  });

  it('hides once dismissed/decided locally', () => {
    expect(shouldShowImprovementBanner({ seen: true, serverState: null })).toBe(false);
  });

  it('hides when the server already shows service consent (returning/registered user)', () => {
    expect(
      shouldShowImprovementBanner({ seen: false, serverState: { serviceAndHistory: true } }),
    ).toBe(false);
  });
});

describe('improvement banner seen flag', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports not seen when nothing is stored', () => {
    expect(hasSeenImprovementBanner()).toBe(false);
  });

  it('reports seen after it has been recorded', () => {
    setImprovementBannerSeen();
    expect(hasSeenImprovementBanner()).toBe(true);
  });

  it('persists under the documented storage key', () => {
    setImprovementBannerSeen();
    expect(localStorage.getItem(IMPROVEMENT_BANNER_FLAG)).toBeTruthy();
  });
});

describe('CONSENT_KIND', () => {
  it('is the backend document key for the consent document', () => {
    expect(CONSENT_KIND).toBe('personal_data_consent');
  });
});
