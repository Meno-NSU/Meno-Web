import { afterEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

  it('renders a neutral interrupted header — stopped marker, no spinner, no "!"', () => {
    const { container, queryByText } = render(
      <ReasoningBlock stages={RUNNING} summary={null} interrupted={true} isStreaming={false} />
    );
    expect(container.querySelector('.agent-thinking-block.stopped')).not.toBeNull(); // positive marker unique to 'stopped'
    expect(container.querySelector('.spinning')).toBeNull();
    expect(container.querySelector('.loading-phrase')).toBeNull();
    expect(queryByText('!')).toBeNull();
  });
});

describe('ReasoningBlock — stage names', () => {
  it('never shows a raw i18n key for a stage it has no name for', () => {
    const stages = [{ stage: 'prepare', status: 'complete', durationMs: 10 }, { stage: 'some_new_stage', status: 'complete' }];
    const { container } = render(<ReasoningBlock stages={stages} summary={{ totalMs: 10 }} isStreaming={false} />);
    fireEvent.click(container.querySelector('.agent-thinking-summary'));
    expect(container.textContent).not.toMatch(/stage_/);
    expect(container.textContent).not.toMatch(/some_new_stage/);
  });

  it('keeps the running phrase on one line so the answer below does not jump', () => {
    const { container } = render(<ReasoningBlock stages={RUNNING} summary={null} isStreaming={true} />);
    expect(container.querySelector('.agent-thinking-summary .loading-phrase')).not.toBeNull();
    const css = readFileSync('src/components/ChatArea.css', 'utf-8');
    const rule = css.match(/\.agent-thinking-summary \.loading-phrase \{[^}]*\}/)[0];
    expect(rule).toMatch(/white-space:\s*nowrap/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
  });
});

// The person pressed stop (or the request failed) while a stage was running: that
// stage keeps status 'running' in the message forever, since no "completed" event
// will ever come for it.
describe('ReasoningBlock — an answer that ended early', () => {
  const CUT_AT_SEARCH = [
    { stage: 'query_rewrite', status: 'complete', durationMs: 300 },
    { stage: 'retrieval', status: 'running', durationMs: null },
  ];
  const open = (container) => fireEvent.click(container.querySelector('.agent-thinking-summary'));
  const row = (container, label) => [...container.querySelectorAll('.agent-stage-row')].find((r) => r.textContent.includes(label));

  it('spins nothing after a stop: the cut stage is static and marked, finished stages stay finished', () => {
    const { container } = render(<ReasoningBlock stages={CUT_AT_SEARCH} interrupted stoppedByUser isStreaming={false} />);
    open(container);
    expect(container.querySelector('.spinning')).toBeNull();
    expect(container.querySelector('.agent-stage-row.running')).toBeNull();
    const cut = row(container, 'Поиск по базе знаний');
    expect(cut.classList.contains('interrupted')).toBe(true);
    expect(cut.querySelector('.agent-stage-icon svg')).not.toBeNull(); // the stop mark
    expect(row(container, 'Переформулировка запроса').classList.contains('complete')).toBe(true);
  });

  it('spins nothing after a failure either', () => {
    // ChatArea passes a failure as `interrupted` without `stoppedByUser`.
    const { container } = render(<ReasoningBlock stages={CUT_AT_SEARCH} interrupted isStreaming={false} />);
    open(container);
    expect(container.querySelector('.spinning')).toBeNull();
    expect(row(container, 'Поиск по базе знаний').classList.contains('interrupted')).toBe(true);
  });

  it('says in its header that the answer was stopped, with the time it ran', () => {
    const { container } = render(<ReasoningBlock stages={CUT_AT_SEARCH} interrupted stoppedByUser isStreaming={false} />);
    expect(container.querySelector('.agent-thinking-summary').textContent).toBe('Остановлено · 0.3 с');
  });

  it('says it in English too', () => {
    setLanguage('en');
    const { container } = render(<ReasoningBlock stages={CUT_AT_SEARCH} interrupted stoppedByUser isStreaming={false} />);
    expect(container.querySelector('.agent-thinking-summary').textContent).toBe('Stopped · 0.3 s');
  });

  it('says just "Остановлено" when no stage had finished yet', () => {
    const stages = [{ stage: 'query_rewrite', status: 'running', durationMs: null }];
    const { container } = render(<ReasoningBlock stages={stages} interrupted stoppedByUser isStreaming={false} />);
    expect(container.querySelector('.agent-thinking-summary').textContent).toBe('Остановлено');
  });

  it('keeps the time header after a failure — the notice below says what went wrong', () => {
    const { container } = render(<ReasoningBlock stages={CUT_AT_SEARCH} interrupted isStreaming={false} />);
    expect(container.querySelector('.agent-thinking-summary').textContent).toBe('Обработка заняла 0.3 сек');
  });
});

