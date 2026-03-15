import { useState, useEffect } from 'react';

const translations = {
    ru: {
        newChat: "Новый чат",
        recentChats: "Недавние чаты",
        noRecentChats: "Нет недавних чатов",
        model: "Модель",
        knowledgeBase: "База знаний",
        placeholder: "Написать в Meno-Core...",
        emptyTitle: "Ассистент Meno-Core",
        emptySubtitle: "Задайте вопрос, чтобы выполнить поиск по локальной базе знаний.",
        disclaimer: "Meno-Core может допускать ошибки. Проверяйте важную информацию.",
        error: "Ошибка: не удалось получить ответ",
        noModelsAvailable: "Нет доступных моделей",
        noModelsSendBlocked: "Отправка заблокирована: нет доступных моделей",
        thinking: "Размышляю...",
        thoughtFor: "Думал {time} секунд"
    },
    en: {
        newChat: "New Chat",
        recentChats: "Recent Chats",
        noRecentChats: "No recent chats",
        model: "Model",
        knowledgeBase: "Knowledge Base",
        placeholder: "Message Meno-Core...",
        emptyTitle: "Meno-Core Assistant",
        emptySubtitle: "Ask a question to search your local knowledge base.",
        disclaimer: "Meno-Core can make mistakes. Consider verifying important information.",
        error: "Error: Failed to get response",
        noModelsAvailable: "No models available",
        noModelsSendBlocked: "Sending blocked: no models available",
        thinking: "Thinking...",
        thoughtFor: "Thought for {time} seconds"
    }
};

let currentLang = localStorage.getItem('lang') || 'ru';
const listeners = new Set();

export const setLanguage = (lang) => {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    listeners.forEach(l => l(lang));
};

export const getLanguage = () => currentLang;

export function useTranslation() {
    const [lang, setLang] = useState(currentLang);

    useEffect(() => {
        listeners.add(setLang);
        return () => listeners.delete(setLang);
    }, []);

    const t = (key) => {
        return translations[lang][key] || translations['en'][key] || key;
    };

    return { t, lang, setLanguage };
}
