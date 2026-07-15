# Honest Stop UX, One-Shot Retry & Reactive Notices — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user "Stop" keeps the streamed text and shows a neutral "Остановлено" + one Retry; interrupted/errored turns never wipe content; every service notice re-translates live on a language switch; and there is never more than one Retry button (last message only, gone after one click or a new question).

**Architecture:** Terminal non-content outcomes stop being written into `message.content`. Instead a message carries a localizable descriptor `notice = { kind, key, params }` translated at render time via `t()`. Content is preserved verbatim. The user abort is split from the 120s timeout at the API layer (new `ChatAbortedError`). Retry is gated to the last message and re-runs a cleaned history (notice-bearing turns stripped) so it can't cascade.

**Tech Stack:** React 18 + Vite, vitest + @testing-library/react (jsdom, `globals: false`), i18n via `src/i18n.js` (`useTranslation` reactive `t`, `translateOnce` for services).

**Branch:** `feat/chat-stop-retry-notices` (already created; spec committed).

**Run a single test file:** `npx vitest run <path>` · **Full suite:** `npm test` · **Dev server (preview tools only, never Bash):** launch config name `dev`.

---

## File map

- Create `src/services/chatNotice.js` — notice descriptor builders + `formatNotice` (replaces `errorMessage.js`).
- Create `src/services/chatNotice.test.js` — replaces `errorMessage.test.js`.
- Create `src/services/chatTurns.js` — `buildOutgoingHistory`, `dropTrailingNotice`, `isInterruptedAssistant`.
- Create `src/services/chatTurns.test.js`.
- Create `src/i18n.test.js` — ru/en key-parity guard.
- Delete `src/services/errorMessage.js`, `src/services/errorMessage.test.js`.
- Modify `src/i18n.js` — new keys (ru/en) + `translationKeys(lang)` export.
- Modify `src/services/api.js` — `ChatAbortedError`, `abortErrorFor`, wire both catch sites.
- Create `src/services/api.abort.test.js` — `abortErrorFor` classification.
- Modify `src/components/reasoning.js` — `interrupted` status branch.
- Modify `src/components/reasoning.test.js` — cover `interrupted`.
- Modify `src/components/ReasoningBlock.jsx` — render neutral `interrupted` state.
- Modify `src/components/ReasoningBlock.test.jsx` — `interrupted` renders no spinner / no `!`.
- Modify `src/App.jsx` — `applyLastMessageNotice`, catch branch, history via `buildOutgoingHistory`, retry via `dropTrailingNotice`, arena notices.
- Modify `src/components/ChatArea.jsx` — `isLast` gating, `.message-notice` row, arena side notice, pass `interrupted` to `ReasoningBlock`.
- Create `src/components/ChatArea.test.jsx` — retry-gating + stopped-row render.
- Modify `src/components/ChatArea.css` — `.retry-btn` secondary button, `.message-notice` row.

---

## Task 1: i18n keys + parity guard

**Files:**
- Modify: `src/i18n.js` (add keys under both `ru` and `en`; add `translationKeys` export near `getLanguage`)
- Test: `src/i18n.test.js` (create)

- [ ] **Step 1: Add the `translationKeys` export**

In `src/i18n.js`, immediately after `export const getLanguage = () => currentLang;` add:

```js
// Test/introspection helper: the set of translation keys defined for a language.
// Used by the ru/en parity guard so a key added to one language but not the other
// fails CI instead of silently falling back at runtime.
export function translationKeys(lang) {
    return Object.keys(translations[lang] || {});
}
```

- [ ] **Step 2: Write the parity test**

Create `src/i18n.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { translationKeys } from './i18n.js';

describe('i18n ru/en parity', () => {
  it('defines exactly the same keys in ru and en', () => {
    const ru = new Set(translationKeys('ru'));
    const en = new Set(translationKeys('en'));
    const onlyRu = [...ru].filter((k) => !en.has(k));
    const onlyEn = [...en].filter((k) => !ru.has(k));
    expect({ onlyRu, onlyEn }).toEqual({ onlyRu: [], onlyEn: [] });
  });
});
```

- [ ] **Step 3: Run the parity test (documents current invariant)**

Run: `npx vitest run src/i18n.test.js`
Expected: PASS (existing ru/en are already symmetric). If it FAILS, the diff lists pre-existing drift — reconcile those keys first, then continue.

- [ ] **Step 4: Add the new keys to BOTH languages**

In the `ru` block of `translations`, after the existing `stopWaiting` line, add:

```js
        stopped: "Остановлено",
        modelRateLimited: "⚠ Модель ограничена по частоте до {hh}:{mm} (~{mins} мин). Попробуйте другую модель.",
        modelUnreachable: "⚠ Модель сейчас недоступна. Попробуйте другую модель.",
        coreModelUnavailable: "⚠ Внутренняя RAG-модель недоступна — бэкенд не может выполнить поиск.",
        arenaNoModels: "⚠ Нет доступных моделей для арены. Обновите и попробуйте снова.",
        arenaNeedTwoModels: "⚠ Для раунда арены нужно минимум две разные модели. Попробуйте чуть позже.",
        arenaPoolExhausted: "⚠ Не удалось провести раунд арены (модели закончились). Попробуйте чуть позже.",
        arenaModelNoAnswer: "⚠ Модель не вернула ответ. Попробуйте новый вопрос.",
        arenaModelSearchFailed: "⚠ Не удалось найти доступную модель после нескольких попыток.",
```

