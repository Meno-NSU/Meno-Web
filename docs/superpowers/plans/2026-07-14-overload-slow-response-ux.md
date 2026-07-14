# Graceful Overload / Slow-Response UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reassure users when Menon is slow (40s notice), give a clear overload state with an approximate load figure and one-click retry of the same question at 120s, and offer retry on any interrupted answer — RU + EN.

**Architecture:** Backend (RAG-Core) exposes a tiny read-only `GET /v1/status` returning live admission load. Frontend (Meno-Web) puts all timing/threshold policy in a pure, unit-tested `chatWaitState.js` (two-stage timers: 40s `slow_warning` SSE-side event, 120s abort), fetches load on failure, and renders a slow banner, an overload/retry panel, and a Stop-waiting control.

**Tech Stack:** Backend: FastAPI, pytest, uv. Frontend: React 19, Vite, vitest, eslint.

**Repos / branches:** Phase A in RAG-Core (`/Users/sckwoky/Projects/RAG-Core`, branch `feat/status-endpoint`). Phase B in Meno-Web (`/Users/sckwoky/PycharmProjects/Meno-Web`, branch `feat/overload-slow-response-ux`, already created — the spec lives there). Do Phase A first and push it, so Phase B can hit a real endpoint.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `RAG-Core: src/meno_rag/api/main.py` | HTTP routes | Add `GET /v1/status`; enrich `_overloaded_response` |
| `RAG-Core: tests/test_status.py` | endpoint test | Create |
| `Meno-Web: src/services/chatWaitState.js` | pure timing/threshold policy | Create |
| `Meno-Web: src/services/chatWaitState.test.js` | unit tests | Create |
| `Meno-Web: src/i18n.js` | RU/EN copy | Add keys |
| `Meno-Web: src/services/errorMessage.js` | error→message mapping | Extend `chat_timeout` for overload |
| `Meno-Web: src/services/errorMessage.test.js` | mapping tests | Extend |
| `Meno-Web: src/services/api.js` | send + timers + load fetch | Two-stage timers, `fetchServiceStatus` |
| `Meno-Web: src/App.jsx` | orchestration | slow_warning handling, load fetch on error, retry/stop wiring |
| `Meno-Web: src/components/ChatArea.jsx` | render | Slow banner, Retry button, load line, Stop control; thread `onRetry`/`onStop` |

**Test commands:** RAG-Core: `uv run --frozen pytest tests/test_status.py -q` (+ `ruff check .`, `mypy`). Meno-Web: `npx vitest run <file>`, `npm run build`, `npx eslint <files>`.

---

## Phase A — Backend (RAG-Core)

### Task A1: `GET /v1/status` endpoint

**Files:**
- Modify: `src/meno_rag/api/main.py` (add route after `healthz`, ~line 412)
- Test: `tests/test_status.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_status.py`:
```python
from fastapi.testclient import TestClient

from meno_rag.api.admission import AdmissionController


def test_status_reports_active_and_limit():
    from meno_rag.api import main as main_mod

    with TestClient(main_mod.app) as c:
        c.app.state.admission = AdmissionController(256)
        assert c.app.state.admission.try_acquire() is True  # active -> 1
        r = c.get("/v1/status")

    assert r.status_code == 200
    assert r.json() == {"active_requests": 1, "limit": 256}


def test_status_degrades_when_admission_missing():
    from meno_rag.api import main as main_mod

    with TestClient(main_mod.app) as c:
        c.app.state.admission = None
        r = c.get("/v1/status")

    assert r.status_code == 200
    assert r.json() == {"active_requests": 0, "limit": 0}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --frozen pytest tests/test_status.py -q`
Expected: FAIL — `GET /v1/status` returns 404. (Locally on macOS the lifespan loads FRIDA; if it segfaults, move `resources/stand_nsu/knowledge/faiss_frida.index` aside so startup degrades — same as the survey verification. CI/Linux is unaffected.)

- [ ] **Step 3: Add the route**

