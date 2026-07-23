import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ensureGuestSession, fetchModels, getGuestToken, recordArenaTurn, sendChatMessage, setAuthToken, setGuestToken } from './api.js';

beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('guest token storage', () => {
    it('round-trips the guest token via localStorage', () => {
        setGuestToken('gt-1');
        expect(getGuestToken()).toBe('gt-1');
        setGuestToken(null);
        expect(getGuestToken()).toBeNull();
    });
});

describe('ensureGuestSession', () => {
    it('mints and caches a token when none exists, and is a no-op afterwards', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ guest_session_id: 'gs', guest_token: 'gt', expires_at: 'z' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const token = await ensureGuestSession();
        expect(token).toBe('gt');
        expect(getGuestToken()).toBe('gt');
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await ensureGuestSession(); // token already cached → no second request
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('request auth headers', () => {
    it('sends X-Guest-Token for a guest with no JWT', async () => {
        setGuestToken('gt');
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
        vi.stubGlobal('fetch', fetchMock);

        await fetchModels();
        const opts = fetchMock.mock.calls[0][1] || {};
        expect(opts.headers?.['X-Guest-Token']).toBe('gt');
        expect(opts.headers?.Authorization).toBeUndefined();
    });

    it('prefers the JWT and omits the guest token when signed in', async () => {
        setAuthToken('jwt');
        setGuestToken('gt');
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
        vi.stubGlobal('fetch', fetchMock);

        await fetchModels();
        const opts = fetchMock.mock.calls[0][1] || {};
        expect(opts.headers?.['X-Auth-Token']).toBe('jwt');
        expect(opts.headers?.['X-Guest-Token']).toBeUndefined();
    });

    it('never sets Authorization — the edge gate owns that header', async () => {
        // The public edge gates the site with HTTP Basic Auth on Authorization. Setting it
        // here would replace the browser's gate credentials and trigger a 401 prompt storm.
        setAuthToken('jwt');
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
        vi.stubGlobal('fetch', fetchMock);

        await fetchModels();
        const opts = fetchMock.mock.calls[0][1] || {};
        expect(opts.headers?.Authorization).toBeUndefined();
    });
});

describe('arena chat requests', () => {
    it('marks the request so the backend does not persist each side separately', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: 'c1', choices: [{ message: { content: 'a' } }], sources: [] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await sendChatMessage({ messages: [], modelId: 'm', knowledgeBaseId: 'kb', sessionId: 's', arena: true });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.arena).toBe(true);
    });

    it('omits the flag for an ordinary chat request', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: 'c1', choices: [{ message: { content: 'a' } }], sources: [] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await sendChatMessage({ messages: [], modelId: 'm', knowledgeBaseId: 'kb', sessionId: 's' });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.arena).toBeUndefined();
    });
});

describe('recordArenaTurn', () => {
    it('posts the finished comparison with both sides', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
        vi.stubGlobal('fetch', fetchMock);

        await recordArenaTurn({
            sessionId: 'c1',
            question: 'Вопрос?',
            turnIndex: 0,
            sides: [
                { key: 'a', model: 'qwen', knowledgeBaseId: 'kb1', content: 'A', sources: [] },
                { key: 'b', model: 'llama', knowledgeBaseId: 'kb1', content: 'B', sources: [] },
            ],
        });

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toContain('/v1/arena/turn');
        const body = JSON.parse(options.body);
        expect(body.session_id).toBe('c1');
        expect(body.turn_index).toBe(0);
        expect(body.sides.map((s) => s.key)).toEqual(['a', 'b']);
        expect(body.sides[0].knowledge_base_id).toBe('kb1');
    });
});
