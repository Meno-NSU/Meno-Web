# Friendly Localized Error Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw, English-only catch-all error shown to users with a single friendly, localized fallback, without changing any existing specific error mappings.

**Architecture:** Extract the existing `buildErrorMessage` from `App.jsx` into a small pure module `src/services/errorMessage.js` (unit-testable like the other `src/services/*`), change only its catch-all branch to return a localized `botUnavailable` string via `translateOnce`, and add the `botUnavailable` key to both language blocks in `src/i18n.js`. No backend changes.

**Tech Stack:** React + Vite, `vitest` (jsdom env, global), existing `src/i18n.js` (`translateOnce`/`setLanguage`).

**Base branch:** `feat/friendly-error-fallback` (off `claude/backend-feature-alignment`, which contains the current `buildErrorMessage` and the `translateOnce` i18n infra — these do NOT exist on `main`).

---

## File Structure

- `src/i18n.js` — **modify**: add `botUnavailable` to the `ru` block (after `error:`, line 15) and the `en` block (after `error:`, line 129).
- `src/services/errorMessage.js` — **create**: exports `buildErrorMessage(error)`, moved verbatim from `App.jsx` with only the catch-all branch changed. Imports `translateOnce` from `../i18n.js`.
- `src/services/errorMessage.test.js` — **create**: vitest unit tests.
- `src/App.jsx` — **modify**: remove the local `buildErrorMessage` (lines 47–68); add `import { buildErrorMessage } from './services/errorMessage.js';`. Keep the existing `import { translateOnce as i18nLookup } from './i18n.js';` (still used elsewhere, e.g. `arenaModelSwitched`). The catch path already calls `console.error(error)` (line ~975), so the raw error stays visible to developers — no logging change needed.

---

### Task 1: Localized fallback module (with the i18n key) — TDD

**Files:**
- Modify: `src/i18n.js:15` (ru) and `src/i18n.js:129` (en)
- Create: `src/services/errorMessage.js`
- Test: `src/services/errorMessage.test.js`

- [ ] **Step 1: Add the `botUnavailable` i18n key to both languages**

In `src/i18n.js`, in the `ru` block, immediately after the line:
```js
        error: "Ошибка: не удалось получить ответ",
```
add:
```js
        botUnavailable: "Ой-ой! Кажется, я сейчас не в форме и не могу ответить. Меня уже чинят — загляните, пожалуйста, чуть позже.",
```

In the `en` block, immediately after the line:
```js
        error: "Error: Failed to get response",
```
add:
```js
        botUnavailable: "Oops! Something went wrong on my side and I can't answer right now. I'm being fixed — please check back a little later.",
```

- [ ] **Step 2: Write the failing test**

Create `src/services/errorMessage.test.js`:
```js
import { afterEach, describe, it, expect } from 'vitest';
import { buildErrorMessage } from './errorMessage.js';
import { setLanguage } from '../i18n.js';

afterEach(() => {
  setLanguage('ru'); // restore the default language between tests
});

describe('buildErrorMessage — friendly localized fallback', () => {
  it('returns the friendly RU stub for an unknown backend error code', () => {
    setLanguage('ru');
    const msg = buildErrorMessage({
      code: 'service_unavailable',
      message: 'RAG resources are not initialized.',
    });
    expect(msg).toContain('Меня уже чинят');
    expect(msg).not.toContain('RAG resources'); // raw developer message never leaks
    expect(msg).not.toContain('⚠');
  });

  it('returns the friendly EN stub when the UI language is English', () => {
    setLanguage('en');
    const msg = buildErrorMessage({ code: 'some_unmapped_code' });
    expect(msg).toContain("I'm being fixed");
    expect(msg).not.toContain('⚠');
  });

  it('leaves the known error codes unchanged', () => {
    setLanguage('en');
    expect(buildErrorMessage({ code: 'model_unreachable' })).toContain('unreachable');
    expect(buildErrorMessage({ code: 'core_model_unavailable' })).toContain('Internal RAG model');
    expect(buildErrorMessage({ code: 'model_rate_limited', until: null })).toContain('rate-limited');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/services/errorMessage.test.js`
