const STORAGE_KEY = 'meno_core_chats';
// A chat with no title of its own. Kept empty on purpose: the UI localizes it at
// render time via `chat.title || t('newChat')`, so we never store a hardcoded
// (English) default that would then show through in the Russian interface.
const DEFAULT_CHAT_TITLE = '';
// The English default older builds stored into localStorage. Normalized back to
// "untitled" on load so a returning guest's old drafts also localize.
const LEGACY_DEFAULT_TITLE = 'New Conversation';

// A never-sent draft — the "Новый чат" the composer targets before the first send.
// Its message array exists but is empty, which distinguishes it from an unloaded
// server chat (`messages === null`) and a real chat (`messages.length > 0`). Such a
// draft is a valid send target but must not appear in the sidebar list: until the
// first message there is no conversation to show yet.
export function isEmptyDraft(chat) {
    return Array.isArray(chat?.messages) && chat.messages.length === 0;
}

// Generate a unique id (crypto UUID; also reused as the backend session id).
const generateId = () => crypto.randomUUID();

function normalizeConfiguredId(value, validIds, fallbackId = '') {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        return fallbackId;
    }
    if (validIds.size === 0 || validIds.has(normalized)) {
        return normalized;
    }
    return fallbackId;
}

export function loadChats() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.error('Failed to load chats from localStorage', error);
    }
    return [];
}

export function saveChats(chats) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    } catch (error) {
        console.error('Failed to save chats to localStorage', error);
    }
}

export function clearChats() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.error('Failed to clear chats from localStorage', error);
    }
}

export function buildRuntimeConfig({ chatId, modelId = '', knowledgeBaseId = '' } = {}) {
    return {
        modelId,
        knowledgeBaseId,
        sessionId: chatId || '',
    };
}

// A stored title, cleaned to our "untitled = empty" convention: trims whitespace,
// and treats the old English default as untitled so it localizes at render.
function normalizeStoredTitle(value) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed && trimmed !== LEGACY_DEFAULT_TITLE ? trimmed : DEFAULT_CHAT_TITLE;
}

export function migrateChats(
    chats,
    {
        validModelIds = new Set(),
        validKnowledgeBaseIds = new Set(),
        defaultModelId = '',
        defaultKnowledgeBaseId = '',
    } = {},
) {
    if (!Array.isArray(chats)) {
        return [];
    }

    return chats.map((chat) => {
        const chatId = typeof chat?.id === 'string' && chat.id.trim() ? chat.id : generateId();
        const runtimeConfig = chat?.runtimeConfig && typeof chat.runtimeConfig === 'object'
            ? chat.runtimeConfig
            : {};

        return {
            ...chat,
            id: chatId,
            title: normalizeStoredTitle(chat?.title),
            messages: Array.isArray(chat?.messages) ? chat.messages : [],
            updatedAt: typeof chat?.updatedAt === 'number' ? chat.updatedAt : Date.now(),
            runtimeConfig: buildRuntimeConfig({
                chatId,
                modelId: normalizeConfiguredId(
                    runtimeConfig.modelId,
                    validModelIds,
                    defaultModelId,
                ),
                knowledgeBaseId: normalizeConfiguredId(
                    runtimeConfig.knowledgeBaseId,
                    validKnowledgeBaseIds,
                    defaultKnowledgeBaseId,
                ),
            }),
        };
    });
}

export function createNewChat({ modelId = '', knowledgeBaseId = '' } = {}) {
    const chatId = generateId();
    return {
        id: chatId,
        title: DEFAULT_CHAT_TITLE,
        messages: [],
        updatedAt: Date.now(),
        runtimeConfig: buildRuntimeConfig({
            chatId,
            modelId,
            knowledgeBaseId,
        }),
    };
}

export function chatsForIdentity({ isAuthenticated, localChats = [], serverChats = [] }) {
    // A signed-in user sees only what the server has: the account is the source of truth, and
    // a shared computer must never show the previous person's conversations. A guest's chats
    // are hidden while signed in, not deleted — signing out brings them back.
    return isAuthenticated ? serverChats : localChats;
}

export function chatFromSummary(summary, { defaultModelId = '', defaultKnowledgeBaseId = '' } = {}) {
    // The server has no title, only a preview of the first question, and no per-chat model
    // selection — so a restored chat opens on the defaults. `messages: null` marks it as
    // not-yet-loaded; the conversation is fetched when it is opened.
    return {
        id: summary.id,
        title: summary.preview || DEFAULT_CHAT_TITLE,
        messages: null,
        updatedAt: summary.updated_at || null,
        runtimeConfig: buildRuntimeConfig({
            chatId: summary.id,
            modelId: defaultModelId,
            knowledgeBaseId: defaultKnowledgeBaseId,
        }),
    };
}

export function generateTitle(messages) {
    if (!messages || messages.length === 0) return DEFAULT_CHAT_TITLE;

    // Find first user message
    const firstUserMsg = messages.find((message) => message.role === 'user');
    if (!firstUserMsg) return DEFAULT_CHAT_TITLE;

    const content = firstUserMsg.content;
    if (content.length <= 30) return content;
    return content.substring(0, 27) + '...';
}
