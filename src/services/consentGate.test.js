import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
  CONSENT_KIND,
  CONSENT_FLAG_KEY,
  hasLocalConsent,
  setLocalConsent,
  deriveNeedsConsent,
  createConsentChecker,
} from './consentGate.js';

describe('deriveNeedsConsent — whether the first message must be gated', () => {
  it('does not gate when the local fast-path flag is set (skips the network)', () => {
    expect(deriveNeedsConsent({ localFlag: true, serverState: null })).toBe(false);
    // The local grant is a fast-path; it wins even over a stale "not granted" server read.
    expect(
      deriveNeedsConsent({ localFlag: true, serverState: { serviceAndHistory: false } }),
    ).toBe(false);
  });

  it('gates when the server state is unknown — fail-closed', () => {
    expect(deriveNeedsConsent({ localFlag: false, serverState: null })).toBe(true);
    expect(deriveNeedsConsent({ localFlag: false })).toBe(true);
  });

  it('gates when the server has no service_and_history grant', () => {
    expect(
      deriveNeedsConsent({ localFlag: false, serverState: { serviceAndHistory: false } }),
    ).toBe(true);
  });

  it('does not gate when the server confirms the service_and_history grant', () => {
    expect(
      deriveNeedsConsent({ localFlag: false, serverState: { serviceAndHistory: true } }),
    ).toBe(false);
  });
});

describe('local consent fast-path flag', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports no consent when nothing is stored', () => {
    expect(hasLocalConsent()).toBe(false);
  });

  it('reports consent after it has been recorded', () => {
    setLocalConsent();
    expect(hasLocalConsent()).toBe(true);
  });

  it('persists under the documented storage key', () => {
    setLocalConsent();
    expect(localStorage.getItem(CONSENT_FLAG_KEY)).toBeTruthy();
  });
});

describe('CONSENT_KIND', () => {
  it('is the backend document key for the consent document', () => {
    expect(CONSENT_KIND).toBe('personal_data_consent');
  });
});

describe('createConsentChecker — async gate decision with caching and fail-closed', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not gate and skips the network when the local flag is set', async () => {
    setLocalConsent();
    const getSettings = vi.fn();
    const checker = createConsentChecker(getSettings);
    expect(await checker.needsConsent()).toBe(false);
    expect(getSettings).not.toHaveBeenCalled();
  });

  it('gates when the server reports no service_and_history grant', async () => {
    const getSettings = vi.fn().mockResolvedValue({ serviceAndHistory: false, menoImprovement: false });
    const checker = createConsentChecker(getSettings);
    expect(await checker.needsConsent()).toBe(true);
    expect(getSettings).toHaveBeenCalledTimes(1);
  });

  it('does not gate when the server confirms the grant, and caches the read', async () => {
    const getSettings = vi.fn().mockResolvedValue({ serviceAndHistory: true, menoImprovement: true });
    const checker = createConsentChecker(getSettings);
    expect(await checker.needsConsent()).toBe(false);
    expect(await checker.needsConsent()).toBe(false);
    expect(getSettings).toHaveBeenCalledTimes(1); // cached, not re-fetched
  });

  it('is fail-closed: gates when the settings read throws', async () => {
    const getSettings = vi.fn().mockRejectedValue(new Error('offline'));
    const checker = createConsentChecker(getSettings);
    expect(await checker.needsConsent()).toBe(true);
  });

  it('stops gating after markGranted — sets the local flag, no further network', async () => {
    const getSettings = vi.fn().mockResolvedValue({ serviceAndHistory: false, menoImprovement: false });
    const checker = createConsentChecker(getSettings);
    expect(await checker.needsConsent()).toBe(true);

    checker.markGranted();
    expect(hasLocalConsent()).toBe(true);

    getSettings.mockClear();
    expect(await checker.needsConsent()).toBe(false);
    expect(getSettings).not.toHaveBeenCalled();
  });
});
