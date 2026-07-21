// Decides whether the blocking consent gate must be shown before the user's
// first message. All of the "when to gate" policy lives here (behind
// deriveNeedsConsent) so App.jsx only wires state and side effects.
//
// Visibility is server-authoritative (GET /v1/privacy/settings) with a
// localStorage fast-path, so returning users never see the gate or wait on the
// network. Unknown server state gates (fail-closed): we never process a first
// message on an unconfirmed consent.

// Backend document key (NOT the /consent URL slug) — see GET /v1/legal/documents.
export const CONSENT_KIND = 'personal_data_consent';
export const CONSENT_FLAG_KEY = 'meno.consentGiven';

// The three published legal documents, mapped to their i18n title keys. Shared by
// the consent gate (link labels) and the LegalDocument reader (its heading).
export const LEGAL_DOC_TITLE_KEYS = {
  personal_data_consent: 'consentReadConsent',
  privacy_policy: 'consentReadPrivacy',
  terms_of_use: 'consentReadTerms',
};

// Pure decision. `serverState` is { serviceAndHistory, menoImprovement } from
// GET /v1/privacy/settings, or null/undefined when it isn't known yet.
export function deriveNeedsConsent({ localFlag, serverState } = {}) {
  if (localFlag) return false;
  return !serverState?.serviceAndHistory;
}

export function hasLocalConsent() {
  try {
    return localStorage.getItem(CONSENT_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function setLocalConsent() {
  try {
    localStorage.setItem(CONSENT_FLAG_KEY, '1');
  } catch {
    // localStorage unavailable — non-fatal; the gate re-confirms via the server next load.
  }
}

// Resolves whether the consent gate must block a send. Caches the server read so
// later sends skip the network, and is fail-closed: an unknown state gates. The
// getSettings dependency is injected (App passes the api client's getPrivacySettings)
// to keep this unit testable without the network.
export function createConsentChecker(getSettings) {
  let cached = null; // { serviceAndHistory, menoImprovement } once known

  return {
    async needsConsent() {
      if (hasLocalConsent()) return false;
      if (cached === null) {
        try {
          cached = await getSettings();
        } catch {
          cached = null; // still unknown → fail-closed by deriveNeedsConsent
        }
      }
      return deriveNeedsConsent({ localFlag: false, serverState: cached });
    },
    markGranted() {
      setLocalConsent();
      cached = { ...(cached || {}), serviceAndHistory: true };
    },
  };
}
