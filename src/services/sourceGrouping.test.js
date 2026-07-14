import { describe, it, expect } from 'vitest';
import { groupSourcesByTitle, formatSourceUrl } from './sourceGrouping.js';

describe('groupSourcesByTitle', () => {
  it('merges same-titled sources and preserves first-appearance order', () => {
    const sources = [
      { document_title: 'Приёмная', source_url: 'https://a' },
      { document_title: 'Другой', source_url: 'https://x' },
      { document_title: 'Приёмная', source_url: 'https://b' },
    ];
    expect(groupSourcesByTitle(sources)).toEqual([
      { title: 'Приёмная', urls: ['https://a', 'https://b'] },
      { title: 'Другой', urls: ['https://x'] },
    ]);
  });

  it('dedupes identical urls within a group and drops empty urls', () => {
    const sources = [
      { document_title: 'T', source_url: 'https://a' },
      { document_title: 'T', source_url: 'https://a' },
      { document_title: 'T', source_url: '' },
      { document_title: 'T', source_url: 'https://b' },
    ];
    expect(groupSourcesByTitle(sources)).toEqual([{ title: 'T', urls: ['https://a', 'https://b'] }]);
  });

  it('groups empty titles together', () => {
    const sources = [
      { document_title: '', source_url: 'https://a' },
      { document_title: '', source_url: 'https://b' },
    ];
    expect(groupSourcesByTitle(sources)).toEqual([{ title: '', urls: ['https://a', 'https://b'] }]);
  });

  it('returns [] for empty/nullish input', () => {
    expect(groupSourcesByTitle([])).toEqual([]);
    expect(groupSourcesByTitle(null)).toEqual([]);
    expect(groupSourcesByTitle(undefined)).toEqual([]);
  });
});

describe('formatSourceUrl', () => {
  it('strips protocol and a trailing slash', () => {
    expect(formatSourceUrl('https://nsu.ru/n/education/apply/')).toBe('nsu.ru/n/education/apply');
    expect(formatSourceUrl('http://education.nsu.ru/bachelor')).toBe('education.nsu.ru/bachelor');
  });

  it('truncates very long urls with an ellipsis', () => {
    const long = 'https://nsu.ru/' + 'a'.repeat(100);
    const out = formatSourceUrl(long);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith('…')).toBe(true);
  });

  it('handles empty/nullish gracefully', () => {
    expect(formatSourceUrl('')).toBe('');
    expect(formatSourceUrl(null)).toBe('');
  });
});
