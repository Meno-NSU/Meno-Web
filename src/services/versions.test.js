import { describe, it, expect } from 'vitest'
import {
  MENON_10,
  MENON_11,
  BUILTIN_VERSION_KEYS,
  describeEntry,
  groupByVersion,
  versionName,
  isUsable,
  isAvailable,
  rememberVersions,
  defaultModelId,
  fallbackModelId,
} from './versions.js'

describe('describeEntry', () => {
  it('uses backend fields when stand_id is present', () => {
    expect(
      describeEntry({
        id: 'gemma-4-12B-it@menon-1.1',
        stand_id: 'menon-1.1',
        stand_name: 'Менон 1.1',
        llm_id: 'gemma-4-12B-it',
        llm_name: 'Gemma 4 12B',
      }),
    ).toEqual({
      standId: 'menon-1.1',
      standName: 'Менон 1.1',
      llmId: 'gemma-4-12B-it',
      llmName: 'Gemma 4 12B',
    })
  })

  it('derives a plain id as menon-1.0', () => {
    expect(describeEntry({ id: 'meno-lite', provider: 'vllm', display_name: 'meno-lite' })).toEqual({
      standId: 'menon-1.0',
      standName: 'menon-1.0',
      llmId: 'meno-lite',
      llmName: 'meno-lite',
    })
  })

  it('derives a menon-1.1 suffix', () => {
    const d = describeEntry({
      id: 'meno-lite@menon-1.1',
      provider: 'vllm',
      display_name: 'Менон 1.1 (meno-lite)',
    })
    expect(d.standId).toBe('menon-1.1')
    expect(d.llmId).toBe('meno-lite')
    expect(d.llmName).toBe('meno-lite')
  })

  it('derives an external stand', () => {
    expect(
      describeEntry({
        id: 'gemma@lab',
        provider: 'external',
        backend_name: 'RAGU',
        display_name: 'Gemma 4',
      }),
    ).toEqual({ standId: 'lab', standName: 'RAGU', llmId: 'gemma', llmName: 'Gemma 4' })
  })

  it('keeps a provider id with @ under menon-1.0', () => {
    expect(
      describeEntry({ id: 'vendor/model@beta', provider: 'openrouter', display_name: 'Beta' }),
    ).toMatchObject({ standId: 'menon-1.0', llmId: 'vendor/model@beta', llmName: 'Beta' })
  })
})

describe('groupByVersion', () => {
  it('puts RAGU first, then Менон 1.1, then other stands, and the legacy Менон 1.0 last', () => {
    const models = [
      { id: 'a' },
      { id: 'b@menon-1.1' },
      { id: 'c' },
      { id: 'd@lab', provider: 'external' },
      { id: 'e@ragu', provider: 'external' },
      { id: 'f@zoo', provider: 'external' },
    ]
    const groups = groupByVersion(models)
    expect(groups.map((g) => g.standId)).toEqual(['ragu', 'menon-1.1', 'lab', 'zoo', 'menon-1.0'])
    expect(groups[4].entries.map((e) => e.id)).toEqual(['a', 'c'])
  })
})

describe('defaultModelId', () => {
  const stand = (id, extra = {}) => ({ id, provider: 'external', ...extra })
  const prod = [
    { id: 'meno-lite' },
    { id: 'gemma-4-12B-it' },
    { id: 'meno-lite@menon-1.1' },
    { id: 'gemma-4-12B-it@menon-1.1' },
    stand('meno-lite@ragu'),
    stand('gemma-4-12B-it@ragu'),
  ]

  it('is RAGU with Gemma', () => {
    expect(defaultModelId(prod)).toBe('gemma-4-12B-it@ragu')
  })

  it('is Менон 1.1 with Gemma while RAGU with Gemma is unreachable', () => {
    const models = prod.map((m) => (m.id === 'gemma-4-12B-it@ragu' ? { ...m, status: { state: 'unreachable' } } : m))
    expect(defaultModelId(models)).toBe('gemma-4-12B-it@menon-1.1')
  })

  it('is the first Менон 1.0 model when neither is listed', () => {
    expect(defaultModelId(prod.filter((m) => !m.id.startsWith('gemma-4-12B-it@')))).toBe('meno-lite')
  })

  it('skips an entry that needs sign-in', () => {
    const models = [{ id: 'meno-lite' }, stand('gemma-4-12B-it@ragu', { requires_auth: true })]
    expect(defaultModelId(models)).toBe('meno-lite')
  })

  it('takes an unavailable choice over the rest of the list when nothing it names is available', () => {
    const down = { status: { state: 'unreachable' } }
    const models = [stand('x@lab'), stand('gemma-4-12B-it@ragu', down), { id: 'gemma-4-12B-it@menon-1.1', ...down }]
    expect(defaultModelId(models)).toBe('gemma-4-12B-it@ragu')
  })

  it('is the first usable entry when no choice is listed', () => {
    expect(defaultModelId([stand('x@lab', { requires_auth: true }), stand('y@lab')])).toBe('y@lab')
  })
})

