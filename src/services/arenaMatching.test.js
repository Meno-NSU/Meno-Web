import { describe, it, expect, vi } from 'vitest';
import { buildArenaPool, pickRandomFromPool, runArenaSideWithSubstitution } from './arenaMatching.js';

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
});
