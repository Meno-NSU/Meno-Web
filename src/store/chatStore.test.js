import { describe, it, expect, beforeEach } from 'vitest';

import {
  chatFromSummary,
  chatsForIdentity,
  clearChats,
  createNewChat,
  loadChats,
  saveChats,
} from './chatStore.js';

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

describe('chatsForIdentity', () => {
    it('gives a signed-in user only the server list, never the local one', () => {
        const local = [{ id: 'local-1', title: 'Гостевой чат', messages: [], updatedAt: 1 }];
        const server = [{ id: 'srv-1', title: 'Вопрос?', messages: [], updatedAt: 2 }];
        expect(chatsForIdentity({ isAuthenticated: true, localChats: local, serverChats: server })).toEqual(server);
    });

    it('gives a guest the local list', () => {
        const local = [{ id: 'local-1', title: 'Гостевой чат', messages: [], updatedAt: 1 }];
        expect(chatsForIdentity({ isAuthenticated: false, localChats: local, serverChats: [] })).toEqual(local);
    });

    it('hides guest chats while signed in without destroying them', () => {
        const local = [{ id: 'local-1', title: 'Гостевой чат', messages: [], updatedAt: 1 }];
        const whileSignedIn = chatsForIdentity({ isAuthenticated: true, localChats: local, serverChats: [] });
        expect(whileSignedIn).toEqual([]);
        // The local list itself is untouched, so signing out brings them back.
        expect(chatsForIdentity({ isAuthenticated: false, localChats: local, serverChats: [] })).toEqual(local);
    });
});

describe('chatFromSummary', () => {
    it('names a chat from its preview and marks it not yet loaded', () => {
        const chat = chatFromSummary({ id: 'c1', updated_at: 'z', preview: 'Вопрос?' });
        expect(chat).toMatchObject({ id: 'c1', title: 'Вопрос?', messages: null, updatedAt: 'z' });
    });
});
