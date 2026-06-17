# Unified Reasoning Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two separate reasoning disclosures (pipeline-stages block + inline `<think>` block) with one collapsed-by-default "reasoning" block that shows a shimmer phrase while running, and stop the spinner on generation error.

**Architecture:** Extract pure view-model helpers into `src/components/reasoning.js`; build a single `ReasoningBlock` component in `src/components/ReasoningBlock.jsx` (absorbing `LoadingPhrase` + `StageDetail`); rewire `MessageBubble` in `ChatArea.jsx` to render it above an answer body that no longer inlines `<think>`; finalize the block on error in `App.jsx`.

**Tech Stack:** React + Vite, `vitest` (jsdom, global) + `@testing-library/react`, existing `src/i18n.js`.

**Base branch:** `feat/unified-reasoning-block` (stacked on `feat/friendly-error-fallback`).

---

## File Structure

- `src/components/reasoning.js` (**new**) — pure helpers: `extractReasoning`, `deriveReasoningStatus`, `formatDuration`. No React. Unit-tested.
- `src/components/reasoning.test.js` (**new**) — unit tests for the helpers.
- `src/components/ReasoningBlock.jsx` (**new**) — `LoadingPhrase` (moved), `StageDetail` (moved), `ReasoningBlock` (new). Exports `ReasoningBlock`, `LoadingPhrase`.
- `src/components/ReasoningBlock.test.jsx` (**new**) — component render tests.
- `src/components/ChatArea.jsx` (**modify**) — remove `LoadingPhrase`, `AgentThinkingBlock`, `StageDetail`, `formatDuration`; **keep** `parseThinkBlocks`, `ThinkBlock`, `MARKDOWN_COMPONENTS` (still used by the arena columns); import the new module(s); rewrite the non-arena `MessageBubble` reasoning/answer rendering; drop the now-unused `Loader`/`CheckCircle` icon imports.
- `src/App.jsx` (**modify**) — `applyLastMessageError`: add `isStreaming:false`, `agentError:true`.
- `src/components/ChatArea.css` (**modify**) — align the shimmer phrase inside the collapsed header.

---

### Task 1: Pure helpers (`reasoning.js`) — TDD

**Files:**
- Create: `src/components/reasoning.js`
- Test: `src/components/reasoning.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/components/reasoning.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { extractReasoning, deriveReasoningStatus, formatDuration } from './reasoning.js';

describe('extractReasoning', () => {
  it('separates a closed think block from the answer', () => {
    expect(extractReasoning('<think>weighing options</think>Final answer.'))
      .toEqual({ answer: 'Final answer.', think: 'weighing options' });
  });
  it('treats an unclosed trailing think tag (streaming) as reasoning', () => {
    expect(extractReasoning('Intro. <think>still thinking'))
      .toEqual({ answer: 'Intro.', think: 'still thinking' });
  });
  it('returns the answer unchanged when there is no think block', () => {
    expect(extractReasoning('Just an answer.')).toEqual({ answer: 'Just an answer.', think: '' });
  });
});

describe('deriveReasoningStatus', () => {
  it('is errored when agentError is set', () => {
    expect(deriveReasoningStatus({ summary: null, agentError: true, isStreaming: true })).toBe('errored');
  });
  it('is done when a summary exists', () => {
    expect(deriveReasoningStatus({ summary: { totalMs: 10 }, agentError: false, isStreaming: false })).toBe('done');
  });
  it('is done when streaming stopped even without a summary', () => {
    expect(deriveReasoningStatus({ summary: null, agentError: false, isStreaming: false })).toBe('done');
  });
  it('is running while streaming with no summary or error', () => {
    expect(deriveReasoningStatus({ summary: null, agentError: false, isStreaming: true })).toBe('running');
  });
});

describe('formatDuration', () => {
  it('formats sub-second as ms and seconds with one decimal', () => {
    expect(formatDuration(450)).toBe('450ms');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(null)).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/reasoning.test.js`
Expected: FAIL — `Failed to resolve import "./reasoning.js"`.

- [ ] **Step 3: Create the helpers**

