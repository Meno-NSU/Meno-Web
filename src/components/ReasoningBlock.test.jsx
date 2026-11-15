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
