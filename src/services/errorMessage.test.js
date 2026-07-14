import { afterEach, describe, it, expect } from 'vitest';
import { buildErrorMessage } from './errorMessage.js';
import { setLanguage } from '../i18n.js';

afterEach(() => {
  setLanguage('ru'); // restore the default language between tests
});

describe('buildErrorMessage — friendly localized fallback', () => {
  it('returns the friendly RU stub for an unknown backend error code', () => {
    setLanguage('ru');
    const msg = buildErrorMessage({
      code: 'service_unavailable',
      message: 'RAG resources are not initialized.',
    });
    expect(msg).toContain('Меня уже чинят');
    expect(msg).not.toContain('RAG resources'); // raw developer message never leaks
    expect(msg).not.toContain('⚠');
  });

  it('returns the friendly EN stub when the UI language is English', () => {
    setLanguage('en');
    const msg = buildErrorMessage({ code: 'some_unmapped_code' });
    expect(msg).toContain("I'm being fixed");
    expect(msg).not.toContain('⚠');
  });

  it('leaves the known error codes unchanged', () => {
    setLanguage('en');
    expect(buildErrorMessage({ code: 'model_unreachable' })).toContain('unreachable');
    expect(buildErrorMessage({ code: 'core_model_unavailable' })).toContain('Internal RAG model');
    expect(buildErrorMessage({ code: 'model_rate_limited', until: null })).toContain('rate-limited');
  });
});

describe('buildErrorMessage — chat_timeout becomes an overload message', () => {
  it('shows the load count when showLoad is true (RU)', () => {
    setLanguage('ru');
    const msg = buildErrorMessage({ code: 'chat_timeout' }, { load: { showLoad: true, count: 12 } });
    expect(msg).toContain('перегружен');
    expect(msg).toContain('12');
    expect(msg).not.toContain('{n}');
  });

  it('shows the busy message when showLoad is false (EN)', () => {
    setLanguage('en');
    const msg = buildErrorMessage({ code: 'chat_timeout' }, { load: { showLoad: false, count: 2 } });
    expect(msg).toContain('busy');
    expect(msg).not.toContain('2 requests');
  });

  it('falls back to the busy message when no load is provided', () => {
    setLanguage('en');
    expect(buildErrorMessage({ code: 'chat_timeout' })).toContain('busy');
  });
});
