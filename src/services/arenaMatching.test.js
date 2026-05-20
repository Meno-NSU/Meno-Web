import { afterEach, describe, it, expect, vi } from 'vitest';
import {
    buildArenaPool,
    pickArenaPair,
    pickRandomFromPool,
    POOL_WEIGHT_OPENROUTER,
    POOL_WEIGHT_VLLM,
    runArenaSideWithSubstitution,
} from './arenaMatching.js';

describe('buildArenaPool', () => {
    it('keeps every available model, regardless of provider or featured flag', () => {
        const models = [
            { id: 'a', provider: 'vllm', status: { state: 'available' } },
            { id: 'b', provider: 'openrouter', featured: true, status: { state: 'available' } },
            { id: 'c', provider: 'openrouter', featured: true, status: { state: 'rate_limited' } },
            { id: 'd', provider: 'openrouter', featured: false, status: { state: 'available' } },
            { id: 'e', provider: 'openrouter', status: { state: 'unreachable' } },
        ];
        const pool = buildArenaPool(models);
        // a (vllm avail), b (or featured avail), d (or non-featured avail) — kept.
        // c (rate_limited), e (unreachable) — dropped.
        expect(pool.map((m) => m.id).sort()).toEqual(['a', 'b', 'd']);
    });

    it('treats missing status as available', () => {
        const pool = buildArenaPool([{ id: 'x', provider: 'openrouter' }]);
        expect(pool.map((m) => m.id)).toEqual(['x']);
    });

    it('returns empty for null/undefined input', () => {
        expect(buildArenaPool(null)).toEqual([]);
        expect(buildArenaPool(undefined)).toEqual([]);
    });
});

describe('pickRandomFromPool', () => {
    it('returns null when no candidates', () => {
        expect(pickRandomFromPool([], new Set())).toBeNull();
    });

    it('respects exclude set', () => {
        const pool = [{ id: 'a' }, { id: 'b' }];
        const exclude = new Set(['a']);
        const result = pickRandomFromPool(pool, exclude);
        expect(result.id).toBe('b');
    });
});

