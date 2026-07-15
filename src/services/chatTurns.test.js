import { describe, it, expect } from 'vitest';
import { dropTrailingNotice, isInterruptedAssistant } from './chatTurns.js';

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