Create `src/components/reasoning.js`:
```js
// Pure view-model helpers for the unified reasoning disclosure.

// Split a raw assistant message into its final answer and its <think> reasoning.
// Handles closed <think>…</think> blocks and a single still-open trailing
// <think> (streaming). Returns trimmed answer text and concatenated reasoning.
export function extractReasoning(raw) {
  const text = raw || '';
  const thinkParts = [];

  const closed = /<think>([\s\S]*?)<\/think>/gi;
  let m;
  while ((m = closed.exec(text)) !== null) {
    if (m[1].trim()) thinkParts.push(m[1].trim());
  }

  let answer = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const openIdx = answer.indexOf('<think>');
  if (openIdx !== -1) {
    const tail = answer.slice(openIdx + '<think>'.length).trim();
    if (tail) thinkParts.push(tail);
    answer = answer.slice(0, openIdx);
  }

  return { answer: answer.trim(), think: thinkParts.join('\n\n').trim() };
}

// Terminal vs running state for the reasoning disclosure.
export function deriveReasoningStatus({ summary, agentError, isStreaming }) {
  if (agentError) return 'errored';
  if (summary != null) return 'done';
  if (!isStreaming) return 'done';
  return 'running';
}

export function formatDuration(ms) {
  if (ms == null) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/reasoning.test.js`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/components/reasoning.js src/components/reasoning.test.js
git commit -m "feat(reasoning): pure helpers for the unified reasoning block"
```

---

### Task 2: `ReasoningBlock` component — TDD

**Files:**
- Create: `src/components/ReasoningBlock.jsx`
- Test: `src/components/ReasoningBlock.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ReasoningBlock.test.jsx`:
```jsx
import { afterEach, describe, it, expect } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { ReasoningBlock } from './ReasoningBlock.jsx';
import { setLanguage } from '../i18n.js';

afterEach(() => { cleanup(); setLanguage('ru'); });

const RUNNING = [{ stage: 'retrieval', status: 'running' }];
const DONE = [{ stage: 'retrieval', status: 'complete', durationMs: 500 }];

