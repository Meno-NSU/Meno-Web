# Design: graceful UX for slow / overloaded responses

Date: 2026-07-14
Status: Approved design

## Goal

Under load a Menon answer can stall. Today the client aborts after a single 60s
first-token timeout and shows a generic error, with no reassurance while waiting
and no easy way to retry. Give the user: a calm "still working" notice when a
response is slow, a clear overload message with an approximate load figure and a
one-click retry of the *same* question when it times out, and a retry offer on
*any* interrupted answer. All copy in RU and EN, in Menon's calm brand voice.

## Scope (v1)

Mostly Meno-Web, plus one tiny read-only backend endpoint. Approximate load only
(chosen over a real FIFO queue). Client-side timing (no server-side deadline).

Out of scope (possible later, not now): a real FIFO admission queue with true
position, a server-side per-request deadline, lowering `MAX_CONCURRENT_CHATS`.

## Timing model (client timers, extends the existing one)

`api.js` currently has `CHAT_FIRST_TOKEN_TIMEOUT_MS = 60_000` (single-stage
abort). Replace with a two-stage timer keyed off "no first token yet":

- **≥ 40s** (`SLOW_WARNING_MS`): emit `onEvent({ type: 'slow_warning' })` — the UI
  shows an informational, non-blocking banner. Do NOT abort.
- **≥ 120s** (`RESPONSE_TIMEOUT_MS`): abort as today, throwing `ChatTimeoutError`
  (`code: 'chat_timeout'`). This drives the overload state.
- Both timers are cleared the moment the first content token arrives (long
  answers are never interrupted — same invariant as today).
- **Stop waiting**: while waiting (after the 40s warning), the UI shows a "Stop
  waiting" control that aborts the in-flight request via the existing `signal`
  AbortController; the aborted request resolves to the same retry state.

## Approximate load

- **Backend (RAG-Core):** add read-only `GET /v1/status` →
  `{ "active_requests": admission.active, "limit": admission.max_concurrent }`
  (no auth, no DB, O(1)). Also enrich the existing 503 overload payload
  (`_classified_error_payload` / the 503 at `api/main.py`) with the same
  `active_requests` / `limit` fields so that path needs no extra fetch.
- **Frontend:** when entering the overload/error state, fetch `/v1/status` once
  (for the 503 path, read the fields already in the error payload).

## Presentation (pure, testable core)

A pure module `src/services/chatWaitState.js` holds the policy and constants so it
unit-tests like `surveyGate.js`:

- `SLOW_WARNING_MS = 40_000`, `RESPONSE_TIMEOUT_MS = 120_000`, `LOAD_DISPLAY_THRESHOLD = 5`.
- `resolveOverload({ active, limit })` → `{ showLoad: boolean, count: number }`
  (`showLoad` true iff `active >= LOAD_DISPLAY_THRESHOLD`).
- `errorPresentation({ code, load })` → `{ messageKey, showRetry: true, load }`
  choosing `overloadWithLoad` / `overloadBusy` / `genericError` message keys.

Wiring: `api.js` fires the `slow_warning` event and aborts at 120s; `App.jsx`
catch path (`applyLastMessageError`, App.jsx:966-968) attaches the resolved
presentation + the original user text to the failed message; the render
(ChatArea / ReasoningBlock) shows message + **Retry** (+ approximate load when
`showLoad`). The 40s banner renders from the `slow_warning` event on the pending
message.

## Retry (any interrupted answer)

Retry re-generates the answer for the **existing** user turn — it replaces the
errored assistant message in place and does NOT duplicate the user message (the
user never retypes). The backend already returns `{ retryable, retry_id, code }`;
the button shows whenever an answer was interrupted (timeout, 503, stream error).
It reuses the same send path as a normal turn, pointed at the failed message's
chat + user text.

## Copy (RU / EN, Menon brand)

| key | RU | EN |
|---|---|---|
| `slowWarning` | Менон сейчас загружен — ответ может занять чуть больше времени. Уже думаю над ним. | Menon is busy right now — this may take a little longer. Still on it. |
| `overloadWithLoad` | Сейчас Менон перегружен: в обработке ~{n} запросов. Можно подождать ещё или попробовать снова. | Menon is overloaded right now: ~{n} requests in progress. Keep waiting or try again. |
| `overloadBusy` | Не получилось получить ответ вовремя — сервис сейчас загружен. | Couldn't get a response in time — the service is busy right now. |
| `genericError` | Не удалось получить ответ. | Something went wrong getting a response. |
| `retryButton` | Повторить запрос | Retry |
| `stopWaiting` | Остановить ожидание | Stop waiting |

Add these under both `ru` and `en` in `src/i18n.js` (existing structure). `{n}` is
interpolated with the load count.

## Testing

- **Frontend (vitest):** `chatWaitState.test.js` — threshold (4→hide, 5→show),
  message-key selection per code, constants. Timer behavior in `api.js` with fake
  timers (fires `slow_warning` at 40s, aborts at 120s, both cleared on first
  token). Retry re-sends identical message text.
- **Backend (pytest):** `GET /v1/status` returns `{active_requests, limit}`
  reflecting the live `AdmissionController`; 503 payload includes the fields.
- **Manual:** force timers/load in the browser to view all four states in RU and EN.

## Sequencing

Backend `/v1/status` + 503 enrichment first (small, RAG-Core, own branch), then
the Meno-Web work (frontend can be built against a mocked status). Each repo ships
on its own branch.
