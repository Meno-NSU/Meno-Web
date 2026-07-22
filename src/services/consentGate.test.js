import { beforeEach, describe, it, expect } from 'vitest';
import {
  CONSENT_KIND,
  CONSENT_DECISION_FLAG,
  CONSENT_DEFER_UNTIL_KEY,
  CONSENT_REPROMPT_DAYS,
  hasDecidedConsent,
  setConsentDecided,
  getConsentDeferredUntil,
  deferConsent,
  shouldShowConsentModal,
} from './consentGate.js';

describe('shouldShowConsentModal — gate visibility (defer-aware)', () => {
  const base = { decided: false, deferredUntil: null, improvementGranted: false, now: 1000 };

  it('shows when nothing is decided, deferred, or granted', () => {
    expect(shouldShowConsentModal(base)).toBe(true);
  });

  it('hides once the user has made a definitive decision', () => {
    expect(shouldShowConsentModal({ ...base, decided: true })).toBe(false);
  });

  it('hides when the server already shows the improvement opt-in granted', () => {
    expect(shouldShowConsentModal({ ...base, improvementGranted: true })).toBe(false);
  });

  it('hides while inside the defer window (now < deferredUntil)', () => {
    expect(shouldShowConsentModal({ ...base, deferredUntil: 2000, now: 1000 })).toBe(false);
  });

  it('shows again once the defer window has passed', () => {
    expect(shouldShowConsentModal({ ...base, deferredUntil: 2000, now: 3000 })).toBe(true);
  });
});

describe('decision flag', () => {
  beforeEach(() => localStorage.clear());

  it('reports no decision when nothing is stored', () => {
    expect(hasDecidedConsent()).toBe(false);
  });

  it('reports a decision after it has been recorded', () => {
    setConsentDecided();
    expect(hasDecidedConsent()).toBe(true);
    expect(localStorage.getItem(CONSENT_DECISION_FLAG)).toBeTruthy();
  });
});

describe('defer', () => {
  beforeEach(() => localStorage.clear());

  it('has no deferral by default', () => {
    expect(getConsentDeferredUntil()).toBeNull();
  });

  it('defers into the future by the re-prompt interval', () => {
    const before = Date.now();
    deferConsent();
    const until = getConsentDeferredUntil();
    expect(until).toBeGreaterThan(before);
    expect(until).toBeLessThanOrEqual(before + CONSENT_REPROMPT_DAYS * 86400000 + 1000);
    expect(localStorage.getItem(CONSENT_DEFER_UNTIL_KEY)).toBeTruthy();
  });
});

describe('CONSENT_KIND', () => {
  it('is the backend document key for the consent document', () => {
    expect(CONSENT_KIND).toBe('personal_data_consent');
  });
});