In the `en` block, after its `stopWaiting` line, add:

```js
        stopped: "Stopped",
        modelRateLimited: "⚠ Model is rate-limited until {hh}:{mm} (~{mins} min). Try another model.",
        modelUnreachable: "⚠ Model is currently unreachable. Try another model.",
        coreModelUnavailable: "⚠ Internal RAG model unavailable — backend cannot run retrieval.",
        arenaNoModels: "⚠ No available models for arena right now. Refresh to retry.",
        arenaNeedTwoModels: "⚠ Need at least two distinct models for an arena round. Try again in a moment.",
        arenaPoolExhausted: "⚠ Could not run an arena round (pool exhausted). Try again in a moment.",
        arenaModelNoAnswer: "⚠ The model returned no answer. Try a new question.",
        arenaModelSearchFailed: "⚠ Could not find an available model after several attempts.",
```

- [ ] **Step 5: Run the parity test again**

Run: `npx vitest run src/i18n.test.js`
Expected: PASS (added symmetrically to both languages).

- [ ] **Step 6: Commit**

```bash
git add src/i18n.js src/i18n.test.js
git commit -m "feat(i18n): keys for stop/error/arena notices + ru/en parity guard"
```

---

## Task 2: `chatNotice.js` — notice descriptors + reactive formatter

**Files:**
- Create: `src/services/chatNotice.js`
- Create: `src/services/chatNotice.test.js`
- Delete: `src/services/errorMessage.js`, `src/services/errorMessage.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/services/chatNotice.test.js`:

```js
import { afterEach, describe, it, expect } from 'vitest';
import { buildErrorNotice, buildStopNotice, formatNotice } from './chatNotice.js';
import { setLanguage, translateOnce } from '../i18n.js';

afterEach(() => setLanguage('ru'));

describe('buildStopNotice', () => {
  it('is a neutral stopped descriptor', () => {
    expect(buildStopNotice()).toEqual({ kind: 'stopped', key: 'stopped' });
  });
});

describe('buildErrorNotice — descriptor per code', () => {
  it('chat_timeout with load → overloadWithLoad + {n}', () => {
    expect(buildErrorNotice({ code: 'chat_timeout' }, { load: { showLoad: true, count: 12 } }))
      .toEqual({ kind: 'error', key: 'overloadWithLoad', params: { n: 12 } });
  });
  it('chat_timeout without load → overloadBusy', () => {
    expect(buildErrorNotice({ code: 'chat_timeout' }, { load: { showLoad: false, count: 2 } }))
      .toEqual({ kind: 'error', key: 'overloadBusy' });
  });
  it('chat_timeout with no load object → overloadBusy', () => {
    expect(buildErrorNotice({ code: 'chat_timeout' })).toEqual({ kind: 'error', key: 'overloadBusy' });
  });
  it('model_unreachable → modelUnreachable', () => {
    expect(buildErrorNotice({ code: 'model_unreachable' })).toEqual({ kind: 'error', key: 'modelUnreachable' });
  });
  it('core_model_unavailable → coreModelUnavailable', () => {
    expect(buildErrorNotice({ code: 'core_model_unavailable' })).toEqual({ kind: 'error', key: 'coreModelUnavailable' });
  });
  it('model_rate_limited (no until) → modelRateLimited with placeholder params', () => {
    expect(buildErrorNotice({ code: 'model_rate_limited', until: null }))
      .toEqual({ kind: 'error', key: 'modelRateLimited', params: { hh: '??', mm: '??', mins: '?' } });
  });
  it('unknown code → botUnavailable', () => {
    expect(buildErrorNotice({ code: 'whatever_else' })).toEqual({ kind: 'error', key: 'botUnavailable' });
  });
});

describe('formatNotice', () => {
  it('interpolates every param with an injected t', () => {
    const t = (k) => ({ overloadWithLoad: '~{n} in progress' }[k] || k);
    expect(formatNotice(t, { key: 'overloadWithLoad', params: { n: 12 } })).toBe('~12 in progress');
  });
  it('returns "" for a null notice', () => {
    expect(formatNotice((k) => k, null)).toBe('');
  });
  it('re-translates live when the language changes (real keys exist in ru & en)', () => {
    setLanguage('ru');
    expect(formatNotice(translateOnce, buildStopNotice())).toBe('Остановлено');
    setLanguage('en');
    expect(formatNotice(translateOnce, buildStopNotice())).toBe('Stopped');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/services/chatNotice.test.js`
Expected: FAIL — cannot resolve `./chatNotice.js`.

- [ ] **Step 3: Write the implementation**

Create `src/services/chatNotice.js`:

