import { describe, it, expect } from 'vitest';
import { translationKeys } from './i18n.js';

describe('i18n ru/en parity', () => {
  it('defines exactly the same keys in ru and en', () => {
    const ru = new Set(translationKeys('ru'));
    const en = new Set(translationKeys('en'));
    const onlyRu = [...ru].filter((k) => !en.has(k));
    const onlyEn = [...en].filter((k) => !ru.has(k));
    expect({ onlyRu, onlyEn }).toEqual({ onlyRu: [], onlyEn: [] });
  });
});