Expected: FAIL — `Failed to resolve import "./errorMessage.js"` (module does not exist yet).

- [ ] **Step 4: Create the module**

Create `src/services/errorMessage.js`:
```js
import { translateOnce } from '../i18n.js';

// Maps a failed-request error to a user-facing message. Specific, known codes
// keep their tailored messages; every other (unmapped) error returns a single
// friendly, localized fallback so users never see a raw backend string.
//
// Localized strings are resolved at error time and written into chat state once;
// they are not retroactively re-translated on a later language switch.
export function buildErrorMessage(error) {
  if (error.code === 'chat_timeout') {
    return `⚠ ${translateOnce('chatTimeoutWarning')}`;
  }
  if (error.code === 'model_rate_limited') {
    const until = error.until ? new Date(error.until) : null;
    const hh = until ? String(until.getHours()).padStart(2, '0') : '??';
    const mm = until ? String(until.getMinutes()).padStart(2, '0') : '??';
    const mins = until ? Math.max(0, Math.round((until.getTime() - Date.now()) / 60000)) : null;
    return `⚠ Model is rate-limited until ${hh}:${mm}${mins !== null ? ` (~${mins} min)` : ''}. Try another model.`;
  }
  if (error.code === 'model_unreachable') {
    return `⚠ Model is currently unreachable. Try another model.`;
  }
  if (error.code === 'core_model_unavailable') {
    return `⚠ Internal RAG model unavailable — backend cannot run retrieval.`;
  }
  return translateOnce('botUnavailable');
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/services/errorMessage.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/i18n.js src/services/errorMessage.js src/services/errorMessage.test.js
git commit -m "feat(errors): friendly localized fallback for unmapped backend errors"
```

---

### Task 2: Wire `App.jsx` to the extracted module

**Files:**
- Modify: `src/App.jsx` (import near line 32; remove local function at lines 47–68)

- [ ] **Step 1: Add the import**

In `src/App.jsx`, immediately after the existing line:
```js
import { translateOnce as i18nLookup } from './i18n.js';
```
add:
```js
import { buildErrorMessage } from './services/errorMessage.js';
```
(Keep the `i18nLookup` import — it is still used elsewhere in `App.jsx`.)

- [ ] **Step 2: Remove the now-duplicated local function**

Delete the entire local `buildErrorMessage` definition in `src/App.jsx` (the `function buildErrorMessage(error) { … }` block, lines 47–68 — the one starting with the `chat_timeout` branch and ending with the catch-all `return`). The two call sites (`const errorMessage = buildErrorMessage(error)` and `: buildErrorMessage(error)`) now resolve to the imported function.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all existing tests plus `errorMessage.test.js`. No suite references the removed local function.

- [ ] **Step 4: Lint and build to verify the new import resolves**

Run: `npm run lint && npm run build`
Expected: lint passes and the build succeeds (confirms `./services/errorMessage.js` import path is correct and there is no leftover reference to the removed function).

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "refactor(app): use extracted buildErrorMessage module"
```

---

### Task 3: Manual verification in the running app

- [ ] **Step 1: Start the dev server and confirm the friendly stub**

Run `npm run dev`. With the backend returning `503 service_unavailable` (RAG resources not loaded), send a chat message and confirm the assistant bubble shows the friendly stub (not `⚠ RAG resources are not initialized.`). Switch the UI language between RU and EN before triggering the error and confirm the message appears in the matching language. Confirm the raw error is still printed in the browser devtools console (`console.error`).

- [ ] **Step 2: No commit** (verification only).

---

## Notes

- **No backend changes.** The backend already returns a machine-readable `code` via `_error_response(status, message, code)`; the frontend keys off it.
- **Out of scope (possible follow-up):** translating the still-English specific messages (`model_rate_limited`, `model_unreachable`, `core_model_unavailable`).