```js
// Terminal non-content outcomes (a user stop or a failed request) as *localizable
// descriptors* rather than resolved strings. The string is produced at render time
// by formatNotice(t, notice), so it re-translates on every UI language switch and
// never overwrites the streamed answer content.
//
//   notice = { kind: 'stopped' | 'error', key: <i18nKey>, params?: {…} }

export function buildStopNotice() {
  return { kind: 'stopped', key: 'stopped' };
}

// Map a failed-request error to an error descriptor. Known codes keep their
// tailored keys; everything else falls back to the friendly botUnavailable stub.
export function buildErrorNotice(error, { load } = {}) {
  const code = error?.code;

  if (code === 'chat_timeout') {
    if (load && load.showLoad) {
      return { kind: 'error', key: 'overloadWithLoad', params: { n: load.count } };
    }
    return { kind: 'error', key: 'overloadBusy' };
  }

  if (code === 'model_rate_limited') {
    const until = error.until ? new Date(error.until) : null;
    const hh = until ? String(until.getHours()).padStart(2, '0') : '??';
    const mm = until ? String(until.getMinutes()).padStart(2, '0') : '??';
    const mins = until ? Math.max(0, Math.round((until.getTime() - Date.now()) / 60000)) : '?';
    return { kind: 'error', key: 'modelRateLimited', params: { hh, mm, mins } };
  }

  if (code === 'model_unreachable') {
    return { kind: 'error', key: 'modelUnreachable' };
  }

  if (code === 'core_model_unavailable') {
    return { kind: 'error', key: 'coreModelUnavailable' };
  }

  return { kind: 'error', key: 'botUnavailable' };
}

// Resolve a notice to a display string. `t` is injected so the same helper works
// reactively (React's t from useTranslation) and once-off (translateOnce).
export function formatNotice(t, notice) {
  if (!notice) return '';
  let text = t(notice.key);
  const params = notice.params || {};
  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(String(value));
  }
  return text;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/chatNotice.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Delete the superseded module + test**

```bash
git rm src/services/errorMessage.js src/services/errorMessage.test.js
```

- [ ] **Step 6: Commit**

```bash
git add src/services/chatNotice.js src/services/chatNotice.test.js
git commit -m "feat(chat): notice descriptors + reactive formatNotice (replaces errorMessage)"
```

Note: `App.jsx` still imports `buildErrorMessage` here — it stops compiling until Task 7. That is fine; Tasks 3–6 don't run the app. If you prefer green-at-every-step, do Task 7 immediately after this one.

---

## Task 3: `chatTurns.js` — clean history + retry helpers

**Files:**
- Create: `src/services/chatTurns.js`
- Create: `src/services/chatTurns.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/services/chatTurns.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildOutgoingHistory, dropTrailingNotice, isInterruptedAssistant } from './chatTurns.js';

const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const AN = (content) => ({ role: 'assistant', content, notice: { kind: 'error', key: 'botUnavailable' } });
const AErr = (content) => ({ role: 'assistant', content, agentError: true }); // legacy persisted shape

describe('isInterruptedAssistant', () => {
  it('flags assistant messages with a notice / agentError / interrupted', () => {
    expect(isInterruptedAssistant(AN('x'))).toBe(true);
    expect(isInterruptedAssistant(AErr('x'))).toBe(true);
    expect(isInterruptedAssistant({ role: 'assistant', content: 'x', interrupted: true })).toBe(true);
  });
  it('does not flag clean answers, users, or arena wrappers', () => {
    expect(isInterruptedAssistant(A('ok'))).toBe(false);
    expect(isInterruptedAssistant(U('q'))).toBe(false);
    expect(isInterruptedAssistant({ role: 'assistant', isArena: true, notice: {} })).toBe(false);
  });
});

describe('buildOutgoingHistory', () => {
  it('keeps users and clean answers verbatim', () => {
    const msgs = [U('q1'), A('a1'), U('q2')];
    expect(buildOutgoingHistory(msgs)).toEqual(msgs);
  });
  it('strips interrupted/errored assistant turns (new and legacy)', () => {
    const msgs = [U('q1'), AN(''), U('q2'), AErr('Ой-ой')];
    expect(buildOutgoingHistory(msgs)).toEqual([U('q1'), U('q2')]);
  });
});

