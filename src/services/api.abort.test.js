import { describe, it, expect } from 'vitest';
import { abortErrorFor, ChatTimeoutError, ChatAbortedError } from './api.js';

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

describe('abortErrorFor', () => {
  it('maps the 120s timeout to ChatTimeoutError', () => {
    const e = abortErrorFor({ timeoutFired: true, error: abortError(), modelId: 'm' });
    expect(e).toBeInstanceOf(ChatTimeoutError);
    expect(e.code).toBe('chat_timeout');
  });
  it('maps a user abort (no timeout) to ChatAbortedError', () => {
    const e = abortErrorFor({ timeoutFired: false, error: abortError(), modelId: 'm' });
    expect(e).toBeInstanceOf(ChatAbortedError);
    expect(e.code).toBe('user_stopped');
  });
  it('passes a genuine network error through unchanged', () => {
    const net = new TypeError('Failed to fetch');
    expect(abortErrorFor({ timeoutFired: false, error: net, modelId: 'm' })).toBe(net);
  });
});