describe('versionName', () => {
  it('translates built-ins and uses standName otherwise', () => {
    const t = (k) => `T:${k}`
    expect(BUILTIN_VERSION_KEYS[MENON_11]).toBe('versionMenon11')
    expect(versionName({ standId: MENON_10, standName: 'x' }, t)).toBe('T:versionMenon10')
    expect(versionName({ standId: 'lab', standName: 'RAGU' }, t)).toBe('RAGU')
  })
})

describe('isUsable / isAvailable', () => {
  it('works', () => {
    expect(isUsable({ requires_auth: true })).toBe(false)
    expect(isUsable({})).toBe(true)
    expect(isAvailable({})).toBe(true)
    expect(isAvailable({ status: { state: 'unreachable' } })).toBe(false)
  })
})

describe('rememberVersions', () => {
  it('records id to standId', () => {
    const known = new Map()
    rememberVersions(known, [{ id: 'a' }, { id: 'b@menon-1.1' }])
    expect(known.get('a')).toBe('menon-1.0')
    expect(known.get('b@menon-1.1')).toBe('menon-1.1')
  })
})

describe('fallbackModelId', () => {
  const base = [{ id: 'meno-lite' }, { id: 'gemma-4-12B-it' }, { id: 'meno-lite@menon-1.1' }]

  it('keeps a usable current entry', () => {
    expect(fallbackModelId(base, 'gemma-4-12B-it', new Map())).toBe('gemma-4-12B-it')
  })

  it('keeps a rate-limited current entry', () => {
    const models = [{ id: 'meno-lite' }, { id: 'x', status: { state: 'rate_limited' } }]
    expect(fallbackModelId(models, 'x', new Map())).toBe('x')
  })

  it('stays in the version of a vanished 1.1 entry', () => {
    expect(fallbackModelId(base, 'gemma-4-12B-it@menon-1.1', new Map())).toBe('meno-lite@menon-1.1')
  })

  it('prefers available within the version', () => {
    const models = [
      { id: 'meno-lite' },
      { id: 'x@menon-1.1', status: { state: 'unreachable' } },
      { id: 'y@menon-1.1', status: { state: 'available' } },
    ]
    expect(fallbackModelId(models, 'z@menon-1.1', new Map())).toBe('y@menon-1.1')
  })

  it('falls to the first 1.0 entry when the known version is gone', () => {
    const known = new Map([['q@lab', 'lab']])
    expect(fallbackModelId(base, 'q@lab', known)).toBe('meno-lite')
  })

  it('replaces a listed entry that requires auth', () => {
    const models = [{ id: 'meno-lite' }, { id: 'or/x', provider: 'openrouter', requires_auth: true }]
    expect(fallbackModelId(models, 'or/x', new Map())).toBe('meno-lite')
  })

  it('uses known for an odd id', () => {
    const known = new Map([['a@weird', 'menon-1.1']])
    expect(fallbackModelId(base, 'a@weird', known)).toBe('meno-lite@menon-1.1')
  })

  it('treats a vanished provider id with @ as 1.0', () => {
    expect(fallbackModelId(base, 'vendor/model@beta', new Map())).toBe('meno-lite')
  })

  it('gives the default for no id at all', () => {
    const models = [...base, { id: 'gemma-4-12B-it@ragu', provider: 'external' }]
    expect(fallbackModelId(models, '', new Map())).toBe('gemma-4-12B-it@ragu')
  })

  it('gives the default, not Менон 1.0, for a RAGU pick while RAGU is not listed', () => {
    const models = [...base, { id: 'gemma-4-12B-it@menon-1.1' }]
    expect(fallbackModelId(models, 'gemma-4-12B-it@ragu', new Map())).toBe('gemma-4-12B-it@menon-1.1')
  })

  it('gives the default when the known version is gone', () => {
    const models = [...base, { id: 'gemma-4-12B-it@ragu', provider: 'external' }]
    expect(fallbackModelId(models, 'q@lab', new Map([['q@lab', 'lab']]))).toBe('gemma-4-12B-it@ragu')
  })

  it('returns currentId for an empty list', () => {
    expect(fallbackModelId([], 'abc', new Map())).toBe('abc')
  })

  it('returns empty string when nothing is usable', () => {
    const models = [{ id: 'a', requires_auth: true }]
    expect(fallbackModelId(models, 'gone', new Map())).toBe('')
  })
})