describe('runArenaSideWithSubstitution', () => {
    it('succeeds on first attempt when model responds', async () => {
        const pool = [{ id: 'a' }, { id: 'b' }];
        const exclude = new Set();
        const sendChat = vi.fn().mockImplementation(async ({ onEvent }) => {
            onEvent({ type: 'content', textChunk: 'hi' });
            return { content: 'hi' };
        });
        const result = await runArenaSideWithSubstitution({
            pool, exclude, kbId: 'kb', messages: [], sessionId: 's', sendChat,
            onEvent: () => {},
        });
        expect(pool.map(m => m.id)).toContain(result.model.id);
        expect(sendChat).toHaveBeenCalledTimes(1);
    });

    it('substitutes on early rate_limit failure', async () => {
        const pool = [{ id: 'a' }, { id: 'b' }];
        const exclude = new Set();
        const calls = [];
        const sendChat = vi.fn().mockImplementation(async ({ modelId, onEvent }) => {
            calls.push(modelId);
            if (calls.length === 1) {
                const err = new Error('rate'); err.code = 'model_rate_limited'; throw err;
            }
            onEvent({ type: 'content', textChunk: 'hi' });
            return { content: 'hi' };
        });
        const result = await runArenaSideWithSubstitution({
            pool, exclude, kbId: 'kb', messages: [], sessionId: 's', sendChat, onEvent: () => {},
        });
        expect(calls.length).toBe(2);
        expect(exclude.has(calls[0])).toBe(true);
        expect(result.model.id).toBe(calls[1]);
    });

    it('does NOT substitute when failure happens after first token', async () => {
        const pool = [{ id: 'a' }, { id: 'b' }];
        const exclude = new Set();
        const sendChat = vi.fn().mockImplementation(async ({ onEvent }) => {
            onEvent({ type: 'content', textChunk: 'partial' });
            const err = new Error('mid'); err.code = 'model_rate_limited'; throw err;
        });
        await expect(
            runArenaSideWithSubstitution({
                pool, exclude, kbId: 'kb', messages: [], sessionId: 's', sendChat, onEvent: () => {},
            })
        ).rejects.toThrow();
        expect(sendChat).toHaveBeenCalledTimes(1);
    });

    it('throws PoolExhausted after 3 failed attempts', async () => {
        const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        const exclude = new Set();
        const sendChat = vi.fn().mockImplementation(async () => {
            const err = new Error('rate'); err.code = 'model_rate_limited'; throw err;
        });
        await expect(
            runArenaSideWithSubstitution({
                pool, exclude, kbId: 'kb', messages: [], sessionId: 's', sendChat, onEvent: () => {},
            })
        ).rejects.toThrow(/exhausted/i);
        expect(sendChat).toHaveBeenCalledTimes(3);
    });

    // Real-stand symptoms: OR proxy returned 200 OK then sent an error chunk
    // ("JAX does not support per-request seed"), and our backend mapped it
    // to invalid_upstream_request. With the old `code !== rate_limited &&
    // code !== unreachable → throw` logic the arena side died silently and
    // the frontend then sent a vote with a null model_b → backend 422.
    it.each([
        'invalid_upstream_request',
        'context_length_exceeded',
        'transient_timeout',
        'transient_upstream_5xx',
        'transient_network',
        'internal_error',
    ])('substitutes on pre-stream %s failure', async (code) => {
        const pool = [{ id: 'a' }, { id: 'b' }];
        const exclude = new Set();
        const calls = [];
        const sendChat = vi.fn().mockImplementation(async ({ modelId, onEvent }) => {
            calls.push(modelId);
            if (calls.length === 1) {
                const err = new Error('first model rejects'); err.code = code; throw err;
            }
            onEvent({ type: 'content', textChunk: 'hi' });
            return { content: 'hi' };
        });
        const result = await runArenaSideWithSubstitution({
            pool, exclude, kbId: 'kb', messages: [], sessionId: 's', sendChat, onEvent: () => {},
        });
        expect(calls.length).toBe(2);
        expect(exclude.has(calls[0])).toBe(true);
        expect(result.model.id).toBe(calls[1]);
    });

    it('substitutes even on totally unknown error code (no code at all)', async () => {
        const pool = [{ id: 'a' }, { id: 'b' }];
        const exclude = new Set();
        let calls = 0;
        const sendChat = vi.fn().mockImplementation(async ({ onEvent }) => {
            calls += 1;
            if (calls === 1) throw new Error('something weird');
            onEvent({ type: 'content', textChunk: 'hi' });
            return { content: 'hi' };
        });
        const result = await runArenaSideWithSubstitution({
            pool, exclude, kbId: 'kb', messages: [], sessionId: 's', sendChat, onEvent: () => {},
        });
        expect(calls).toBe(2);
        expect(result.model).toBeDefined();
    });

    it('uses the initialCandidate on the first attempt when provided', async () => {
        const pool = [
            { id: 'a', provider: 'vllm' },
            { id: 'b', provider: 'vllm' },
            { id: 'c', provider: 'openrouter' },
        ];
        const exclude = new Set();
        const seen = [];
        const sendChat = vi.fn().mockImplementation(async ({ modelId, onEvent }) => {
            seen.push(modelId);
            onEvent({ type: 'content', textChunk: 'hi' });
            return { content: 'hi' };
        });
        const result = await runArenaSideWithSubstitution({
            pool, exclude, kbId: 'kb', messages: [], sessionId: 's',
            sendChat, onEvent: () => {},
            initialCandidate: pool[2],
        });
        expect(result.model.id).toBe('c');
        expect(seen[0]).toBe('c');
    });

    it('falls back to weighted pick when initialCandidate is already excluded', async () => {
        const pool = [
            { id: 'a', provider: 'vllm' },
            { id: 'b', provider: 'vllm' },
        ];
        // pre-exclude the initial candidate (other side picked it first)
        const exclude = new Set(['a']);
        const sendChat = vi.fn().mockImplementation(async ({ onEvent }) => {
            onEvent({ type: 'content', textChunk: 'hi' });
            return { content: 'hi' };
        });
        const result = await runArenaSideWithSubstitution({
            pool, exclude, kbId: 'kb', messages: [], sessionId: 's',
            sendChat, onEvent: () => {},
            initialCandidate: pool[0],
        });
        expect(result.model.id).toBe('b');
    });
});

