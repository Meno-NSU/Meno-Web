import { describe, it, expect, beforeEach } from 'vitest';

import { clearChats, createNewChat, loadChats, saveChats } from './chatStore.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(() => {
    localStorage.clear();
});

describe('createNewChat id', () => {
    it('uses a crypto UUID (not a short Math.random id) and is unique', () => {
        const a = createNewChat();
        const b = createNewChat();
        expect(a.id).toMatch(UUID_RE);
        expect(b.id).toMatch(UUID_RE);
        expect(a.id).not.toBe(b.id);
        // the id is reused as the backend session id
        expect(a.runtimeConfig.sessionId).toBe(a.id);
    });
});

describe('clearChats', () => {
    it('removes persisted chat history from localStorage', () => {
        saveChats([{ id: 'x', messages: [] }]);
        expect(loadChats()).toHaveLength(1);
        clearChats();
        expect(loadChats()).toEqual([]);
    });
});
