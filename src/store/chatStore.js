const STORAGE_KEY = 'meno_core_chats';
const DEFAULT_CHAT_TITLE = 'New Conversation';

// Generate a simple unique ID
const generateId = () => Math.random().toString(36).substring(2, 11);

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

export function buildRuntimeConfig({ chatId, modelId = '', knowledgeBaseId = '' } = {}) {
    return {
        modelId,
        knowledgeBaseId,
        sessionId: chatId || '',
    };
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
            title: typeof chat?.title === 'string' && chat.title.trim()
                ? chat.title
                : DEFAULT_CHAT_TITLE,
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

export function generateTitle(messages) {
    if (!messages || messages.length === 0) return DEFAULT_CHAT_TITLE;

    // Find first user message
    const firstUserMsg = messages.find((message) => message.role === 'user');
    if (!firstUserMsg) return DEFAULT_CHAT_TITLE;

    const content = firstUserMsg.content;
    if (content.length <= 30) return content;
    return content.substring(0, 27) + '...';
}