describe('ReasoningBlock — a normally finished answer', () => {
  const FINISHED = [
    { stage: 'query_rewrite', status: 'complete', durationMs: 300 },
    { stage: 'generation', status: 'complete', durationMs: 3000 },
  ];

  it('keeps its look: elapsed-time header, checked stages, no stop mark', () => {
    const { container } = render(<ReasoningBlock stages={FINISHED} summary={{ totalMs: 4500 }} isStreaming={false} />);
    expect(container.querySelector('.agent-thinking-summary').textContent).toBe('Обработка заняла 4.5 сек');
    expect(container.querySelector('.agent-thinking-block.complete')).not.toBeNull();
    fireEvent.click(container.querySelector('.agent-thinking-summary'));
    const rows = [...container.querySelectorAll('.agent-stage-row')];
    expect(rows.map((r) => r.className)).toEqual(['agent-stage-row complete', 'agent-stage-row complete']);
    expect(container.querySelector('.spinning')).toBeNull();
  });

  it('shows a stage whose end never came as finished once the answer is done', () => {
    const stages = [FINISHED[0], { stage: 'generation', status: 'running', durationMs: null }];
    const { container } = render(<ReasoningBlock stages={stages} summary={null} isStreaming={false} />);
    fireEvent.click(container.querySelector('.agent-thinking-summary'));
    expect(container.querySelector('.spinning')).toBeNull();
    expect([...container.querySelectorAll('.agent-stage-row')].every((r) => r.classList.contains('complete'))).toBe(true);
  });

  it('still spins the running stage while the answer streams', () => {
    const stages = [FINISHED[0], { stage: 'generation', status: 'running', durationMs: null }];
    const { container } = render(<ReasoningBlock stages={stages} summary={null} isStreaming={true} />);
    fireEvent.click(container.querySelector('.agent-thinking-summary'));
    expect(container.querySelector('.agent-stage-row.running .spinning')).not.toBeNull();
  });
});

describe('ReasoningBlock — the real time an ended answer ran', () => {
  const CUT = [
    { stage: 'query_rewrite', status: 'complete', durationMs: 300 },
    { stage: 'generation', status: 'running', durationMs: null },
  ];
  const header = (container) => container.querySelector('.agent-thinking-summary').textContent;

  it('states the time from the request to the stop, not just the finished stages', () => {
    const { container } = render(<ReasoningBlock stages={CUT} interrupted stoppedByUser elapsedMs={4100} isStreaming={false} />);
    expect(header(container)).toBe('Остановлено · 4.1 с');
  });

  it('states the time to the failure for a failed answer', () => {
    const { container } = render(<ReasoningBlock stages={CUT} interrupted elapsedMs={4100} isStreaming={false} />);
    expect(header(container)).toBe('Обработка заняла 4.1 сек');
  });

  it('keeps the summary time of a finished answer', () => {
    const { container } = render(<ReasoningBlock stages={CUT} summary={{ totalMs: 4500 }} elapsedMs={9000} isStreaming={false} />);
    expect(header(container)).toBe('Обработка заняла 4.5 сек');
  });
});

describe('ReasoningBlock — the accent border is for a running answer only', () => {
  const css = readFileSync('src/components/ChatArea.css', 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
  const borderOf = (cls) => {
    const rule = [...css.matchAll(/([^{}]*)\{([^}]*)\}/g)]
      .find(([, sel, body]) => sel.split(',').some((s) => s.trim() === `.agent-thinking-block.${cls}`) && /border-left-color/.test(body));
    return rule?.[2].match(/border-left-color:\s*([^;]+);/)[1].trim();
  };

  it('greys the border of a stopped or failed answer the same as a finished one', () => {
    expect(borderOf('complete')).toBe('var(--text-tertiary)');
    expect(borderOf('stopped')).toBe(borderOf('complete'));
  });

  it('marks a stopped and a failed answer as such (a failure reaches the block as interrupted)', () => {
    const stages = [{ stage: 'retrieval', status: 'running' }];
    const { container, rerender } = render(<ReasoningBlock stages={stages} interrupted stoppedByUser isStreaming={false} />);
    expect(container.querySelector('.agent-thinking-block.stopped')).not.toBeNull();
    rerender(<ReasoningBlock stages={stages} interrupted isStreaming={false} />);
    expect(container.querySelector('.agent-thinking-block.stopped')).not.toBeNull();
  });
});
