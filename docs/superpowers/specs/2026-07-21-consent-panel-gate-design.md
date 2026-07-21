# Design: blocking consent gate before the first message

Date: 2026-07-21
Status: Proposed design
Initiative: Meno privacy / 152-ФЗ — Stage 2b (frontend), slice 1 (consent panel)

## Goal

Capture the user's data-processing consent under 152-ФЗ before Meno processes their
first message, **without** walling the app on load. The user may look around freely
(sidebar, models, knowledge bases); the **first attempt to send a message** opens a
**blocking, non-dismissible** consent panel. After the user chooses, the pending
message is sent automatically (auto-resume).

Two choices, per the ТЗ:
- Primary (cyan) «Разрешить улучшение и продолжить» → grant service **and** improvement.
- Secondary «Продолжить без улучшения» → grant service only.

Both record `SERVICE_AND_HISTORY` (the backend refuses any `PATCH` with
`service_and_history=false` → 400); the visible difference is `MENO_IMPROVEMENT`
(dialogue collection for improvement). Consent is enforced client-side for now — the
backend `consent_required` gate on `/v1/chat/completions` is a separate, later slice.

## Current behavior

- No consent/legal UI anywhere. `App.jsx` mints a guest session on mount
  (`ensureGuestSession()`), then `handleSendMessage(text)` sends immediately.
- Backend (merged to `main`) already exposes the contract this slice consumes:
  - `GET /v1/privacy/settings` → `{ service_and_history, meno_improvement }`; **401**
    without JWT / `X-Guest-Token`. A subject with no consent events → both `false`.
  - `PATCH /v1/privacy/settings` body `{ document_version, service_and_history,
    meno_improvement, source? }`: **409** if `document_version` ≠ current (`"1.0"`);
    **400** if `service_and_history=false`; records `SERVICE_AND_HISTORY` only if not
    already granted and `MENO_IMPROVEMENT` only on change; returns the new state.
  - `GET /v1/legal/documents` → `{ documents: [{ kind, version, url, sha256,
    effective_at }] }`; `GET /v1/legal/documents/{kind}` adds `content` (markdown).
    `kind` is the internal key (`personal_data_consent`, `privacy_policy`,
    `terms_of_use`), **not** the `/consent` URL slug.
- `services/api.js#fetchWithLogging` already injects `Authorization: Bearer` (signed in)
  or `X-Guest-Token` (guest) automatically, so new calls need no auth plumbing.

## Design (frontend only, Meno-Web)

1. **`services/api.js` — three wrappers** (reuse `fetchWithLogging` + `buildError`):
   - `getPrivacySettings()` → `{ serviceAndHistory, menoImprovement }` (maps snake→camel).
   - `patchPrivacySettings({ documentVersion, serviceAndHistory, menoImprovement, source })`
     → new state; throws `buildError` on non-OK (409/400/401 carry `httpStatus`).
   - `getLegalDocument(kind)` → `{ kind, version, url, sha256, effectiveAt, content }`.
   - `getLegalDocuments()` → array (used to read the current `personal_data_consent`
     version for the PATCH; avoids hardcoding `"1.0"`).

2. **New pure module `services/consentGate.js`** — all gating logic isolated from
   `App.jsx`, tolerant of missing/corrupt storage:
   - `export const CONSENT_KIND = 'personal_data_consent'`
   - `export const CONSENT_FLAG_KEY = 'meno.consentGiven'`
   - `hasLocalConsent()` / `setLocalConsent()` over `localStorage` (fast-path so
     returning users never see the gate and skip the network check).
   - `deriveNeedsConsent({ localFlag, serverState })` → `boolean`:
     `localFlag` true → `false`; else `!serverState?.serviceAndHistory`
     (unknown/`null` server state → `true`, i.e. **fail-closed**: if we cannot confirm
     consent, gate).