In `src/meno_rag/api/main.py`, immediately after the `healthz` function (before `@app.get("/v1/models")` at line 414), add:
```python
@app.get("/v1/status")
async def service_status(request: Request):
    # Lightweight load signal for the frontend's overload UX. Read-only, no DB,
    # no auth: just the live admission counters.
    admission = getattr(request.app.state, "admission", None)
    if admission is None:
        return {"active_requests": 0, "limit": 0}
    return {"active_requests": admission.active, "limit": admission.max_concurrent}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run --frozen pytest tests/test_status.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
cd /Users/sckwoky/Projects/RAG-Core && git checkout -b feat/status-endpoint
git add src/meno_rag/api/main.py tests/test_status.py
git commit -m "feat(api): read-only GET /v1/status with admission load"
```

### Task A2: Enrich the overload 503 payload

**Files:**
- Modify: `src/meno_rag/api/main.py:620` (call site) and `_overloaded_response` (~line 1213)
- Test: `tests/test_status.py` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_status.py`:
```python
def test_overloaded_response_includes_load():
    from meno_rag.api.main import _overloaded_response

    resp = _overloaded_response(active=256, limit=256)
    import json

    body = json.loads(bytes(resp.body))
    assert body["error"]["code"] == "overloaded"
    assert body["error"]["active_requests"] == 256
    assert body["error"]["limit"] == 256
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --frozen pytest tests/test_status.py::test_overloaded_response_includes_load -q`
Expected: FAIL — `_overloaded_response()` takes no `active`/`limit` args (TypeError).

- [ ] **Step 3: Add the params + fields**

Replace `_overloaded_response` (currently `def _overloaded_response(retry_after_sec: int = 5) -> JSONResponse:` and its body) with:
```python
def _overloaded_response(
    retry_after_sec: int = 5, *, active: int | None = None, limit: int | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        headers={"Retry-After": str(retry_after_sec)},
        content={
            "error": {
                "message": "Сервис временно перегружен. Повторите запрос через несколько секунд.",
                "type": "server_error",
                "code": "overloaded",
                "retry_after_sec": retry_after_sec,
                "active_requests": active,
                "limit": limit,
            }
        },
    )
```
Then update the call site at `main.py:620`:
```python
        return _overloaded_response()
```
to:
```python
        return _overloaded_response(active=admission.active, limit=admission.max_concurrent)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run --frozen pytest tests/test_status.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Gate + commit**

Run: `uv run --frozen ruff check src/meno_rag/api/main.py tests/test_status.py && uv run --frozen mypy`
Expected: clean.
```bash
git add src/meno_rag/api/main.py tests/test_status.py
git commit -m "feat(api): include active_requests/limit in 503 overload payload"
```

- [ ] **Step 6: Push Phase A** (so Phase B can hit it)

```bash
git push origin feat/status-endpoint
```
Then open/merge per your normal flow. Note the endpoint path `/v1/status` for Phase B.

---

## Phase B — Frontend (Meno-Web)

All commands run from `/Users/sckwoky/PycharmProjects/Meno-Web` on branch `feat/overload-slow-response-ux`.

### Task B1: Pure policy module `chatWaitState.js`

**Files:**
- Create: `src/services/chatWaitState.js`
- Test: `src/services/chatWaitState.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/services/chatWaitState.test.js`:
```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SLOW_WARNING_MS,
  RESPONSE_TIMEOUT_MS,
  LOAD_DISPLAY_THRESHOLD,
  resolveOverload,
  createWaitTimers,
} from './chatWaitState.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveOverload — show the load figure only past the threshold', () => {
  it('hides the count below the threshold', () => {
    expect(resolveOverload({ active: LOAD_DISPLAY_THRESHOLD - 1, limit: 256 })).toEqual({
      showLoad: false,
      count: LOAD_DISPLAY_THRESHOLD - 1,
      limit: 256,
    });
  });

  it('shows the count at/above the threshold', () => {
    expect(resolveOverload({ active: LOAD_DISPLAY_THRESHOLD, limit: 256 })).toEqual({
      showLoad: true,
      count: LOAD_DISPLAY_THRESHOLD,
      limit: 256,
    });
  });

  it('defaults missing/garbage input to a hidden zero count', () => {
    expect(resolveOverload()).toEqual({ showLoad: false, count: 0, limit: null });
    expect(resolveOverload({ active: 'x' })).toEqual({ showLoad: false, count: 0, limit: null });
  });
});

describe('createWaitTimers — 40s warning then 120s timeout, both cancellable', () => {
  it('fires the slow warning at SLOW_WARNING_MS and the timeout at RESPONSE_TIMEOUT_MS', () => {
    vi.useFakeTimers();
    const onSlowWarning = vi.fn();
    const onTimeout = vi.fn();
    createWaitTimers({ onSlowWarning, onTimeout });

    vi.advanceTimersByTime(SLOW_WARNING_MS);
    expect(onSlowWarning).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(RESPONSE_TIMEOUT_MS - SLOW_WARNING_MS);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('clear() cancels both callbacks', () => {
    vi.useFakeTimers();
    const onSlowWarning = vi.fn();
    const onTimeout = vi.fn();
    const timers = createWaitTimers({ onSlowWarning, onTimeout });
    timers.clear();

    vi.advanceTimersByTime(RESPONSE_TIMEOUT_MS + 1000);
    expect(onSlowWarning).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/services/chatWaitState.test.js`
