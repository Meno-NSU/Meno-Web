# Design: «Данные и конфиденциальность» settings section

Date: 2026-07-22
Status: Approved design
Initiative: Meno privacy / 152-ФЗ — Stage 2b (frontend), slice 4
Stacked on `feat/privacy-stage2b-soft-consent` (PR #32).

## Goal

A settings surface where any user (guest or registered) can review and change their
data choices: toggle the improvement/analysis opt-in, and clear their local chat
history. Reachable from the sidebar footer next to the legal links.

## Current behavior / constraints

- No settings surface exists. `SettingsBar` has a signed-in-only user menu; the sidebar
  footer holds `LegalLinks` (reachable by guests too).
- `services/api.js` already has `getPrivacySettings()` / `patchPrivacySettings()`.
  `store/chatStore.js#clearChats()` clears local history (App uses it in `handleLogout`).
- **Backend deletion does not exist yet:** the only data endpoint is per-chat
  `POST /v1/chat/completions/clear_history`. No account deletion, no bulk erasure. So
  server-side "delete my account / all data" is **Stage-4-blocked** and out of scope here.

## Design (frontend only, Meno-Web)

1. **`components/PrivacySettingsModal.jsx` (+ `.css`)** — a dismissible modal (the
   `AuthModal`/`SurveyModal` pattern: overlay + card, X / Esc / backdrop close).
   Presentational — App owns the async. Props: `{ isOpen, onClose, improvementEnabled,
   onToggleImprovement, onClearHistory }`. Contents:
   - **Improvement toggle** — a labelled switch reflecting `improvementEnabled`; clicking
     it calls `onToggleImprovement(!improvementEnabled)`.
   - **Clear local history** — a button with an inline two-step confirm (click → "точно?"
     [да] / [отмена]); confirm calls `onClearHistory()`.
   - **Document links** — the three docs as `<a target="_blank" rel="noopener">` (new tab,
     non-disruptive), reusing the `consentRead*` labels.

2. **`App.jsx`**:
   - `isPrivacySettingsOpen` state; `improvementEnabled` state (`null` until known).
   - On opening: `getPrivacySettings()` → set `improvementEnabled` (fresh read).
   - `handleToggleImprovement(next)` → best-effort `patchPrivacySettings({ documentVersion,
     serviceAndHistory: true, menoImprovement: next, source: 'settings' })`; optimistically
     set `improvementEnabled(next)` (revert on failure).
   - `handleClearLocalHistory()` → `clearChats()` + reset to a fresh chat (as `handleLogout`
     does, minus the logout); close the modal.
   - Render `<PrivacySettingsModal>`.

3. **`Sidebar.jsx`** — a «Данные и конфиденциальность» button in the footer, above
   `LegalLinks`, calling a new `onOpenPrivacySettings` prop. Available to everyone.

4. **i18n (ru/en, parity guard):** section title, improvement label + hint, clear-history
   button + inline-confirm labels, cancel, and the sidebar entry label.

## Test plan (vitest, TDD)

- `PrivacySettingsModal.test.jsx`: renders nothing when closed; the toggle reflects
  `improvementEnabled` and clicking it calls `onToggleImprovement` with the negated value;
  the clear button requires the inline confirm before calling `onClearHistory` (cancel
  does not); three document links with correct `href` + `target=_blank`; X / Esc / backdrop
  call `onClose`.
- App wiring + the sidebar entry button are browser-verified (open from the sidebar →
  toggle → `settings` PATCH; clear → chats gone).

## Out of scope / follow-ups (Stage 4)

- Server-side account deletion, bulk server-history erasure, and the 152-ФЗ withdrawal /
  right-to-erasure flow — need backend endpoints (Stage 4). The modal grows a "delete
  account / all data" control once those land.
- Final wording sign-off with NSU InfoSec (pre-launch).
