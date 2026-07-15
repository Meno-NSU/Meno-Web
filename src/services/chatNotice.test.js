import { afterEach, describe, it, expect } from 'vitest';
import { buildErrorNotice, buildStopNotice, formatNotice } from './chatNotice.js';
import { setLanguage, translateOnce } from '../i18n.js';

afterEach(() => setLanguage('ru'));

describe('buildStopNotice', () => {
  it('is a neutral stopped descriptor', () => {
    expect(buildStopNotice()).toEqual({ kind: 'stopped', key: 'stopped' });
  });
});

describe('buildErrorNotice — descriptor per code', () => {
  it('chat_timeout with load → overloadWithLoad + {n}', () => {
    expect(buildErrorNotice({ code: 'chat_timeout' }, { load: { showLoad: true, count: 12 } }))
      .toEqual({ kind: 'error', key: 'overloadWithLoad', params: { n: 12 } });
  });
  it('chat_timeout without load → overloadBusy', () => {
    expect(buildErrorNotice({ code: 'chat_timeout' }, { load: { showLoad: false, count: 2 } }))
      .toEqual({ kind: 'error', key: 'overloadBusy' });
  });
  it('chat_timeout with no load object → overloadBusy', () => {
    expect(buildErrorNotice({ code: 'chat_timeout' })).toEqual({ kind: 'error', key: 'overloadBusy' });
  });
  it('model_unreachable → modelUnreachable', () => {
    expect(buildErrorNotice({ code: 'model_unreachable' })).toEqual({ kind: 'error', key: 'modelUnreachable' });
  });
  it('core_model_unavailable → coreModelUnavailable', () => {
    expect(buildErrorNotice({ code: 'core_model_unavailable' })).toEqual({ kind: 'error', key: 'coreModelUnavailable' });
  });
  it('model_rate_limited (no until) → modelRateLimited with placeholder params', () => {
    expect(buildErrorNotice({ code: 'model_rate_limited', until: null }))
      .toEqual({ kind: 'error', key: 'modelRateLimited', params: { hh: '??', mm: '??', mins: '?' } });
  });
  it('unknown code → botUnavailable', () => {
    expect(buildErrorNotice({ code: 'whatever_else' })).toEqual({ kind: 'error', key: 'botUnavailable' });
  });
});

describe('formatNotice', () => {
  it('interpolates every param with an injected t', () => {
    const t = (k) => ({ overloadWithLoad: '~{n} in progress' }[k] || k);
    expect(formatNotice(t, { key: 'overloadWithLoad', params: { n: 12 } })).toBe('~12 in progress');
  });
  it('returns "" for a null notice', () => {
    expect(formatNotice((k) => k, null)).toBe('');
  });
  it('re-translates live when the language changes (real keys exist in ru & en)', () => {
    setLanguage('ru');
    expect(formatNotice(translateOnce, buildStopNotice())).toBe('Остановлено');
    setLanguage('en');
    expect(formatNotice(translateOnce, buildStopNotice())).toBe('Stopped');
  });
});
