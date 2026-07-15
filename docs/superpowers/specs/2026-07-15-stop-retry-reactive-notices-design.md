# Design: honest stop UX, one-shot retry, and reactive service notices

Date: 2026-07-15
Status: Approved design

## Goal

Three connected defects in the interrupted-answer UX (all Meno-Web):

1. **User stop is treated as a timeout error.** Clicking "Stop waiting" aborts the
   in-flight request, which surfaces as `ChatTimeoutError` — the same as the 120s
   auto-timeout — so the user gets an overload/error message and the streamed text
   they already saw is **wiped**. A stop should say plainly "Stopped", keep the
   streamed content, drop the `!`, and offer a retry.

2. **Retry buttons are stale and can break the chat.** The Retry affordance renders
   on *every* message carrying `agentError && retry`, so buttons from earlier turns
   survive new messages and page reloads (several at once). Retrying a message that
   is no longer last rebuilds a history ending in an assistant turn, the backend
   rejects it, and the failure cascades into "every request errors, nothing can be
   typed, the button retries forever." There must be **at most one** Retry, on the
   **last** message only, and it must vanish the moment the user asks something new
   or clicks it once.

3. **Service notices freeze their language.** `botUnavailable` ("Ой-ой!…") and
   `overloadBusy` ("Couldn't get a response…") — and the hardcoded `⚠` error-code
   strings — are resolved once via `translateOnce` and written into `content`, so a
   later UI language switch never re-translates them. All service copy must switch
   language live.

## Root cause & unifying fix

Defects 1 and 3 share a root cause: **the resolved string is written into
`message.content`**. That both destroys streamed text and freezes the language.

Fix: stop writing resolved strings into `content`. A terminal non-content outcome
becomes a **localizable descriptor** stored alongside content:

```
message.notice = { kind: 'stopped' | 'error', key: <i18nKey>, params?: {…} }
message.retry  = { userText: <string> }        // presence gates the retry affordance
```

