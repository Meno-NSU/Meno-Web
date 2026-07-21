// Consent is soft and non-blocking (see spec 2026-07-22-soft-consent-model):
// service processing (answering) rests on the user's conclusive action plus a
// persistent notice — it is NOT gated. Only the improvement/analysis opt-in is an
// explicit choice, offered by a non-blocking banner. This module holds just the
// banner-visibility policy and its localStorage flag.

// Backend document key (NOT the /consent URL slug) — see GET /v1/legal/documents.
export const CONSENT_KIND = 'personal_data_consent';
export const IMPROVEMENT_BANNER_FLAG = 'meno.improvementBannerSeen';

// The three published legal documents, mapped to their i18n title keys. Shared by
// the LegalDocument reader and the routed LegalPage.
export const LEGAL_DOC_TITLE_KEYS = {
  personal_data_consent: 'consentReadConsent',
  privacy_policy: 'consentReadPrivacy',
  terms_of_use: 'consentReadTerms',
};

// Pure decision for the non-blocking improvement banner. `serverState` is
// { serviceAndHistory, menoImprovement } from GET /v1/privacy/settings, or
// null/undefined when unknown. Hidden once dismissed/decided locally, or once the
// server already shows the user consented to service (returning/registered — don't nag).
export function shouldShowImprovementBanner({ seen, serverState } = {}) {
  if (seen) return false;
  return !serverState?.serviceAndHistory;
}

export function hasSeenImprovementBanner() {
  try {
    return localStorage.getItem(IMPROVEMENT_BANNER_FLAG) === '1';
  } catch {
    return false;
  }
}

export function setImprovementBannerSeen() {
  try {
    localStorage.setItem(IMPROVEMENT_BANNER_FLAG, '1');
  } catch {
    // localStorage unavailable — non-fatal; the banner may reappear next load.
  }
}
