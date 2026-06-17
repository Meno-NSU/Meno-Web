# Friendly localized error fallback

**Date:** 2026-06-17
**Repo:** Meno-Web (frontend)
**Status:** Design approved; spec under review

## Problem

When a chat/arena request fails with a backend error **code the frontend does not
explicitly handle**, `buildErrorMessage` in `src/App.jsx` echoes the backend's raw
developer message verbatim — e.g. `⚠ RAG resources are not initialized.` That string
is:

- **not localized** — always English, ignores the selected UI language; and
- a **raw internal/developer message** end users should never see.

Observed when the backend returned `503 service_unavailable` (RAG stand resources
failed to load on startup), but it applies to **any** unmapped error code.

## Goal

End users never see a raw, non-localized backend error. Any *unhandled* failure
shows a single friendly, localized fallback that reflects the active UI language.

## Scope — "all unknown errors" (chosen)

- Replace **only** the catch-all fallback in `buildErrorMessage`.
- Leave the existing specific mappings unchanged: `chat_timeout`,
  `model_rate_limited`, `model_unreachable`, `core_model_unavailable`.
- **No backend changes.** The backend already returns a machine-readable `code`
  via `_error_response(status, message, code)` — that contract is correct and is
  what the frontend keys off.

**Out of scope (possible follow-up):** translating the existing English-only
specific messages (`model_rate_limited` / `model_unreachable` /
`core_model_unavailable`). Noted, not done here.

## Design

### 1. `src/i18n.js` — new key `botUnavailable` in both language blocks

| lang | text |
|------|------|
| `ru` | `Ой-ой! Кажется, я сейчас не в форме и не могу ответить. Меня уже чинят — загляните, пожалуйста, чуть позже.` |
| `en` | `Oops! Something went wrong on my side and I can't answer right now. I'm being fixed — please check back a little later.` |

No leading `⚠` — the friendly tone replaces the warning glyph.

### 2. Extract `buildErrorMessage` into `src/services/errorMessage.js`

`buildErrorMessage` is currently a private function in `App.jsx`. Move it as-is
into a small pure module so it can be unit-tested in isolation, matching the
existing `src/services/*.test.js` pattern. The module imports
`translateOnce` from `../i18n.js`; `App.jsx` imports `buildErrorMessage` from the
new module (and keeps its own `translateOnce as i18nLookup` import for other call
sites, e.g. `arenaModelSwitched`).

### 3. The fallback itself

In the moved function, replace the catch-all:

```js
// before
return `⚠ ${error.message || 'Request failed.'}`;
// after
return translateOnce('botUnavailable');
```

`translateOnce(key)` resolves against the active language (`getLanguage()`), so the
message localizes at error time — consistent with the existing `chat_timeout`
branch.

### 4. Developer visibility

The user-facing message no longer carries the raw error. Confirm the original
`error` (its `code`/`message`) still reaches `console.error` on the failure path so
debugging is unaffected; add a `console.error(error)` in the catch path if absent.

## Localization-at-error-time behavior

The fallback string is written into chat state once, in whatever language was
active at error time; it does **not** retroactively re-translate on a later
language switch. Intentional, and matches existing behavior (see the comment near
the `chat_timeout` branch in the current `App.jsx`).

## Testing (vitest)

Add `src/services/errorMessage.test.js`:

- unknown `code` → returns the `botUnavailable` string, asserted for **both**
  `ru` and `en` (via `setLanguage`);
- each of the four known codes (`chat_timeout`, `model_rate_limited`,
  `model_unreachable`, `core_model_unavailable`) is **unaffected** (still returns
  its existing message);
- the fallback string contains no raw `error.message` and no `⚠`.

Run with `npm test`.

## Files touched

- `src/i18n.js` — add `botUnavailable` to `ru` and `en`.
- `src/services/errorMessage.js` — **new**, holds `buildErrorMessage`.
- `src/App.jsx` — remove local `buildErrorMessage`, import from the new module;
  ensure `console.error(error)` on the failure path.
- `src/services/errorMessage.test.js` — **new** vitest unit tests.