describe('pickRandomFromPool — weighted', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('returns the only vLLM candidate when randomness falls in its slot', () => {
        // Two candidates: vLLM weight 3, OpenRouter weight 1, total = 4.
        // Math.random() = 0.1 → r = 0.4, which lands inside the vLLM slot (0..3).
        const pool = [
            { id: 'v', provider: 'vllm' },
            { id: 'o', provider: 'openrouter' },
        ];
        vi.spyOn(Math, 'random').mockReturnValue(0.1);
        expect(pickRandomFromPool(pool, new Set()).id).toBe('v');
    });

    it('returns the OpenRouter candidate when randomness lands in the tail slot', () => {
        // Same pool, weights [3, 1], total 4. Math.random() = 0.9 → r = 3.6,
        // which lands AFTER the vLLM slot (>3) → openrouter wins.
        const pool = [
            { id: 'v', provider: 'vllm' },
            { id: 'o', provider: 'openrouter' },
        ];
        vi.spyOn(Math, 'random').mockReturnValue(0.9);
        expect(pickRandomFromPool(pool, new Set()).id).toBe('o');
    });

    it('biases the empirical distribution towards vLLM over many trials', () => {
        const pool = [
            { id: 'v', provider: 'vllm' },
            { id: 'o', provider: 'openrouter' },
        ];
        let vllmHits = 0;
        const N = 4000;
        for (let i = 0; i < N; i++) {
            if (pickRandomFromPool(pool, new Set()).id === 'v') vllmHits++;
        }
        // Expected vLLM share: WEIGHT_V / (WEIGHT_V + WEIGHT_OR) = 3 / 4 = 0.75.
        // Loose bounds to avoid flaky tests on real RNG.
        const share = vllmHits / N;
        const expected = POOL_WEIGHT_VLLM / (POOL_WEIGHT_VLLM + POOL_WEIGHT_OPENROUTER);
        expect(share).toBeGreaterThan(expected - 0.04);
        expect(share).toBeLessThan(expected + 0.04);
    });
});

describe('pickArenaPair', () => {
    it('returns two distinct candidates', () => {
        const pool = [
            { id: 'a', provider: 'vllm' },
            { id: 'b', provider: 'vllm' },
            { id: 'c', provider: 'openrouter' },
        ];
        for (let i = 0; i < 200; i++) {
            const pair = pickArenaPair(pool);
            expect(pair).not.toBeNull();
            expect(pair.a.id).not.toBe(pair.b.id);
        }
    });

    it('returns null when the pool has fewer than 2 eligible candidates', () => {
        expect(pickArenaPair([])).toBeNull();
        expect(pickArenaPair([{ id: 'only', provider: 'vllm' }])).toBeNull();
        expect(pickArenaPair([{ id: 'only', provider: 'vllm' }, { id: 'gone', provider: 'vllm' }], new Set(['only', 'gone']))).toBeNull();
    });

    it('honours the caller-provided exclude set', () => {
        const pool = [
            { id: 'a', provider: 'vllm' },
            { id: 'b', provider: 'vllm' },
            { id: 'c', provider: 'openrouter' },
        ];
        for (let i = 0; i < 50; i++) {
            const pair = pickArenaPair(pool, new Set(['a']));
            expect(pair.a.id).not.toBe('a');
            expect(pair.b.id).not.toBe('a');
            expect(pair.a.id).not.toBe(pair.b.id);
        }
    });
});
