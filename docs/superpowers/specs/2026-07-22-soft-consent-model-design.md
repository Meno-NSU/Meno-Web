# Design: soft (non-blocking) consent model

Date: 2026-07-22
Status: Approved design
Initiative: Meno privacy / 152-ФЗ — Stage 2b (frontend), slice 3
Supersedes the blocking gate from `2026-07-21-consent-panel-gate-design.md`.

## Goal

Rework consent to a soft, non-blocking model consistent across guests and registered
users, avoiding an intimidating "personal-data processing" wall/checkbox. Two levels
of processing, deliberately separated:

- **Service (answering the question)** — basis is the user's conclusive action (typing
  and sending), informed by a persistent notice. Not gated; no blocking.
- **Improvement (storing dialogues for analysis)** — a *non-necessary* purpose, so an
  **explicit opt-in, default OFF**, offered by a non-blocking banner.

The legally meaningful artifact (a `consent_event` with document version + SHA-256) is
still recorded by the backend on the explicit choices — the softened UI changes framing,
not the record. Rationale and the ChatGPT/GDPR-vs-152-ФЗ discussion are in the session;
final notice/opt-in wording is a pre-launch checklist item for NSU InfoSec (non-blocking).

## Current behavior (to change)

Slice 1 (merged, PR #31) shipped a **blocking** `ConsentGate`: `App.handleSendMessage`
intercepts the first send, stashes the message, opens a non-dismissible modal, and
resumes after a choice. `services/consentGate.js` holds the gate decision
(`deriveNeedsConsent`, `createConsentChecker`, `meno.consentGiven` flag). This slice
retires the blocking behavior.

## Design (frontend only, Meno-Web)

1. **`services/consentGate.js` — simplify.** Remove `deriveNeedsConsent`,
   `createConsentChecker`, `CONSENT_FLAG_KEY`, `hasLocalConsent`, `setLocalConsent`.
   Keep `CONSENT_KIND`, `LEGAL_DOC_TITLE_KEYS`. Add:
   - `IMPROVEMENT_BANNER_FLAG = 'meno.improvementBannerSeen'`,
     `hasSeenImprovementBanner()` / `setImprovementBannerSeen()`.
   - Pure `shouldShowImprovementBanner({ seen, serverState })` → `!seen &&
     !serverState?.serviceAndHistory` (hide once seen locally, or once the server shows
     the user already consented to service — returning/registered users aren't nagged).

2. **`components/ConsentBanner.jsx` (+ `.css`)** — non-blocking card, bottom-right on
   desktop / bottom bar on mobile. **No overlay, no blur, does not block the chat.**
   `role="region"` + `aria-label` (NOT `aria-modal`). Content: short text about using
   dialogues to improve Meno (stored only with consent), a policy link
   (`<a href="/privacy" target="_blank" rel="noopener">`), two buttons and a dismiss:
   - «Разрешить улучшение» → `onDecide(true)`
   - «Не сейчас» → `onDecide(false)`
   - X (dismiss) → `onDismiss()`
   Replaces `ConsentGate.jsx/.css/.test.jsx` (deleted).

3. **`App.jsx` — remove the block, wire the banner.**
   - Delete the consent check / stash / resume in `handleSendMessage` and the
     `handleConsentGrant` block/resume machinery. Sending is never gated.
   - On mount (after guest/auth resolves): best-effort `getPrivacySettings()` →
     `serverConsent`; `bannerVisible = shouldShowImprovementBanner({ seen:
     hasSeenImprovementBanner(), serverState: serverConsent })`.
   - Render `<ConsentBanner>` when `bannerVisible`.
     - `onDecide(improve)` → best-effort `patchPrivacySettings({ documentVersion,
       serviceAndHistory: true, menoImprovement: improve, source: 'consent_banner' })`;
       `setImprovementBannerSeen()`; hide banner.
     - `onDismiss()` → `setImprovementBannerSeen()`; hide banner (no PATCH — safe default OFF).
   - `handleRegister` wrapper (for `AuthModal`): after `auth.register(...)` succeeds,
     best-effort `patchPrivacySettings({ ..., serviceAndHistory: true, menoImprovement:
     false, source: 'registration' })`; hide the banner.
   - `document_version` read from `GET /v1/legal/documents` on mount, as today.

4. **Input notice.** A thin line by the existing disclaimer in `ChatInput.jsx`
   (`.input-footer`): «Отправляя сообщение, вы принимаете [Политику конфиденциальности]»
   with a `<Link to="/privacy">`. Persistent — this is the "informed before the action".

5. **Registration notice.** In `AuthModal` register mode, a line under the submit:
   «Создавая аккаунт, вы принимаете [Пользовательское соглашение] и [Политику
   конфиденциальности]» — `<a target="_blank" rel="noopener">` links. **No checkbox.**
   Login mode unchanged.

6. **i18n (ru/en, parity guard).** Banner text + button labels + dismiss aria; input
   notice; registration notice. Retire the now-unused gate keys
   (`consentTitle`, `consentBody`, `consentDocsIntro`, `consentAllowImprovement`,
   `consentServiceOnly`, `consentError`) — or repurpose for the banner.

Unchanged and reused: `LegalDocumentView` / `LegalDocument` / `LegalPage` / `LegalLinks`,
routes, `api.js` wrappers (`getPrivacySettings` / `patchPrivacySettings` /
`getLegalDocument(s)`).

## Test plan (vitest, TDD)

- `consentGate.test.js`: drop the removed helpers; add
  `hasSeenImprovementBanner`/`setImprovementBannerSeen` round-trip (tolerant of
  missing/corrupt) and `shouldShowImprovementBanner` truth table (seen → false; server
  `serviceAndHistory:true` → false; otherwise true; unknown/`null` server → true).
- `ConsentBanner.test.jsx`: renders a non-modal region (no `aria-modal`); «Разрешить»
  → `onDecide(true)`, «Не сейчас» → `onDecide(false)`, X → `onDismiss()`; a policy link
  to `/privacy`.
- `AuthModal.test.jsx`: register mode shows the consent notice with terms/privacy links
  (correct `href`, `target=_blank`); login mode shows no notice; register submit is
  **not** blocked by any checkbox.
- Delete `ConsentGate.test.jsx`.
- App wiring (browser-verified): sending is never blocked; the banner shows non-blocking
  and hides after a choice/dismiss; «Разрешить»/«Не сейчас» PATCH the right
  `meno_improvement`; registration records service consent and hides the banner; the
  input + registration notices render with working document links.

## Out of scope / follow-ups

- `analysis_allowed` persistence per the storage rule (Stage 3).
- «Данные и конфиденциальность» settings section (improvement toggle → PATCH, delete
  history/account) — where registered users change the improvement choice later.
- Backend `consent_required` gate is **dropped** under this model (service consent is
  conclusive, not gated) — remove it from the RESUME list.
- Pre-launch: confirm notice/opt-in wording with NSU InfoSec.