3. **`components/ConsentGate.jsx` + `.css`** — blocking modal, styled from the
   `SurveyModal` overlay+card pattern but **non-dismissible**: no X, Esc and backdrop
   `mousedown` do **nothing**. Contents: title, short body text with three inline links
   opening the documents (see 4), primary + secondary buttons, and a `busy`/`error`
   state (a failed `PATCH` keeps the gate open, shows an inline retryable error). Props:
   `{ isOpen, documentVersion, onGrant(menoImprovement), busy, error }`. Brand cyan
   `--accent-primary` on the primary button only.

4. **`components/LegalDocument.jsx` + `.css`** — reusable document reader. Fetches
   `getLegalDocument(kind)` and renders `content` with `react-markdown` + `remark-gfm`
   (already deps). Opens as a **dismissible** overlay that stacks **above** the gate
   (higher z-index; X / Esc / backdrop close it and return to the gate). Shows title +
   version; loading + error states. Reused verbatim by the routed `/privacy·/consent·
   /terms` pages in the next slice.

5. **`App.jsx` wiring**:
   - State `consentState` (`null` = unknown) + `consentVersion`; a `pendingSendRef`
     for the stashed message; `isConsentGateOpen`.
   - On mount, after `ensureGuestSession()`: if `hasLocalConsent()` skip; else fetch
     `getPrivacySettings()` + the consent doc version (best-effort, non-blocking).
   - `ensureConsentChecked()` — resolves the cached grant boolean, performing a single
     deduped `getPrivacySettings()` if still unknown; on success caches state and, if
     granted, calls `setLocalConsent()`; on error resolves "not granted" (fail-closed).
   - `handleSendMessage` gains a guard at the top: if
     `deriveNeedsConsent({ localFlag: hasLocalConsent(), serverState: await ensureConsentChecked-result })`
     is true, stash `{ text, opts }` in `pendingSendRef`, open the gate, and return
     without sending.
   - `onGrant(menoImprovement)` → `patchPrivacySettings({ documentVersion: consentVersion,
     serviceAndHistory: true, menoImprovement, source: 'first_run_gate' })`; on success
     `setLocalConsent()`, cache state, close gate, and replay the stashed send.

6. **i18n** — add keys to **both** `ru` and `en` (CI parity guard): gate title, body,
   two button labels, the three document link labels, and the reader/error strings.

## Test plan (vitest, TDD)

- `services/consentGate.test.js`: `hasLocalConsent`/`setLocalConsent` round-trip and
  tolerate absent/corrupt values; `deriveNeedsConsent` truth table (local flag wins;
  `null` server → true; `serviceAndHistory:true` → false).
- `services/api` privacy/legal wrappers: snake↔camel mapping; non-OK → thrown error with
  `httpStatus` (mock `fetch`).
- `ConsentGate.test.jsx`: renders both buttons + three doc links; primary calls
  `onGrant(true)`, secondary `onGrant(false)`; Esc and backdrop `mousedown` do **not**
  close it; `error` prop renders a retryable message; `busy` disables the buttons.
- `LegalDocument.test.jsx`: fetches by kind, renders markdown content and version;
  X/Esc/backdrop invoke `onClose`; error state on fetch failure.
- App-level intercept: first send with no consent opens the gate and does **not** call
  `sendChatMessage`; after `onGrant`, the stashed message is sent (assert via the
  gating helper + a focused test around the guard; avoid brittle full-`App` rendering).

## Out of scope / follow-ups (later Stage 2b slices)

- Routed pages `/privacy·/consent·/terms` + footer links (reuse `LegalDocument`);
  needs minimal client routing — the app has none today (`currentView` only).
- Backend `consent_required` gate on `/v1/chat/completions`.
- Registration consent checkbox in `AuthModal`.
- «Данные и конфиденциальность» settings section (improvement toggle → PATCH, delete
  history/account).

## Open items

- `source` string set to `'first_run_gate'` (backend accepts any string; for analytics).
- Documents show `version` now; `effective_at` is `null` until publication (backend
  config `LEGAL_EFFECTIVE_AT`) — intended, the reader simply omits the date when null.
