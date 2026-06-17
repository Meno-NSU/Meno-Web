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
