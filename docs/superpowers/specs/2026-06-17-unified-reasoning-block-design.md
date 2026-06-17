# Unified reasoning block

**Date:** 2026-06-17
**Repo:** Meno-Web (frontend)
**Status:** Design approved; spec under review
**Branch:** `feat/unified-reasoning-block` (stacked on `feat/friendly-error-fallback`, PR #23 — both touch `applyLastMessageError`)

## Problem

Per assistant message, "reasoning/processing" is shown in **two disconnected places**:

1. `AgentThinkingBlock` (`ChatArea.jsx`) — the RAG pipeline stages + `thinkingContent` (a separate SSE stream), rendered *above* the answer. Auto-**opens** while running, collapses only when `agentSummary` arrives.
2. Inline `ThinkBlock` — `<think>…</think>` parsed out of the answer `content`, rendered *between* the answer's text segments.

This split has no analog in mainstream LLM chat UIs and over-loads attention. Two further issues:

- The rotating shimmer phrases (`LoadingPhrase`: "Думаю…", "Обращаюсь к мудрецам Академгородка…") live **inside** the expanded pipeline block (per running stage row), not as the outside indicator.
- **Stuck spinner on error (bug B):** on a failed generation the backend never sends `agentSummary`, so `AgentThinkingBlock.isComplete` (`summary !== null`) stays false and the `Loader` spins forever — even though the answer already shows the error stub. (`applyLastMessageError` in `App.jsx` only sets `content`, never finalizes the block.)

## Goal

One collapsible "reasoning" disclosure per assistant message — the ChatGPT/Claude pattern: **collapsed by default**, a single shimmering rotating phrase as the **only** outside indicator while running, expandable to reveal pipeline stages + model reasoning, and **terminal (no spinner)** when done *or* errored.

## Design

### Single component `ReasoningBlock` (replaces `AgentThinkingBlock` + inline `ThinkBlock`)

Rendered once, above the answer, when the message has pipeline stages **or** reasoning text.

**Inputs (from the message object):**
- `agentStages` — array, each `{ stage, status, durationMs?, detail? }`
- `agentSummary` — `null` until success, then `{ totalMs, stages }`
- reasoning text = `thinkingContent` (separate stream) **+** any `<think>…</think>` extracted from `content`
- `isStreaming` (bool) and new `agentError` (bool, set by the B fix)

**State machine:**
- `done` = `agentSummary !== null`
- `errored` = `agentError === true`
- `running` = neither `done` nor `errored`
- `isOpen` default = **false** in every state; manual toggle overrides and is preserved.

**Header / outside indicator (the only thing visible when collapsed):**
- running → rotating `LoadingPhrase` shimmer (moved out of the stage rows); clickable to expand.
- done → `t('agentThoughtFor')` ("Думал N с") + check icon; collapsed; expandable.
- errored → **no spinner**; static `t('agentProcessing')` label + neutral/`!` icon; collapsed; expandable.

**Expanded body, in order:**
1. pipeline stages list (status icon + `t('stage_*')` label + duration + `StageDetail`), then
2. reasoning text (`thinkingContent` + extracted `<think>`), rendered as markdown.

### Answer body

`parseThinkBlocks` still strips `<think>` from `content`, but the resulting *think* segments feed `ReasoningBlock` instead of rendering inline. The message body renders **only** the final answer text.

### Bug B — finalize on error

`applyLastMessageError` (`App.jsx`) additionally sets on the assistant message: `isStreaming: false` and `agentError: true` (it keeps `agentStages` so the user can still expand what ran). `ReasoningBlock` treats `agentError` as terminal → spinner stops. The answer is the friendly stub already produced by `buildErrorMessage`.

### Reuse / removal

- Remove `AgentThinkingBlock` and the inline `ThinkBlock` rendering; keep and reuse `parseThinkBlocks` (to split answer vs reasoning) and `LoadingPhrase`, `StageDetail`, `formatDuration`.
- The top-level `isGenerating` fallback `LoadingPhrase` (shown before any stage/content arrives) stays — it covers the brief gap before the first stage event.
- i18n: reuse existing keys (`loadingPhrases`, `agentThoughtFor`, `agentProcessing`, `stage_*`, `thinking`). No new key required.

## Testing (vitest + @testing-library)

Extract the header-state derivation (`running` / `done` / `errored` → label + icon + spinner?) into a small pure helper so it is unit-testable, and cover the component:
- collapsed by default while running; shimmer phrase visible; toggle expands stages + reasoning;
- done: collapsed "Думал N с", no spinner, expandable;
- errored (`agentError`): no spinner; answer (stub) renders below; block still expandable;
- `<think>` is extracted from the answer body (body shows only the final text).

## Files touched

- `src/components/ChatArea.jsx` — replace `AgentThinkingBlock` + inline `ThinkBlock` with `ReasoningBlock`; move `LoadingPhrase` outside; adjust `MessageBubble` composition.
- `src/App.jsx` — `applyLastMessageError`: add `isStreaming: false`, `agentError: true`.
- `src/components/ChatArea.css` — styles for unified collapsed/running/done/error states + outside shimmer.
- `src/components/ReasoningBlock.test.jsx` (or a helper test) — vitest coverage above.

## Out of scope

- Backend changes (the 400/context-window issue is handled separately by raising `VLLM_MAX_MODEL_LEN`).
- Arena-mode reasoning rendering (per-column streaming) — unchanged unless trivially affected.