describe('dropTrailingNotice', () => {
  it('removes a trailing interrupted assistant', () => {
    expect(dropTrailingNotice([U('q'), AN('')])).toEqual([U('q')]);
    expect(dropTrailingNotice([U('q'), AErr('Ой-ой')])).toEqual([U('q')]);
  });
  it('is a no-op when the tail is a clean answer or a user message', () => {
    expect(dropTrailingNotice([U('q'), A('a')])).toEqual([U('q'), A('a')]);
    expect(dropTrailingNotice([U('q')])).toEqual([U('q')]);
  });
  it('is a no-op on an empty list', () => {
    expect(dropTrailingNotice([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/services/chatTurns.test.js`
Expected: FAIL — cannot resolve `./chatTurns.js`.

- [ ] **Step 3: Write the implementation**

Create `src/services/chatTurns.js`:

```js
// Turn-list helpers shared by the send/retry paths. Pure — unit-tested like
// chatWaitState.js.

// A non-arena assistant turn that ended without a real answer: a stop, an error,
// or a legacy persisted agentError message. These must not be sent back to the
// model as context (that leaks stale error text and, when retried mid-history,
// produces a request ending in an assistant turn — the "every request errors"
// cascade).
export function isInterruptedAssistant(message) {
  return (
    message?.role === 'assistant' &&
    !message.isArena &&
    !!(message.notice || message.agentError || message.interrupted)
  );
}

// The message list to send upstream: user turns and clean answers only.
export function buildOutgoingHistory(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter((m) => !isInterruptedAssistant(m));
}

// Retry re-runs the last turn: drop a trailing interrupted assistant so the list
// ends on the user question it belongs to. No-op otherwise.
export function dropTrailingNotice(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  return isInterruptedAssistant(last) ? messages.slice(0, -1) : messages;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/chatTurns.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/chatTurns.js src/services/chatTurns.test.js
git commit -m "feat(chat): pure history/retry helpers that strip interrupted turns"
```

---

## Task 4: `api.js` — split user stop from timeout

**Files:**
- Modify: `src/services/api.js` (add `ChatAbortedError` after `ChatTimeoutError` ~line 316; add `abortErrorFor`; wire the fetch catch ~377 and the read-loop catch ~570)
- Create: `src/services/api.abort.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/services/api.abort.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { abortErrorFor, ChatTimeoutError, ChatAbortedError } from './api.js';

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

describe('abortErrorFor', () => {
  it('maps the 120s timeout to ChatTimeoutError', () => {
    const e = abortErrorFor({ timeoutFired: true, error: abortError(), modelId: 'm' });
    expect(e).toBeInstanceOf(ChatTimeoutError);
    expect(e.code).toBe('chat_timeout');
  });
  it('maps a user abort (no timeout) to ChatAbortedError', () => {
    const e = abortErrorFor({ timeoutFired: false, error: abortError(), modelId: 'm' });
    expect(e).toBeInstanceOf(ChatAbortedError);
    expect(e.code).toBe('user_stopped');
  });
  it('passes a genuine network error through unchanged', () => {
    const net = new TypeError('Failed to fetch');
    expect(abortErrorFor({ timeoutFired: false, error: net, modelId: 'm' })).toBe(net);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/services/api.abort.test.js`
Expected: FAIL — `abortErrorFor` / `ChatAbortedError` are not exported.

- [ ] **Step 3: Add the error class + classifier**

In `src/services/api.js`, directly after the `ChatTimeoutError` class (ends ~line 316), add:

```js
export class ChatAbortedError extends Error {
    constructor(modelId) {
        super(`Chat aborted by user (model=${modelId || 'unknown'})`);
        this.name = 'ChatAbortedError';
        this.code = 'user_stopped';
    }
}

// Classify an abort of the streaming request. The internal aborter fires from
// exactly two sources: the 120s timeout (timeoutFired) or the external signal
// (the user's "Stop waiting"). A non-abort error passes through untouched.
export function abortErrorFor({ timeoutFired, error, modelId }) {
    if (timeoutFired) return new ChatTimeoutError(modelId);
    if (error?.name === 'AbortError') return new ChatAbortedError(modelId);
    return error;
}
```

- [ ] **Step 4: Wire the fetch catch**

In `sendChatMessage`, replace the fetch catch (currently):

```js
        } catch (err) {
            firstTokenTimer.clear();
            if (signal) signal.removeEventListener('abort', externalAbortHandler);
            if (timeoutFired || err?.name === 'AbortError') {
                throw new ChatTimeoutError(modelId);
            }
            throw err;
        }
```

with:

```js
        } catch (err) {
            firstTokenTimer.clear();
            if (signal) signal.removeEventListener('abort', externalAbortHandler);
            if (timeoutFired || err?.name === 'AbortError') {
                throw abortErrorFor({ timeoutFired, error: err, modelId });
            }
            throw err;
        }
```

- [ ] **Step 5: Wire the read-loop catch**

Further down, replace (currently):

```js
        if (readError) {
            if (timeoutFired || readError?.name === 'AbortError') {
                throw new ChatTimeoutError(modelId);
            }
            throw readError;
        }
```

with:

```js
        if (readError) {
            if (timeoutFired || readError?.name === 'AbortError') {
                throw abortErrorFor({ timeoutFired, error: readError, modelId });
            }
            throw readError;
        }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/services/api.abort.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/api.js src/services/api.abort.test.js
git commit -m "feat(api): distinguish user stop (ChatAbortedError) from the 120s timeout"
```

---

## Task 5: `reasoning.js` — interrupted status

**Files:**
- Modify: `src/components/reasoning.js` (`deriveReasoningStatus`)
- Modify: `src/components/reasoning.test.js`

- [ ] **Step 1: Write the failing test**

`src/components/reasoning.test.js` already imports `{ describe, it, expect }` and `deriveReasoningStatus`. Add this new `describe` block after the existing `describe('deriveReasoningStatus', …)` block (do NOT re-import):

```js
describe('deriveReasoningStatus — interrupted', () => {
  it('returns "stopped" when interrupted, ahead of streaming/error', () => {
    expect(deriveReasoningStatus({ interrupted: true, isStreaming: true })).toBe('stopped');
    expect(deriveReasoningStatus({ interrupted: true, agentError: true })).toBe('stopped');
  });
  it('is unchanged for the existing cases', () => {
    expect(deriveReasoningStatus({ agentError: true })).toBe('errored');
    expect(deriveReasoningStatus({ summary: { totalMs: 1 } })).toBe('done');
    expect(deriveReasoningStatus({ isStreaming: true })).toBe('running');
    expect(deriveReasoningStatus({ isStreaming: false })).toBe('done');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/reasoning.test.js`
Expected: FAIL — `deriveReasoningStatus({interrupted:true…})` returns `'errored'`/`'running'`, not `'stopped'`.

- [ ] **Step 3: Implement the branch**

In `src/components/reasoning.js`, change `deriveReasoningStatus` to:

```js
export function deriveReasoningStatus({ summary, agentError, isStreaming, interrupted }) {
  if (interrupted) return 'stopped';
  if (agentError) return 'errored';
  if (summary != null) return 'done';
  if (!isStreaming) return 'done';
  return 'running';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/reasoning.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/reasoning.js src/components/reasoning.test.js
git commit -m "feat(chat): reasoning status gains a neutral 'stopped' state"
```

---

## Task 6: `ReasoningBlock.jsx` — render the neutral interrupted state

**Files:**
- Modify: `src/components/ReasoningBlock.jsx`
- Modify: `src/components/ReasoningBlock.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to `src/components/ReasoningBlock.test.jsx`:

```js
it('renders a neutral interrupted header — no spinner, no "!"', () => {
  const { container, queryByText } = render(
    <ReasoningBlock stages={RUNNING} summary={null} interrupted={true} isStreaming={false} />
  );
  expect(container.firstChild).not.toBeNull();
  expect(container.querySelector('.spinning')).toBeNull();
  expect(container.querySelector('.loading-phrase')).toBeNull();
  expect(queryByText('!')).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ReasoningBlock.test.jsx`
Expected: FAIL — `interrupted` is ignored, so status is `running` (spinner + shimmer present).

- [ ] **Step 3: Implement the interrupted rendering**

In `src/components/ReasoningBlock.jsx`:

Change the signature to accept `interrupted`:

```js
export function ReasoningBlock({ stages = [], summary = null, agentError = false, isStreaming = false, reasoning = '', interrupted = false }) {
```

Pass it through:

```js
  const status = deriveReasoningStatus({ summary, agentError, isStreaming, interrupted });
```

Replace the header/icon `if/else` chain with a `stopped` branch added ahead of `errored`:

```js
  let header;
  let icon;
  if (status === 'running') {
    header = <LoadingPhrase />;
    icon = <Loader size={14} className="agent-thinking-icon spinning" />;
  } else if (status === 'stopped') {
    // Calm, factual: it *did* process for a while before the stop. No "!" and no
    // lingering "processing…" — the "Остановлено" notice row states the outcome.
    header = <span>{t('agentThoughtFor').replace('{time}', (totalMs / 1000).toFixed(1))}</span>;
    icon = <Stop size={13} className="agent-thinking-icon" style={{ color: 'var(--text-tertiary)' }} />;
  } else if (status === 'errored') {
    header = <span>{t('agentProcessing')}</span>;
    icon = <span className="agent-thinking-icon" style={{ color: 'var(--danger)' }}>!</span>;
  } else {
    header = <span>{t('agentThoughtFor').replace('{time}', (totalMs / 1000).toFixed(1))}</span>;
    icon = <CheckCircle size={14} className="agent-thinking-icon complete" />;
  }
```

Add `Stop` to the icon import at the top of the file:

```js
import { ChevronDown, Loader, CheckCircle, Check, Stop } from './icons.jsx';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ReasoningBlock.test.jsx`
Expected: PASS (all cases, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/components/ReasoningBlock.jsx src/components/ReasoningBlock.test.jsx
git commit -m "feat(chat): ReasoningBlock shows a calm stopped header (no spinner, no !)"
```

---

## Task 7: `App.jsx` — wire notices, stop branch, clean history, robust retry, arena

**Files:**
- Modify: `src/App.jsx`

No new unit test (App.jsx is glue with no harness); correctness of the extracted logic is covered by Tasks 2–4, and behavior is verified end-to-end in Task 10. Each step shows exact replacements.

- [ ] **Step 1: Swap the imports**

Replace:

```js
import { buildErrorMessage } from './services/errorMessage.js';
```

with:

```js
import { buildErrorNotice, buildStopNotice } from './services/chatNotice.js';
import { buildOutgoingHistory, dropTrailingNotice } from './services/chatTurns.js';
```

(Keep the existing `import { translateOnce as i18nLookup } from './i18n.js';` line — it still feeds the transient arena substitution hint.)

- [ ] **Step 2: Replace `applyLastMessageError` with `applyLastMessageNotice`**

Replace the whole `applyLastMessageError` function (from `function applyLastMessageError(` through its closing `}`) with:

```js
function applyLastMessageNotice(chats, chatId, notice, opts = {}) {
  return updateLastMessageInChat(chats, chatId, (message) => {
    if (!message) {
      return message;
    }

    // Arena: attach the notice to any side that produced no content; never
    // overwrite a side that did stream an answer.
    if (message.isArena) {
      const withNotice = (side) => (side.content ? side : { ...side, isStreaming: false, notice });
      return {
        ...message,
        arenaData: {
          ...message.arenaData,
          a: withNotice(message.arenaData.a),
          b: withNotice(message.arenaData.b),
        },
      };
    }

    if (message.role !== 'assistant') {
      return message;
    }

    // content is preserved verbatim — we never wipe what the user already saw.
    return {
      ...message,
      responseModelId: message.responseModelId || message.requestModelId || null,
      isStreaming: false,
      slowWarning: false,
      interrupted: true,
      notice,
      retry: { userText: opts.userText || '' },
    };
  });
}
```

- [ ] **Step 3: Build the outgoing history from clean turns (retry uses `dropTrailingNotice`)**

In `handleSendMessage`, replace:

```js
    const isRetry = !!retryOf;
    const userMessage = { role: 'user', content: trimmedText };
    const baseMessages = isRetry ? targetChat.messages.filter((m) => m !== retryOf) : targetChat.messages;
    const messageHistory = isRetry ? baseMessages : [...baseMessages, userMessage];
```

with:

```js
    const isRetry = !!retryOf;
    const userMessage = { role: 'user', content: trimmedText };
    // Retry re-runs the last turn: drop the trailing interrupted assistant so the
    // list ends on its user question. buildOutgoingHistory then strips any other
    // interrupted turns so stale error text never re-enters model context.
    const baseMessages = isRetry ? dropTrailingNotice(targetChat.messages) : [...targetChat.messages, userMessage];
    const messageHistory = buildOutgoingHistory(baseMessages);
```

- [ ] **Step 4: Mirror the drop in the visible message list**

A few lines below, replace:

```js
    setChats((prev) => updateChatById(prev, targetChatId, (chat) => {
      const nextMessages = isRetry ? chat.messages.filter((m) => m !== retryOf) : [...chat.messages, userMessage];
```

with:

```js
    setChats((prev) => updateChatById(prev, targetChatId, (chat) => {
      const nextMessages = isRetry ? dropTrailingNotice(chat.messages) : [...chat.messages, userMessage];
```

- [ ] **Step 5: Branch the catch on the user stop**

Replace the whole `catch (error) { … }` body (currently building `load` and calling `applyLastMessageError`) with:

```js
    } catch (error) {
      console.error(error);
      if (error?.code === 'user_stopped') {
        // Manual stop: keep whatever streamed, show a neutral "Stopped" notice and
        // a retry. No /v1/status probe, no model refresh — nothing failed.
        setChats((prev) => applyLastMessageNotice(prev, targetChatId, buildStopNotice(), { userText: trimmedText }));
      } else {
        // Overload UX: for a timeout, fetch live load so the message can show
        // "~N in progress" past the threshold. Retry re-runs this same user turn.
        const load =
          error?.code === 'chat_timeout'
            ? resolveOverload(await fetchServiceStatus())
            : resolveOverload(
                error?.httpStatus === 503
                  ? { active: error?.activeRequests, limit: error?.limit }
                  : {},
              );
        setChats((prev) => applyLastMessageNotice(prev, targetChatId, buildErrorNotice(error, { load }), { userText: trimmedText }));
        refreshModelsAndApplyState();
      }
    } finally {
```

- [ ] **Step 6: Arena — convert the top-level placeholder strings to notices**

In the arena branch, the three inserted non-arena fallback messages become notices (content stays `''`):

Replace `content: '⚠ No available models for arena right now. Refresh to retry.',` with:

```js
                content: '',
                notice: { kind: 'error', key: 'arenaNoModels' },
```

Replace `content: '⚠ Need at least two distinct models for an arena round. Try again in a moment.',` with:

```js
                content: '',
                notice: { kind: 'error', key: 'arenaNeedTwoModels' },
```

Replace `content: '⚠ Could not run an arena round (pool exhausted). Try again in a moment.',` with:

```js
                content: '',
                notice: { kind: 'error', key: 'arenaPoolExhausted' },
```

- [ ] **Step 7: Arena — per-side blank + error notices**

Replace the blank-response side update:

```js
              setChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
                ...sideState,
                model: null,
                isStreaming: false,
                content: sideState.content || '⚠ Модель не вернула ответ. Попробуйте новый вопрос.',
              })));
```

with:

```js
              setChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
                ...sideState,
                model: null,
                isStreaming: false,
                ...(sideState.content ? {} : { notice: { kind: 'error', key: 'arenaModelNoAnswer' } }),
              })));
```

Replace the side `catch` block:

```js
          } catch (error) {
            const isExhausted = error instanceof ArenaPoolExhaustedError;
            if (isExhausted) sideFailedExhaustion[sideKey] = true;
            const errorMessage = isExhausted
              ? '⚠ Could not find an available model after several attempts.'
              : buildErrorMessage(error);
            setChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
              ...sideState, isStreaming: false, content: sideState.content || errorMessage,
            })));
            refreshModelsAndApplyState();
          }
```

with:

```js
          } catch (error) {
            const isExhausted = error instanceof ArenaPoolExhaustedError;
            if (isExhausted) sideFailedExhaustion[sideKey] = true;
            const notice = isExhausted
              ? { kind: 'error', key: 'arenaModelSearchFailed' }
              : buildErrorNotice(error);
            setChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
              ...sideState, isStreaming: false, ...(sideState.content ? {} : { notice }),
            })));
            refreshModelsAndApplyState();
          }
```

- [ ] **Step 8: Verify nothing else references the removed symbols**

Run: `cd /Users/sckwoky/PycharmProjects/Meno-Web && rg -n "buildErrorMessage|applyLastMessageError|errorMessage\.js" src`
Expected: no matches (all migrated).

- [ ] **Step 9: Lint + full suite**

Run: `npm run lint && npm test`
Expected: lint clean; all tests pass (the deleted `errorMessage.test.js` is gone; new suites pass).

- [ ] **Step 10: Commit**

```bash
git add src/App.jsx
git commit -m "feat(chat): stop keeps content, clean-history retry, reactive arena notices"
```

---

## Task 8: `ChatArea.jsx` — one Retry (last message), notice row, arena side notice

**Files:**
- Modify: `src/components/ChatArea.jsx`
- Create: `src/components/ChatArea.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ChatArea.test.jsx`:

```js
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ChatArea from './ChatArea.jsx';
import { setLanguage } from '../i18n.js';

afterEach(() => { cleanup(); setLanguage('ru'); });

const baseProps = {
  isGenerating: false,
  onSendMessage: () => {},
  onRetry: vi.fn(),
  onStop: () => {},
  kbs: [],
  selectedKb: '',
  onKbChange: () => {},
  modelsAvailable: true,
  chatId: 'c1',
  setChats: () => {},
  voteIsPending: false,
};

const stopped = (content) => ({
  role: 'assistant', content, interrupted: true,
  notice: { kind: 'stopped', key: 'stopped' }, retry: { userText: 'q' },
});

describe('ChatArea — stop / retry', () => {
  it('shows "Остановлено", keeps streamed content, and offers one Retry (last only)', () => {
    const messages = [{ role: 'user', content: 'q' }, stopped('partial answer')];
    const { getAllByText, getByText } = render(<ChatArea {...baseProps} messages={messages} />);
    expect(getByText('Остановлено')).toBeTruthy();
    expect(getByText('partial answer')).toBeTruthy();
    expect(getAllByText('Повторить запрос')).toHaveLength(1);
  });

  it('never shows Retry on a message that is not the last', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      stopped('older interrupted'),   // not last → no retry
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'clean answer' },
    ];
    const { queryByText } = render(<ChatArea {...baseProps} messages={messages} />);
    expect(queryByText('Повторить запрос')).toBeNull();
  });

  it('the stopped row carries no "!" glyph', () => {
    const messages = [{ role: 'user', content: 'q' }, stopped('')];
    const { queryByText } = render(<ChatArea {...baseProps} messages={messages} />);
    expect(queryByText('!')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ChatArea.test.jsx`
Expected: FAIL — no "Остановлено" text (notice row not rendered yet); the old retry-panel gates on `agentError`.

- [ ] **Step 3: Import the formatter + icons**

At the top of `src/components/ChatArea.jsx` add to the existing imports:

```js
import { formatNotice } from '../services/chatNotice.js';
```

Add `Stop` and `AlertCircle` to the icon import:

```js
import { Copy, Check, ChevronDown, Brain, ExternalLink, Trophy, ArrowCircleLeft, ArrowCircleRight, Handshake, ThumbsDown, Stop, AlertCircle } from './icons.jsx';
```

- [ ] **Step 4: Pass `isLast` from the messages map**

In `ChatArea`, change the non-arena branch of the `messages.map(...)` return:

```js
                        return <MessageBubble key={index} message={msg} chatId={chatId} setChats={setChats} onRetry={onRetry} />;
```

to:

```js
                        return <MessageBubble key={index} message={msg} chatId={chatId} setChats={setChats} onRetry={onRetry} isLast={index === messages.length - 1} />;
```

- [ ] **Step 5: Render the notice row; gate Retry on `isLast`**

Change the `MessageBubble` signature:

```js
function MessageBubble({ message, chatId, setChats, onRetry, isLast }) {
```

Pass `interrupted` to the reasoning disclosure (treat legacy `agentError` as interrupted too). Replace:

```js
                <ReasoningBlock
                    stages={message.agentStages || []}
                    summary={message.agentSummary || null}
                    agentError={!!message.agentError}
                    isStreaming={!!message.isStreaming}
                    reasoning={reasoning}
                />
```

with:

```js
                <ReasoningBlock
                    stages={message.agentStages || []}
                    summary={message.agentSummary || null}
                    interrupted={!!message.interrupted || !!message.agentError}
                    isStreaming={!!message.isStreaming}
                    reasoning={reasoning}
                />
                {message.notice && (
                    <div className={`message-notice ${message.notice.kind}`}>
                        {message.notice.kind === 'stopped'
                            ? <Stop size={14} className="message-notice-icon" />
                            : <AlertCircle size={14} className="message-notice-icon" />}
                        <span className="message-notice-text">{formatNotice(t, message.notice)}</span>
                        {isLast && message.retry && (
                            <button type="button" className="retry-btn" onClick={() => onRetry?.(message)}>
                                {t('retryButton')}
                            </button>
                        )}
                    </div>
                )}
```

Remove the old retry panel entirely (delete this block):

```js
                {message.agentError && message.retry && (
                    <div className="retry-panel">
                        <button type="button" className="retry-btn" onClick={() => onRetry?.(message)}>
                            {t('retryButton')}
                        </button>
                    </div>
                )}
```

Note on placement: the notice row sits directly under the `ReasoningBlock` (the "status" area) and above the answer markdown — exactly where the "Обрабатываю…" status used to be — while the preserved answer renders below it.

- [ ] **Step 6: Arena — render a side's notice when it produced no content**

In `ArenaMessageBubble`, add `formatNotice` usage for each side. After the `segmentsA`/`segmentsB` renders, where each column shows `{arenaData.a.isStreaming && <LoadingPhrase />}`, change column A's content area so a notice shows when there is no content:

Replace column A's inner render:

```js
                        {segmentsA.map((seg, i) =>
                            seg.type === 'think' ? (
                                <ThinkBlock key={i} content={seg.content} thinkTime={seg.thinkTime} streaming={seg.streaming} />
                            ) : (
                                <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{seg.content}</ReactMarkdown>
                            )
                        )}
                        {arenaData.a.isStreaming && <LoadingPhrase />}
```

with:

```js
                        {segmentsA.map((seg, i) =>
                            seg.type === 'think' ? (
                                <ThinkBlock key={i} content={seg.content} thinkTime={seg.thinkTime} streaming={seg.streaming} />
                            ) : (
                                <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{seg.content}</ReactMarkdown>
                            )
                        )}
                        {!arenaData.a.content && arenaData.a.notice && (
                            <div className="message-notice error"><AlertCircle size={14} className="message-notice-icon" /><span className="message-notice-text">{formatNotice(t, arenaData.a.notice)}</span></div>
                        )}
                        {arenaData.a.isStreaming && <LoadingPhrase />}
```

Apply the identical change to column B (using `arenaData.b`).

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/components/ChatArea.test.jsx`
Expected: PASS (all three cases).

- [ ] **Step 8: Commit**

```bash
git add src/components/ChatArea.jsx src/components/ChatArea.test.jsx
git commit -m "feat(chat): single last-message Retry + reactive stop/error notice row"
```

---

## Task 9: `ChatArea.css` — integrated secondary button + notice row

**Files:**
- Modify: `src/components/ChatArea.css`

- [ ] **Step 1: Restyle `.retry-btn` and add `.message-notice`**

Replace the current `.retry-panel` / `.retry-btn` / `.retry-btn:hover` block (top of the file) with:

```css
.retry-panel {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    flex-wrap: wrap;
}
.retry-load {
    font-size: 0.85rem;
    opacity: 0.8;
}

/* Terminal status row (stopped / error), sitting where the "Обрабатываю…" status
   was. Icon + localized text + an optional inline Retry. */
.message-notice {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.35rem 0 0.5rem;
    font-size: 0.85rem;
    color: var(--text-secondary);
}
.message-notice.error {
    color: var(--danger);
}
.message-notice-icon {
    flex-shrink: 0;
}
.message-notice-text {
    flex-shrink: 1;
}

/* Retry: a proper secondary button in the site's language — bordered surface that
   darkens to --bg-tertiary on hover, same treatment as .agent-thinking-summary. */
.retry-btn {
    margin-left: 0.25rem;
    padding: 0.3rem 0.85rem;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.retry-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border-color: var(--text-tertiary);
}
.retry-btn:active {
    transform: translateY(0.5px);
}
```

- [ ] **Step 2: Verify the vars exist**

Run: `cd /Users/sckwoky/PycharmProjects/Meno-Web && rg -n "^\s*--(text-primary|text-secondary|text-tertiary|bg-secondary|bg-tertiary|border-color|danger)\b" src/index.css | head`
Expected: each variable is defined (used elsewhere in `index.css`). `--text-primary` is the base text var; if the grep shows it absent, use `var(--text-secondary)` in the `:hover` rule instead.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChatArea.css
git commit -m "style(chat): Retry becomes a site-integrated secondary button; notice row"
```

---

## Task 10: Full verification (suite + lint + live browser)

**Files:** none (verification only)

- [ ] **Step 1: Full suite + lint**

Run: `cd /Users/sckwoky/PycharmProjects/Meno-Web && npm test && npm run lint`
Expected: all tests pass; lint clean.

- [ ] **Step 2: Launch the dev server via the preview tool**

Ensure `.claude/launch.json` has a `dev` config (`npm run dev`, Vite default port 5173); start it with `preview_start { name: "dev" }`. Never start the server with Bash.

- [ ] **Step 3: Drive the stop flow**

Send a question; once tokens begin streaming, click the Stop control. Verify with `read_page` / screenshot:
- the streamed text is still present (not wiped),
- a neutral `Остановлено` row sits where the status was, with **no** `!`,
- exactly one `Повторить запрос` button, styled as a bordered secondary button that darkens on hover (`hover` via `computer`),
- clicking Retry removes the button and re-runs the same question (one button max throughout).

- [ ] **Step 4: Drive the error + language flows**

Force an error (e.g. select a model that 5xx/timeouts, or stop the backend): confirm the localized message shows with one Retry and preserved content. Toggle the UI language RU↔EN via the language control and confirm the notice text switches **live** (the `botUnavailable` and `overloadBusy`/`overloadWithLoad` strings, and the `⚠` code strings, all re-translate). Then send a brand-new question and confirm the prior Retry is gone.

- [ ] **Step 5: Check the console/network are clean**

Use `read_console_messages` (onlyErrors) and `read_network_requests`: the stop path fires **no** `/v1/status` request; no uncaught errors.

- [ ] **Step 6: Finish the branch**

Invoke superpowers:finishing-a-development-branch to choose merge / PR / cleanup.

---

## Self-review

**Spec coverage:**
- Stop ≠ timeout → Task 4. Content preserved on stop *and* error → Task 2 (notice model) + Task 7 (`applyLastMessageNotice` never sets `content`). "Остановлено" in the status area, no `!` → Tasks 6, 8. Inline status+button row → Tasks 8, 9. One Retry, last message only, gone on new question / after one click → Task 8 (`isLast` gate) + Task 7 (`dropTrailingNotice`). Cascade fix → Task 3 (`buildOutgoingHistory`) + Task 7. Reactive localization incl. error codes + arena → Tasks 1, 2, 7, 8. Secondary-button styling with hover-darken → Task 9. Tests → every task; browser verification → Task 10.
- Out-of-scope items (transient `arenaModelSwitched`, no localStorage migration) respected; legacy `agentError` messages handled gracefully by `isInterruptedAssistant` and the `interrupted || agentError` prop.

**Placeholder scan:** none — every code step carries full code; every run step has an expected result.

**Type/name consistency:** `notice = { kind, key, params? }`, `buildErrorNotice`, `buildStopNotice`, `formatNotice(t, notice)`, `buildOutgoingHistory`, `dropTrailingNotice`, `isInterruptedAssistant`, `abortErrorFor`, `ChatAbortedError`, `applyLastMessageNotice`, `interrupted` prop, `.message-notice` / `.retry-btn` classes — all used identically across tasks.