Expected: FAIL — cannot import from `./chatWaitState.js` (module missing).

- [ ] **Step 3: Implement the module**

Create `src/services/chatWaitState.js`:
```js
// Pure policy for the slow/overloaded chat experience: the two wait thresholds,
// the load-display threshold, and small helpers. No React, no DOM beyond
// setTimeout — so it unit-tests like surveyGate.js.

export const SLOW_WARNING_MS = 40_000;
export const RESPONSE_TIMEOUT_MS = 120_000;
export const LOAD_DISPLAY_THRESHOLD = 5;

// Decide whether to show the approximate load figure and normalise the count.
export function resolveOverload({ active, limit } = {}) {
  const count = Number.isFinite(active) ? active : 0;
  return {
    showLoad: count >= LOAD_DISPLAY_THRESHOLD,
    count,
    limit: Number.isFinite(limit) ? limit : null,
  };
}

// One-shot two-stage timers for a pending request: a soft "slow" warning, then a
// hard timeout. Returns { clear } to cancel both (call on first token / finish).
export function createWaitTimers({
  onSlowWarning,
  onTimeout,
  slowMs = SLOW_WARNING_MS,
  timeoutMs = RESPONSE_TIMEOUT_MS,
} = {}) {
  const slowTimer = setTimeout(() => onSlowWarning && onSlowWarning(), slowMs);
  const timeoutTimer = setTimeout(() => onTimeout && onTimeout(), timeoutMs);
  return {
    clear() {
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/services/chatWaitState.test.js`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add src/services/chatWaitState.js src/services/chatWaitState.test.js
git commit -m "feat(chat): pure wait-state policy (thresholds + two-stage timers)"
```

### Task B2: RU/EN copy in `i18n.js`

**Files:**
- Modify: `src/i18n.js` (add keys to both `ru` (after line ~16) and `en` (after line ~131))

- [ ] **Step 1: Add the keys**

In `src/i18n.js`, inside the `ru` object (e.g. right after the `botUnavailable` key at line 16), add:
```js
        slowWarning: "Менон сейчас загружен — ответ может занять чуть больше времени. Уже думаю над ним.",
        overloadWithLoad: "Сейчас Менон перегружен: в обработке ~{n} запросов. Можно подождать ещё или попробовать снова.",
        overloadBusy: "Не получилось получить ответ вовремя — сервис сейчас загружен.",
        retryButton: "Повторить запрос",
        stopWaiting: "Остановить ожидание",
```
Inside the `en` object (right after `botUnavailable` at line 131), add:
```js
        slowWarning: "Menon is busy right now — this may take a little longer. Still on it.",
        overloadWithLoad: "Menon is overloaded right now: ~{n} requests in progress. Keep waiting or try again.",
        overloadBusy: "Couldn't get a response in time — the service is busy right now.",
        retryButton: "Retry",
        stopWaiting: "Stop waiting",
