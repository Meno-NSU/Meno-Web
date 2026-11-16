import { describe, it, expect } from 'vitest';
import { extractReasoning, deriveReasoningStatus, formatDuration, stageDisplayStatus, hasReasoningBlock } from './reasoning.js';

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

describe('formatDuration', () => {
  it('formats sub-second as ms and seconds with one decimal', () => {
    expect(formatDuration(450)).toBe('450ms');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(null)).toBe('');
  });
});

describe('stageDisplayStatus', () => {
  it('keeps every stage as it is while the answer runs', () => {
    for (const s of ['running', 'complete', 'failed', 'skipped']) expect(stageDisplayStatus(s, 'running')).toBe(s);
  });
  it('shows a stage still running when the answer was stopped or failed as cut off', () => {
    expect(stageDisplayStatus('running', 'stopped')).toBe('interrupted');
    expect(stageDisplayStatus('running', 'errored')).toBe('interrupted');
  });
  it('shows a stage still running when the answer finished normally as complete', () => {
    expect(stageDisplayStatus('running', 'done')).toBe('complete');
  });
  it('never changes a stage that has its own end', () => {
    for (const block of ['stopped', 'errored', 'done']) {
      for (const s of ['complete', 'failed', 'skipped']) expect(stageDisplayStatus(s, block)).toBe(s);
    }
  });
});

describe('hasReasoningBlock', () => {
  it('is shown for stages, for reasoning text, and while waiting for the first stage', () => {
    expect(hasReasoningBlock({ stages: [{ stage: 'retrieval' }] })).toBe(true);
    expect(hasReasoningBlock({ stages: [], reasoning: 'думаю' })).toBe(true);
    expect(hasReasoningBlock({ stages: [], pending: true, isStreaming: true })).toBe(true);
  });
  it('is not shown with nothing to show', () => {
    expect(hasReasoningBlock({ stages: [], reasoning: '  ' })).toBe(false);
    expect(hasReasoningBlock({ stages: [], pending: true, isStreaming: false })).toBe(false);
    expect(hasReasoningBlock({})).toBe(false);
  });
});