`content` is **never overwritten** by stop or error (answers the "и при стопе, и
при ошибке" choice). The notice string is produced **at render time** with `t()`,
so it re-translates on every language switch.

## Scope

- **Everything reactive, including Arena** (per the localization-breadth choice):
  main chat stop/timeout/overload, the error codes
  (`model_rate_limited` / `model_unreachable` / `core_model_unavailable`), and the
  Arena placeholder strings.
- Out of scope: the transient `⏳ arenaModelSwitched` hint (immediately overwritten
  by the next model's stream — stays on `translateOnce`); migrating old
  content-string error messages already sitting in `localStorage` (one-shot, they
  age out).

## Changes by file

### `src/services/api.js` — distinguish stop from timeout

`sendChatMessage` already tracks `timeoutFired` and aborts an internal
`localAborter` from two sources: the 120s timer (sets `timeoutFired`) and the
external `signal` (the user's "Stop waiting"). Today both abort points throw
`ChatTimeoutError`. New rule at **both** catch sites (fetch catch and read-loop
catch):

- `timeoutFired` → `ChatTimeoutError` (`code: 'chat_timeout'`) — unchanged.
- else AbortError → **`ChatAbortedError`** (`code: 'user_stopped'`) — new.
- else → rethrow original.

Add `class ChatAbortedError extends Error { code = 'user_stopped' }` next to
`ChatTimeoutError`.

### `src/services/chatNotice.js` — new pure module (replaces `errorMessage.js`)

- `buildErrorNotice(error, { load }) → { kind: 'error', key, params }`
  - `chat_timeout` + `load.showLoad` → `{ key: 'overloadWithLoad', params: { n: count } }`
  - `chat_timeout` → `{ key: 'overloadBusy' }`
  - `model_rate_limited` → `{ key: 'modelRateLimited', params: { hh, mm, mins } }`
    (compute hh/mm/mins from `error.until` as today, but store as params)
  - `model_unreachable` → `{ key: 'modelUnreachable' }`
  - `core_model_unavailable` → `{ key: 'coreModelUnavailable' }`
  - default → `{ key: 'botUnavailable' }`
- `buildStopNotice() → { kind: 'stopped', key: 'stopped' }`
- `formatNotice(t, notice) → string` — looks up `t(notice.key)` and interpolates
  every `notice.params` entry (`{name}` → value). Pure; `t` is injected so it works
  both reactively (React `t`) and once (services).

`errorMessage.js` and `errorMessage.test.js` are removed; their coverage moves to
`chatNotice.test.js`.

### `src/services/chatTurns.js` — new pure module (history + retry helpers)

- `buildOutgoingHistory(messages) → messages[]` — the array sent to the backend,
  **excluding** assistant messages that carry a `notice` (interrupted/errored turns
  are not real answers and must not leak into model context — this is what breaks
  the "every request errors" cascade). User messages and real assistant answers are
  kept verbatim.
- `dropTrailingNotice(messages) → messages[]` — returns messages with the final
  element removed **iff** it is an assistant message with a `notice`; otherwise
  returns the array unchanged. Used by retry to re-run the last turn cleanly.

### `src/App.jsx` — wiring

- Replace `applyLastMessageError` with `applyLastMessageNotice(chats, chatId, notice, { userText })`:
  sets `notice`, `isStreaming: false`, `slowWarning: false`, `retry: { userText }`,
  and preserves `responseModelId`. **Does not touch `content`.** Sets a neutral
  `interrupted: true` marker (not `agentError`) so the reasoning disclosure shows a
  calm terminal state rather than a red `!`.
- `catch` branch:
  - `error.code === 'user_stopped'` → `applyLastMessageNotice(buildStopNotice(), …)`;
    **no** `/v1/status` fetch, **no** `refreshModelsAndApplyState()`.
  - else → resolve `load` (as today) and `applyLastMessageNotice(buildErrorNotice(error, { load }), …)`.
- Outgoing history: build `messageHistory` via `buildOutgoingHistory(...)` for both
  the normal and Arena paths.
- Retry: `handleSendMessage` retry path uses `dropTrailingNotice(chat.messages)`
  instead of the reference-equality `filter(m => m !== retryOf)`, and re-runs the
  preceding user turn without appending a duplicate. `handleRetryMessage` guards on
  `message?.retry`.
- Arena placeholder strings (`App.jsx` ~655/705/758/773/776/795) become notices /
  i18n keys and render reactively (see i18n + Arena render below). The exhaustion
  and blank-response side states set `side.notice`.

### `src/components/ChatArea.jsx` — retry gating + notice row

- `ChatArea` passes `isLast={index === messages.length - 1}` to each `MessageBubble`.
- `MessageBubble` renders, where the "Обрабатываю…" status normally sits, a single
  **notice row** when `message.notice`:
  `<icon> {formatNotice(t, message.notice)} … [Повторить]`.
  - `kind: 'stopped'` → neutral Stop icon, `--text-secondary`, **no `!`**.
  - `kind: 'error'` → soft alert icon, `--danger` tint, **no bare `!` glyph**.
  - The **Retry** button appears in this row **only** when `isLast && message.retry`
    (the one-and-only-one invariant). Clicking calls `onRetry(message)` once.
- `ReasoningBlock` gets an `interrupted` prop: when set it shows a neutral terminal
  header (stop icon, `--text-tertiary`) instead of the spinner or the red `!`.
- Arena side rendering shows `formatNotice(t, side.notice)` when a side has a notice.

### `src/components/reasoning.js` — status

`deriveReasoningStatus({ summary, agentError, isStreaming, interrupted })`: add an
`interrupted` → `'stopped'` branch (ahead of the `agentError` check). `ReasoningBlock`
maps `'stopped'` to the neutral header/icon.

### `src/components/ChatArea.css` — button integrated with the site

- `.retry-btn`: a proper secondary button — `border: 1px solid var(--border-color)`,
  `background: var(--bg-secondary)`, `color: var(--text-secondary)`, and
  `:hover { background: var(--bg-tertiary) }` (the site's darken-on-hover pattern,
  matching `.agent-thinking-summary:hover`). Drop the current opacity-only hover.
- `.message-notice`: flex row, `gap: 0.5rem`, `align-items: center`, sized/coloured
  like the status area, with the Retry button inline at the end.

### `src/i18n.js` — new keys (ru / en)

| key | RU | EN |
|---|---|---|
| `stopped` | Остановлено | Stopped |
| `modelRateLimited` | ⚠ Модель ограничена по частоте до {hh}:{mm} (~{mins} мин). Попробуйте другую модель. | ⚠ Model is rate-limited until {hh}:{mm} (~{mins} min). Try another model. |
| `modelUnreachable` | ⚠ Модель сейчас недоступна. Попробуйте другую модель. | ⚠ Model is currently unreachable. Try another model. |
| `coreModelUnavailable` | ⚠ Внутренняя RAG-модель недоступна — бэкенд не может выполнить поиск. | ⚠ Internal RAG model unavailable — backend cannot run retrieval. |
| `arenaNoModels` | ⚠ Нет доступных моделей для арены. Обновите и попробуйте снова. | ⚠ No available models for arena right now. Refresh to retry. |
| `arenaNeedTwoModels` | ⚠ Для раунда арены нужно минимум две разные модели. Попробуйте чуть позже. | ⚠ Need at least two distinct models for an arena round. Try again in a moment. |
| `arenaPoolExhausted` | ⚠ Не удалось провести раунд арены (модели закончились). Попробуйте чуть позже. | ⚠ Could not run an arena round (pool exhausted). Try again in a moment. |
| `arenaModelNoAnswer` | ⚠ Модель не вернула ответ. Попробуйте новый вопрос. | ⚠ The model returned no answer. Try a new question. |
| `arenaModelSearchFailed` | ⚠ Не удалось найти доступную модель после нескольких попыток. | ⚠ Could not find an available model after several attempts. |

`{hh}{mm}{mins}` interpolated by `formatNotice`. Existing `retryButton`,
`overloadBusy`, `overloadWithLoad`, `botUnavailable` are reused.

## Behavior summary

- **Stop:** content preserved; status area shows `⏹ Остановлено … [Повторить]`, no
  `!`; no network calls; retry re-runs the same question.
- **Error/timeout:** content preserved; status area shows the localized error + one
  `[Повторить]`; language switches live.
- **Retry:** exactly one button, on the last message only; disappears on a new
  question or after one click; retrying rebuilds a clean history (no notice turns),
  so it never cascades.

## Testing (TDD, vitest)

- `chatNotice.test.js` — descriptor per code (stop, timeout±load, rate-limited,
  unreachable, core-unavailable, unknown→botUnavailable); `formatNotice`
  interpolation; RU↔EN reactivity (switch language, re-format, assert new language).
- `chatTurns.test.js` — `buildOutgoingHistory` strips notice-bearing assistant
  messages and keeps the rest in order; `dropTrailingNotice` removes only a trailing
  notice message, leaves everything else, and is a no-op on a clean tail.
- `api.js` — with fake timers/abort: external abort → `ChatAbortedError`
  (`user_stopped`); the 120s timer → `ChatTimeoutError` (`chat_timeout`).
- `ChatArea` render test — Retry shows only on the last message; a non-last errored
  message shows none; the stopped row renders "Остановлено" without `!` and keeps
  the prior `content`.
- **Manual (browser preview):** stream a partial answer → Stop → content stays,
  "Остановлено" + Retry; force an error → localized message + one Retry; switch
  RU↔EN and confirm both notices re-translate live; send a new question and confirm
  the old Retry is gone.

## Sequencing

Pure modules first (`chatNotice.js`, `chatTurns.js`, `api.js` error class) with
their tests, then `App.jsx` wiring, then `ChatArea.jsx` / `reasoning.js` render +
CSS, then i18n copy. Single Meno-Web branch.