```

- [ ] **Step 2: Verify the module still loads**

Run: `npx vitest run src/services/errorMessage.test.js`
Expected: PASS (existing tests unaffected — new keys are additive).

- [ ] **Step 3: Commit**

```bash
git add src/i18n.js
git commit -m "i18n(chat): RU/EN copy for slow/overload/retry states"
```

### Task B3: Overload message in `buildErrorMessage`

**Files:**
- Modify: `src/services/errorMessage.js:10-12` (the `chat_timeout` branch)
- Test: `src/services/errorMessage.test.js` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `src/services/errorMessage.test.js` (inside the existing top-level, after the existing `describe`):
```js
describe('buildErrorMessage — chat_timeout becomes an overload message', () => {
  it('shows the load count when showLoad is true (RU)', () => {
    setLanguage('ru');
    const msg = buildErrorMessage({ code: 'chat_timeout' }, { load: { showLoad: true, count: 12 } });
    expect(msg).toContain('перегружен');
    expect(msg).toContain('12');
    expect(msg).not.toContain('{n}');
  });

  it('shows the busy message when showLoad is false (EN)', () => {
    setLanguage('en');
    const msg = buildErrorMessage({ code: 'chat_timeout' }, { load: { showLoad: false, count: 2 } });
    expect(msg).toContain('busy');
    expect(msg).not.toContain('2 requests');
  });

  it('falls back to the busy message when no load is provided', () => {
    setLanguage('en');
    expect(buildErrorMessage({ code: 'chat_timeout' })).toContain('busy');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/services/errorMessage.test.js`
Expected: FAIL — the current `chat_timeout` branch returns `⚠ {chatTimeoutWarning}` ("60 seconds"), so `toContain('перегружен')` fails.

- [ ] **Step 3: Update the `chat_timeout` branch**

In `src/services/errorMessage.js`, change the signature and the `chat_timeout` branch. Replace lines 9-12:
```js
export function buildErrorMessage(error) {
  if (error.code === 'chat_timeout') {
    return `⚠ ${translateOnce('chatTimeoutWarning')}`;
  }
```
with:
```js
export function buildErrorMessage(error, { load } = {}) {
  if (error.code === 'chat_timeout') {
    if (load && load.showLoad) {
      return translateOnce('overloadWithLoad').replace('{n}', String(load.count));
    }
    return translateOnce('overloadBusy');
  }
```
(Everything below stays as-is — other codes and the `botUnavailable` fallback are unchanged.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/services/errorMessage.test.js`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/services/errorMessage.js src/services/errorMessage.test.js
git commit -m "feat(chat): chat_timeout renders as an overload message with load"
```

### Task B4: Two-stage timers + status fetch in `api.js`

**Files:**
- Modify: `src/services/api.js` (constants ~306, timer setup ~350-354, clears ~368/503/561, add `fetchServiceStatus`)

- [ ] **Step 1: Wire `createWaitTimers` into `sendChatMessage`**

In `src/services/api.js`:

(a) At the top imports, add:
```js
import { createWaitTimers, RESPONSE_TIMEOUT_MS, SLOW_WARNING_MS } from './chatWaitState.js';
```
(b) Replace the constant at line 306:
```js
export const CHAT_FIRST_TOKEN_TIMEOUT_MS = 60_000;
```
with:
```js
export const CHAT_FIRST_TOKEN_TIMEOUT_MS = RESPONSE_TIMEOUT_MS; // 120s hard abort
export const CHAT_SLOW_WARNING_MS = SLOW_WARNING_MS; // 40s soft notice
```
(c) Replace the single-timer setup (lines 350-354):
```js
        let timeoutFired = false;
        const firstTokenTimer = setTimeout(() => {
            timeoutFired = true;
            localAborter.abort();
        }, CHAT_FIRST_TOKEN_TIMEOUT_MS);
```
with the two-stage timer:
```js
        let timeoutFired = false;
        const waitTimers = createWaitTimers({
            onSlowWarning: () => onEvent && onEvent({ type: 'slow_warning' }),
            onTimeout: () => {
                timeoutFired = true;
                localAborter.abort();
            },
        });
        const firstTokenTimer = waitTimers; // keep the name used by the clears below
```
(d) Replace the three `clearTimeout(firstTokenTimer)` sites with `firstTokenTimer.clear()`:
- line ~368 (fetch-catch): `clearTimeout(firstTokenTimer);` → `firstTokenTimer.clear();`
- line ~503-505 (first content token): `if (firstTokenTimer) { clearTimeout(firstTokenTimer); }` → `firstTokenTimer.clear();`
- line ~561 (loop-exit cleanup): `clearTimeout(firstTokenTimer);` → `firstTokenTimer.clear();`

- [ ] **Step 2: Add the status fetch helper**

Near the other exported fetchers in `api.js` (e.g. after `sendChatMessage`), add:
```js
// Best-effort load snapshot for the overload UX. Never throws — on any failure
// it returns zeros so the caller just omits the load figure.
export async function fetchServiceStatus() {
    try {
        const res = await fetch(`${API_BASE_URL}/v1/status`);
        if (!res.ok) return { active: 0, limit: null };
        const data = await res.json();
        return { active: data.active_requests ?? 0, limit: data.limit ?? null };
    } catch {
        return { active: 0, limit: null };
    }
}
```

- [ ] **Step 3: Verify build + lint (behavioural test is Task B8 in-browser)**

Run: `npm run build && npx eslint src/services/api.js`
Expected: build succeeds; eslint 0 errors. (The timer behaviour is covered by `chatWaitState.test.js`; `sendChatMessage` itself is exercised end-to-end in Task B8.)

- [ ] **Step 4: Commit**

```bash
git add src/services/api.js
git commit -m "feat(chat): two-stage wait timers (40s slow_warning, 120s abort) + status fetch"
```

### Task B5: App.jsx — slow-warning flag + load-on-error

**Files:**
- Modify: `src/App.jsx` — `onEvent` (add `slow_warning` case ~838), the `catch` (~966-969)

- [ ] **Step 1: Handle the `slow_warning` event**

In `src/App.jsx`, inside the `onEvent` callback passed to `sendChatMessage` (add a new branch alongside the others, e.g. after the `stage` branch that ends at line 871), add:
```js
            if (event.type === 'slow_warning') {
              setChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
                if (message?.isArena || message?.role !== 'assistant') return message;
                return { ...message, slowWarning: true };
              }));
              return;
            }
```

- [ ] **Step 2: Fetch load and attach retry info on error**

Import `fetchServiceStatus` and the policy (top of App.jsx, near line 13):
```js
import { fetchServiceStatus } from './services/api.js';
import { resolveOverload } from './services/chatWaitState.js';
```
Replace the `catch` block (lines 966-969):
```js
    } catch (error) {
      console.error(error);
      setChats((prev) => applyLastMessageError(prev, targetChatId, error));
      refreshModelsAndApplyState();
```
with:
```js
    } catch (error) {
      console.error(error);
      // Overload UX: for a timeout, fetch the live load so the message can show
      // "~N in progress" past the threshold. Retry re-runs this same user turn.
      const load =
        error?.code === 'chat_timeout'
          ? resolveOverload(await fetchServiceStatus())
          : resolveOverload(error?.httpStatus === 503
              ? { active: error?.activeRequests, limit: error?.limit }
              : {});
      setChats((prev) => applyLastMessageError(prev, targetChatId, error, { load, userText: trimmedText }));
      refreshModelsAndApplyState();
```
Then extend `applyLastMessageError` (lines 180-217): change its signature to `function applyLastMessageError(chats, chatId, error, opts = {}) {`, pass `opts.load` into the message builder — replace `const errorMessage = buildErrorMessage(error);` with `const errorMessage = buildErrorMessage(error, { load: opts.load });`, and in the assistant-return object (lines 209-215) add the retry payload:
```js
    return {
      ...message,
      content: errorMessage,
      responseModelId: message.responseModelId || message.requestModelId || null,
      isStreaming: false,
      slowWarning: false,
      agentError: true,
      retry: { userText: opts.userText || '', load: opts.load || null },
    };
```
Also read `error.activeRequests`/`error.limit` from the 503 body — in `api.js` where the HTTP error is built (lines 382-385), add:
```js
            err.activeRequests = parsed?.error?.active_requests;
            err.limit = parsed?.error?.limit;
```

- [ ] **Step 3: Verify build**

Run: `npm run build && npx eslint src/App.jsx src/services/api.js`
Expected: build succeeds; 0 eslint errors (pre-existing warnings ok).

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/services/api.js
git commit -m "feat(chat): flag slow requests and attach load+retry on error"
```

### Task B6: Render — slow banner, Retry button, load line

**Files:**
- Modify: `src/components/ChatArea.jsx` — `MessageBubble` (~218-281), thread `onRetry` from `ChatArea` props; `src/App.jsx` — pass `onRetry`

- [ ] **Step 1: Thread `onRetry` and render the new UI in `MessageBubble`**

In `src/components/ChatArea.jsx`:

(a) `MessageBubble` signature (line 218) → accept `onRetry`:
```js
function MessageBubble({ message, chatId, setChats, onRetry }) {
```
(b) Add `useTranslation` at the top of `MessageBubble` (after line 220):
```js
    const { t } = useTranslation();
```
(c) Slow banner — inside `message-content`, right after `<ReasoningBlock ... />` (after line 253):
```js
                {message.slowWarning && message.isStreaming && (
                    <div className="slow-warning-banner">{t('slowWarning')}</div>
                )}
```
(d) Retry panel — after the markdown block (after line 258), gated on the error:
```js
                {message.agentError && message.retry && (
                    <div className="retry-panel">
                        {message.retry.load?.showLoad && (
                            <div className="retry-load">
                                {t('overloadWithLoad').replace('{n}', String(message.retry.load.count))}
                            </div>
                        )}
                        <button className="retry-btn" onClick={() => onRetry?.(message)}>
                            {t('retryButton')}
                        </button>
                    </div>
                )}
```
(e) Pass `onRetry` down where `MessageBubble` is rendered (line 145):
```js
                        return <MessageBubble key={index} message={msg} chatId={chatId} setChats={setChats} onRetry={onRetry} />;
```
(f) Add `onRetry` to `ChatArea`'s props (its function signature near the top of the file) and forward it.

- [ ] **Step 2: Implement `onRetry` in App.jsx**

In `src/App.jsx`, define a retry handler and pass it to `<ChatArea onRetry={handleRetryMessage} .../>`:
```js
  const handleRetryMessage = (message) => {
    const text = message?.retry?.userText;
    if (!text || !activeChatId || generatingChats.has(activeChatId)) return;
    // Drop the errored assistant message so handleSendMessage appends a fresh one.
    setChats((prev) => updateChatById(prev, activeChatId, (chat) => ({
      ...chat,
      messages: chat.messages.filter((m) => m !== message),
    })));
    void handleSendMessage(text);
  };
```
(`handleSendMessage` already appends the user turn? — no: it uses the existing history. Verify at implementation: `handleSendMessage` builds `messageHistory` from existing messages and appends a NEW user message. For retry we must NOT duplicate the user message. Since the failed turn's user message is already in `chat.messages`, filter only the errored ASSISTANT message and call the send with the last user text so it re-generates. If `handleSendMessage` unconditionally appends a user message, instead extract the generation part into a helper both call, or pass a flag `{ reuseLastUser: true }`. Implement whichever matches the actual `handleSendMessage` body — the invariant to preserve: exactly one user message for the turn, a fresh assistant message.)

- [ ] **Step 3: Minimal styles**

Add to `src/components/ChatArea.css` (or the file MessageBubble styles live in):
```css
.slow-warning-banner { font-size: 0.85rem; opacity: 0.75; margin: 0.25rem 0; }
.retry-panel { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
.retry-load { font-size: 0.85rem; opacity: 0.8; }
.retry-btn { padding: 0.25rem 0.75rem; border-radius: 6px; cursor: pointer; }
```

- [ ] **Step 4: Verify build**

Run: `npm run build && npx eslint src/components/ChatArea.jsx src/App.jsx`
Expected: build succeeds; 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ChatArea.jsx src/components/ChatArea.css src/App.jsx
git commit -m "feat(chat): slow banner, overload load line, and Retry button"
```

### Task B7: Stop-waiting control

**Files:**
- Modify: `src/App.jsx` (AbortController per send, pass `signal`, `onStop`), `src/components/ChatArea.jsx` + `src/components/ChatInput.jsx` (Stop control while generating)

- [ ] **Step 1: Wire an AbortController through the send**

In `src/App.jsx` `handleSendMessage`, before the `await sendChatMessage(...)` (line 811), create a controller and store it so a Stop handler can reach it:
```js
        const controller = new AbortController();
        abortControllersRef.current.set(targetChatId, controller);
```
Add near the other refs (top of the component): `const abortControllersRef = useRef(new Map());`
Pass `signal: controller.signal` into the `sendChatMessage({...})` call (add the field at line 811-816). In the `finally` (line 970), also `abortControllersRef.current.delete(targetChatId);`.
Add the stop handler:
```js
  const handleStopWaiting = () => {
    const controller = abortControllersRef.current.get(activeChatId);
    if (controller) controller.abort();
  };
```
An aborted request throws `ChatTimeoutError` (api.js:564-566) → the existing catch renders the overload/retry state. Pass `onStop={handleStopWaiting}` and `isGenerating` to `ChatArea`/`ChatInput`.

- [ ] **Step 2: Show Stop while generating**

In `ChatInput.jsx`, when `disabled`/generating, render the Stop button instead of (or beside) Send — calling `onStop`, labelled `t('stopWaiting')`. (Exact JSX depends on the current submit button at `ChatInput.jsx:97-104`; keep it a `type="button"` so it doesn't submit.)

- [ ] **Step 3: Verify build + lint**

Run: `npm run build && npx eslint src/App.jsx src/components/ChatInput.jsx src/components/ChatArea.jsx`
Expected: build succeeds; 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/components/ChatInput.jsx src/components/ChatArea.jsx
git commit -m "feat(chat): Stop-waiting control aborts the in-flight request"
```

### Task B8: Full verification (suite + build + in-browser, RU & EN)

**Files:** none (verification only)

- [ ] **Step 1: Unit suite + lint + build**

Run: `npx vitest run && npx eslint src && npm run build`
Expected: all tests pass (incl. `chatWaitState`, `errorMessage`); 0 eslint errors; build clean.

- [ ] **Step 2: Drive the states in the browser**

Start the dev server (`preview_start name meno-web`), then force each state (temporarily shrink the constants in `chatWaitState.js` to e.g. `SLOW_WARNING_MS=2000`, `RESPONSE_TIMEOUT_MS=5000`, and point `/v1/status` at a value ≥5 by hand or via the backend) to verify, in BOTH `ru` and `en`:
  - **Slow banner** appears ~2s into a pending answer, disappears when the first token arrives.
  - **Overload panel** at ~5s: shows the load line when load ≥ 5, hides it below 5, and the Retry button re-runs the same question WITHOUT re-typing and WITHOUT duplicating the user message.
  - **Stop waiting** aborts immediately and shows the same overload/retry panel.
  - **Any other error** (e.g. stop the backend) shows the Retry button.
Revert the temporary constant changes before finishing. Capture a screenshot of the overload panel as proof.

- [ ] **Step 3: Finalize**

Use superpowers:finishing-a-development-branch to integrate. Summarize verification evidence (unit results + screenshots).

---

## Self-Review notes (author)

- **Spec coverage:** 40s notice → B4 (event) + B5 (flag) + B6 (banner). 120s timeout → B4 (`RESPONSE_TIMEOUT_MS` abort). Approximate load → A1 (`/v1/status`) + A2 (503 enrich) + B4 (`fetchServiceStatus`) + B1 (`resolveOverload`, threshold 5) + B6 (load line). Retry any error → B5 (attach `retry`) + B6 (button) + B2 (copy). Stop waiting → B7. RU/EN → B2. Pure/testable core → B1, B3.
- **Placeholder scan:** code shown for every step. Two implementation-time verifications are flagged explicitly (not placeholders): B6 Step 2 (match `handleSendMessage`'s user-append behaviour so retry doesn't duplicate the user turn) and B7 Step 2 (Stop JSX depends on the current `ChatInput` submit button) — both name the exact file/line and the invariant to preserve.
- **Type/name consistency:** `resolveOverload → {showLoad,count,limit}` used identically in B1/B5/B6; `createWaitTimers({onSlowWarning,onTimeout}).clear()` in B1/B4; message fields `slowWarning`/`agentError`/`retry:{userText,load}` consistent across B5/B6; event `{type:'slow_warning'}` in B4/B5; endpoint `/v1/status` → `{active_requests,limit}` in A1/B4; 503 `error.active_requests/limit` in A2/B5.
- **Scope:** one feature; FIFO queue and server-side deadline explicitly out (spec). Phase A ships independently (its own repo/branch).
