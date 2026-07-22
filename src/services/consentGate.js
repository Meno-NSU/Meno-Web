// Consent gate (see spec 2026-07-22-consent-defer-model). On first use a blocking
// modal asks the improvement/analysis opt-in. «Продолжить» grants it; «Не сейчас»
// DEFERS — nothing is granted and the gate re-asks after CONSENT_REPROMPT_DAYS
// (gently: later prompts are dismissible). The chat itself is always stored
// (SERVICE_AND_HISTORY) regardless, so the user can return to their history —
// guests included. This module holds the gate-visibility policy and its flags.

// Backend document key (NOT the /consent URL slug) — see GET /v1/legal/documents.
export const CONSENT_KIND = 'personal_data_consent';
// Set once the user makes a definitive choice (grants via the modal, or toggles the
// improvement setting either way) — stops the modal from ever nagging again.
export const CONSENT_DECISION_FLAG = 'meno.consentDecided';
// «Не сейчас» stores a re-prompt-after timestamp (ms) here.
export const CONSENT_DEFER_UNTIL_KEY = 'meno.consentDeferredUntil';
// Gentle cadence for re-asking after a defer. The single knob to tune the nag.
export const CONSENT_REPROMPT_DAYS = 7;

// The three published legal documents, mapped to their i18n title keys. Shared by
// the LegalDocument reader and the routed LegalPage.
export const LEGAL_DOC_TITLE_KEYS = {
  personal_data_consent: 'consentReadConsent',
  privacy_policy: 'consentReadPrivacy',
  terms_of_use: 'consentReadTerms',
};

// Pure gate decision. Hidden once the user decided (locally) or the server shows the
// improvement opt-in granted, and hidden while inside an active defer window.
export function shouldShowConsentModal({ decided, deferredUntil, improvementGranted, now } = {}) {
  if (decided) return false;
  if (improvementGranted) return false;
  if (deferredUntil && now < deferredUntil) return false;
  return true;
}

export function hasDecidedConsent() {
  try {
    return localStorage.getItem(CONSENT_DECISION_FLAG) === '1';
  } catch {
    return false;
  }
}

export function setConsentDecided() {
  try {
    localStorage.setItem(CONSENT_DECISION_FLAG, '1');
  } catch {
    // localStorage unavailable — non-fatal; the modal may reappear next load.
  }
}

export function getConsentDeferredUntil() {
  try {
    const raw = localStorage.getItem(CONSENT_DEFER_UNTIL_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function deferConsent() {
  try {
    const until = Date.now() + CONSENT_REPROMPT_DAYS * 86400000;
    localStorage.setItem(CONSENT_DEFER_UNTIL_KEY, String(until));
  } catch {
    // localStorage unavailable — non-fatal; the modal may reappear next load.
  }
}