describe('ReasoningBlock', () => {
  it('renders nothing without stages or reasoning', () => {
    const { container } = render(<ReasoningBlock stages={[]} summary={null} isStreaming={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('is collapsed by default and shows the shimmer phrase while running', () => {
    const { container } = render(<ReasoningBlock stages={RUNNING} summary={null} isStreaming={true} />);
    expect(container.querySelector('.agent-thinking-stages')).toBeNull(); // collapsed
    expect(container.querySelector('.loading-phrase')).not.toBeNull();    // shimmer in header
  });

  it('is collapsed by default when done (no shimmer)', () => {
    const summary = { totalMs: 500, stages: DONE };
    const { container } = render(<ReasoningBlock stages={DONE} summary={summary} isStreaming={false} />);
    expect(container.querySelector('.agent-thinking-stages')).toBeNull();
    expect(container.querySelector('.loading-phrase')).toBeNull();
  });

  it('expands to reveal stages when the header is clicked', () => {
    const summary = { totalMs: 500, stages: DONE };
    const { container } = render(<ReasoningBlock stages={DONE} summary={summary} isStreaming={false} />);
    fireEvent.click(container.querySelector('.agent-thinking-summary'));
    expect(container.querySelector('.agent-thinking-stages')).not.toBeNull();
  });

  it('shows no spinner when errored (bug B)', () => {
    const { container } = render(
      <ReasoningBlock stages={RUNNING} summary={null} agentError={true} isStreaming={false} />
    );
    expect(container.firstChild).not.toBeNull();
    expect(container.querySelector('.spinning')).toBeNull();
    expect(container.querySelector('.loading-phrase')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/ReasoningBlock.test.jsx`
Expected: FAIL — `Failed to resolve import "./ReasoningBlock.jsx"`.

- [ ] **Step 3: Create the component**

Create `src/components/ReasoningBlock.jsx`:
```jsx
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, Loader, CheckCircle, Check } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import { deriveReasoningStatus, formatDuration } from './reasoning.js';

// Links from model output open in a new tab so they never navigate the SPA
// away mid-stream (kills arena rounds). `noreferrer` keeps referrer private.
const MARKDOWN_COMPONENTS = {
  // eslint-disable-next-line no-unused-vars
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

// Rotating, gradient-shimmer status phrase (from i18n `loadingPhrases`).
export function LoadingPhrase() {
  const { t, lang } = useTranslation();
  const phrases = (Array.isArray(t('loadingPhrases')) && t('loadingPhrases').length > 0)
    ? t('loadingPhrases')
    : ['…'];
  const [index, setIndex] = useState(() => Math.floor(Math.random() * phrases.length));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setIndex(Math.floor(Math.random() * phrases.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    const cycle = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex(prev => {
          if (phrases.length <= 1) return 0;
          let next;
          do { next = Math.floor(Math.random() * phrases.length); }
          while (next === prev);
          return next;
        });
        setVisible(true);
      }, 400);
    }, 2600);
    return () => clearInterval(cycle);
  }, [phrases.length]);

  return (
    <div className={`loading-phrase ${visible ? 'visible' : 'hidden'}`}>
      {phrases[Math.min(index, phrases.length - 1)]}
    </div>
  );
}

function StageDetail({ detail, stage }) {
  if (!detail || typeof detail !== 'object') return null;

  const lines = [];

  if (stage === 'abbreviation_expansion' && detail.expanded && detail.expanded !== detail.original) {
    lines.push(detail.expanded);
  }
  if (stage === 'anaphora_resolution' && detail.resolved_query) {
    lines.push(detail.resolved_query);
  }
  if (stage === 'query_rewrite') {
    if (detail.resolved_coreferences) lines.push(`Запрос: ${detail.resolved_coreferences}`);
    if (Array.isArray(detail.search_queries) && detail.search_queries.length > 0) {
      detail.search_queries.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
    }
  }
  if (stage === 'retrieval') {
    const parts = [];
    if (detail.chunks_found != null) parts.push(`${detail.chunks_found} чанков`);
    if (detail.multilingual) parts.push(`multilingual: ${detail.multilingual}`);
    if (detail.russian) parts.push(`russian: ${detail.russian}`);
    if (detail.bm25) parts.push(`BM25: ${detail.bm25}`);
    if (parts.length) lines.push(parts.join(' · '));
  }
  if (stage === 'fusion' && detail.candidates != null) {
    lines.push(`${detail.candidates} кандидатов после объединения`);
  }
  if (stage === 'rerank' && detail.kept != null) {
    lines.push(`Отобрано топ-${detail.kept} из ${detail.candidates || '?'}`);
  }
  if (stage === 'context_assembly') {
    const parts = [];
    if (detail.sources != null) parts.push(`${detail.sources} источников`);
    if (detail.context_tokens != null) parts.push(`~${detail.context_tokens} токенов`);
    if (parts.length) lines.push(parts.join(', '));
  }

  if (lines.length === 0) return null;

  return (
    <div className="agent-stage-detail-block">
      {lines.map((line, i) => (
        <div key={i} className="agent-stage-detail-line">{line}</div>
      ))}
    </div>
  );
}

// One collapsible disclosure per assistant message: pipeline stages + model
// reasoning, collapsed by default in every state. Running shows the shimmer
// phrase as the header; done shows the elapsed time; errored stops the spinner.
export function ReasoningBlock({ stages = [], summary = null, agentError = false, isStreaming = false, reasoning = '' }) {
  const [manualToggle, setManualToggle] = useState(null);
  const { t } = useTranslation();

  const hasStages = stages && stages.length > 0;
  const hasReasoning = !!(reasoning && reasoning.trim());
  if (!hasStages && !hasReasoning) return null;

  const status = deriveReasoningStatus({ summary, agentError, isStreaming });
  const isOpen = manualToggle !== null ? manualToggle : false; // collapsed by default
  const totalMs = summary?.totalMs ?? stages.reduce((sum, s) => sum + (s.durationMs || 0), 0);

  let header;
  let icon;
  if (status === 'running') {
    header = <LoadingPhrase />;
    icon = <Loader size={14} className="agent-thinking-icon spinning" />;
  } else if (status === 'errored') {
    header = <span>{t('agentProcessing')}</span>;
    icon = <span className="agent-thinking-icon" style={{ color: 'var(--danger)' }}>!</span>;
  } else {
    header = <span>{t('agentThoughtFor').replace('{time}', (totalMs / 1000).toFixed(1))}</span>;
    icon = <CheckCircle size={14} className="agent-thinking-icon complete" />;
  }

  return (
    <div className={`agent-thinking-block ${isOpen ? 'open' : ''} ${status === 'done' ? 'complete' : ''}`}>
      <button
        className="agent-thinking-summary"
        onClick={() => setManualToggle((prev) => (prev !== null ? !prev : !isOpen))}
      >
        {icon}
        {header}
        <ChevronDown size={14} className="agent-thinking-chevron" />
      </button>
      {isOpen && (
        <div className="agent-thinking-stages">
          {stages.map((s, i) => (
            <div key={i} className={`agent-stage-row ${s.status}`}>
              <span className="agent-stage-icon">
                {s.status === 'running'
                  ? <Loader size={12} className="spinning" />
                  : s.status === 'complete'
                    ? <Check size={12} />
                    : s.status === 'failed'
                      ? <span style={{ color: 'var(--danger)' }}>!</span>
                      : <span>-</span>}
              </span>
              <span className="agent-stage-label">{t(`stage_${s.stage}`) || s.stage}</span>
              {s.durationMs != null && (
                <span className="agent-stage-duration">{formatDuration(s.durationMs)}</span>
              )}
            </div>
          ))}
          {stages.filter(s => s.status === 'complete' && s.detail).map((s, i) => (
            <StageDetail key={`detail-${i}`} detail={s.detail} stage={s.stage} />
          ))}
          {hasReasoning && (
            <div className="agent-thinking-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                {reasoning}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/ReasoningBlock.test.jsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ReasoningBlock.jsx src/components/ReasoningBlock.test.jsx
git commit -m "feat(reasoning): unified ReasoningBlock component"
```

---

### Task 3: Finalize the block on error (`App.jsx`) — bug B

**Files:**
- Modify: `src/App.jsx` (`applyLastMessageError`, the non-arena assistant branch)

- [ ] **Step 1: Apply the fix**

In `src/App.jsx`, in `applyLastMessageError`, change the final returned object from:
```js
    return {
      ...message,
      content: errorMessage,
      responseModelId: message.responseModelId || message.requestModelId || null,
    };
```
to:
```js
    return {
      ...message,
      content: errorMessage,
      responseModelId: message.responseModelId || message.requestModelId || null,
      isStreaming: false,
      agentError: true,
    };
```

- [ ] **Step 2: Run the full suite to confirm nothing broke**

Run: `npm test`
Expected: PASS (all existing tests + Tasks 1–2). No test asserts the old shape of the errored message.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "fix(chat): finalize reasoning block on generation error (stop stuck spinner)"
```

---

### Task 4: Rewire `ChatArea.jsx`

**Files:**
- Modify: `src/components/ChatArea.jsx`

- [ ] **Step 1: Replace the icon import (drop now-unused icons)**

Change line 4 from:
```js
import { Copy, Check, ChevronDown, Brain, Loader, CheckCircle, ExternalLink, Trophy, ArrowCircleLeft, ArrowCircleRight, Handshake, ThumbsDown } from './icons.jsx';
```
to:
```js
import { Copy, Check, ChevronDown, Brain, ExternalLink, Trophy, ArrowCircleLeft, ArrowCircleRight, Handshake, ThumbsDown } from './icons.jsx';
```
(Only `Loader` and `CheckCircle` become unused — they lived in `AgentThinkingBlock`. `ChevronDown` and `Brain` stay: the arena columns still render `ThinkBlock`, which uses them.)

- [ ] **Step 2: Add the new imports**

Immediately after the `import './ChatArea.css';` line, add:
```js
import { ReasoningBlock, LoadingPhrase } from './ReasoningBlock.jsx';
import { extractReasoning } from './reasoning.js';
```

- [ ] **Step 3: Delete the moved/removed helpers**

Delete these definitions from `ChatArea.jsx` (they now live in `ReasoningBlock.jsx`/`reasoning.js`):
- `function LoadingPhrase() { … }` (the whole component)
- `function formatDuration(ms) { … }`
- `function AgentThinkingBlock(...) { … }` (the whole component)
- `function StageDetail(...) { … }` (the whole component)

**Keep** `parseThinkBlocks`, `ThinkBlock`, and `MARKDOWN_COMPONENTS` — the arena columns (`segmentsA`/`segmentsB` → `ThinkBlock` / `ReactMarkdown`) still use all three. Arena reasoning rendering is intentionally out of scope.

- [ ] **Step 4: Rewrite the assistant branch of `MessageBubble`**

Replace the block that starts with `// Parse think blocks out of raw content` and the `return (` for the assistant message — specifically replace:
```js
    // Parse think blocks out of raw content, passing along thinkTime
    const segments = parseThinkBlocks(message.content || '', message.thinkTime, message.isStreaming);
    const effectiveModelId = message.responseModelId || message.requestModelId;

    return (
        <div className="message-wrapper assistant">
            <div className="message-content">
                {message.agentStages?.length > 0 && (
                    <AgentThinkingBlock
                        stages={message.agentStages}
                        summary={message.agentSummary || null}
                        thinkingContent={message.thinkingContent || ''}
                    />
                )}
                <div className="message-markdown prose">
                    {segments.map((seg, i) =>
                        seg.type === 'think' ? (
                            <ThinkBlock key={i} content={seg.content} thinkTime={seg.thinkTime} streaming={seg.streaming} />
                        ) : (
                            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                                {seg.content}
                            </ReactMarkdown>
                        )
                    )}
                </div>
```
with:
```js
    // Split the answer from the model's <think> reasoning; merge that with the
    // separately-streamed thinkingContent into one reasoning disclosure above.
    const { answer, think } = extractReasoning(message.content || '');
    const reasoning = [message.thinkingContent, think].filter(Boolean).join('\n\n');
    const effectiveModelId = message.responseModelId || message.requestModelId;

    return (
        <div className="message-wrapper assistant">
            <div className="message-content">
                <ReasoningBlock
                    stages={message.agentStages || []}
                    summary={message.agentSummary || null}
                    agentError={!!message.agentError}
                    isStreaming={!!message.isStreaming}
                    reasoning={reasoning}
                />
                <div className="message-markdown prose">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {answer}
                    </ReactMarkdown>
                </div>
```
(Leave everything from `{message.sources?.length > 0 && …}` onward unchanged.)

- [ ] **Step 5: Run tests, lint, build**

Run: `npm test && npm run lint && npm run build`
Expected: tests PASS; lint reports **0 errors** (pre-existing `react-hooks/exhaustive-deps` warnings in `App.jsx` are fine); build succeeds. If lint flags an unused import in `ChatArea.jsx`, remove that identifier from the import line.

- [ ] **Step 6: Commit**

```bash
git add src/components/ChatArea.jsx
git commit -m "refactor(chat): render unified ReasoningBlock; drop split think/stage blocks"
```

---

### Task 5: Align the shimmer phrase in the collapsed header

**Files:**
- Modify: `src/components/ChatArea.css`

- [ ] **Step 1: Add a rule so the running phrase sits inline in the header**

Append to `src/components/ChatArea.css`:
```css
/* Unified reasoning block: the rotating phrase becomes the collapsed header
   label while running, so it must sit inline (not as a centered block). */
.agent-thinking-summary .loading-phrase {
  margin: 0;
  text-align: left;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ChatArea.css
git commit -m "style(chat): inline the shimmer phrase in the reasoning header"
```

---

### Task 6: Manual verification in the running app

- [ ] **Step 1: Verify the running / done / error states**

With `npm run dev` running and the backend reachable, ask a question and confirm:
- while processing: the block is **collapsed**, showing only the rotating shimmer phrase ("Думаю…", "Обращаюсь к мудрецам Академгородка…"); clicking it expands the stages + reasoning;
- after completion: collapsed "Думал N с" with a check; expandable; the answer renders below with `<think>` content moved into the block (not inline);
- on a backend error (e.g. the 400 before raising `VLLM_MAX_MODEL_LEN`): the spinner **stops**, the friendly stub shows as the answer, and the block is still expandable.

- [ ] **Step 2: No commit** (verification only).

---

## Notes
- No backend changes (the 400/context-window issue is handled separately by raising `VLLM_MAX_MODEL_LEN`).
- Arena rendering (columns) is untouched; it keeps using `parseThinkBlocks`, `ThinkBlock`, and `MARKDOWN_COMPONENTS` (all retained in `ChatArea.jsx`) plus `LoadingPhrase` (now imported from `ReasoningBlock.jsx`).
