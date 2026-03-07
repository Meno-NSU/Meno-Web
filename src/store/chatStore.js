// Generate a simple unique ID
const generateId = () => Math.random().toString(36).substr(2, 9);

const STORAGE_KEY = 'meno_core_chats';

export function loadChats() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load chats from localStorage', e);
    }
    return [];
}

export function saveChats(chats) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    } catch (e) {
        console.error('Failed to save chats to localStorage', e);
    }
}

export function createNewChat() {
    return {
        id: generateId(),
        title: 'New Conversation',
        messages: [],
        updatedAt: Date.now()
    };
}

export function generateTitle(messages) {
    if (!messages || messages.length === 0) return 'New Conversation';

    // Find first user message
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (!firstUserMsg) return 'New Conversation';

    const content = firstUserMsg.content;
    if (content.length <= 30) return content;
    return content.substring(0, 27) + '...';
}
