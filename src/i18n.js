import { useState, useEffect } from 'react';

const translations = {
    ru: {
        newChat: "Новый чат",
        recentChats: "Недавние чаты",
        noRecentChats: "Нет недавних чатов",
        model: "Модель",
        knowledgeBase: "База знаний",
        placeholder: "Написать Менону...",
        emptyTitle: "Ассистент Менон",
        emptySubtitle: "Задайте вопрос, чтобы выполнить поиск по локальной базе знаний.",
        disclaimer: "Менон может допускать ошибки. Проверяйте важную информацию.",
        error: "Ошибка: не удалось получить ответ",
        noModelsAvailable: "Нет доступных моделей",
        noModelsSendBlocked: "Отправка заблокирована: нет доступных моделей",
        thinking: "Размышляю...",
        thoughtFor: "Думал {time} секунд",
        arenaLeaderboardTitle: "Турнирная таблица",
        arenaLeaderboardDesc: "Голосуйте за лучшие ответы, чтобы узнать, какая комбинация Модели и Базы Знаний работает лучше всего.",
        arenaRank: "Ранг",
        arenaSetup: "Связка",
        arenaEloRating: "Рейтинг Эло",
        arenaWinRate: "Победы",
        arenaMatches: "Матчи",
        arenaNoBattles: "Битв пока не было.",
        arenaLoading: "Загрузка турнирной таблицы...",
        arenaVoteLeftBetter: "👈 Левый ответ лучше",
        arenaVoteTie: "🤝 Оба хорошие",
        arenaVoteBothBad: "👎 Оба плохие",
        arenaVoteRightBetter: "👉 Правый ответ лучше",
        battleArenaModeOn: "Арена: ВКЛ",
        battleArenaModeOff: "Арена: ВЫКЛ",
        agentProcessing: "Обрабатываю запрос...",
        agentThoughtFor: "Обработка заняла {time} сек",
        stage_abbreviation_expansion: "Раскрытие сокращений",
        stage_anaphora_resolution: "Разрешение ссылок",
        stage_query_rewrite: "Переформулировка запроса",
        stage_retrieval: "Поиск по базе знаний",
        stage_fusion: "Объединение результатов",
        stage_rerank: "Ранжирование",
        stage_context_assembly: "Сборка контекста",
        stage_generation: "Генерация ответа",
        stage_retrieval_and_generation: "Поиск и генерация",
        sources: "Источники"
    },
    en: {
        newChat: "New Chat",
        recentChats: "Recent Chats",
        noRecentChats: "No recent chats",
        model: "Model",
        knowledgeBase: "Knowledge Base",
        placeholder: "Message Meno...",
        emptyTitle: "Meno Assistant",
        emptySubtitle: "Ask a question to search your local knowledge base.",
        disclaimer: "Meno can make mistakes. Consider verifying important information.",
        error: "Error: Failed to get response",
        noModelsAvailable: "No models available",
        noModelsSendBlocked: "Sending blocked: no models available",
        thinking: "Thinking...",
        thoughtFor: "Thought for {time} seconds",
        arenaLeaderboardTitle: "Arena Leaderboard",
        arenaLeaderboardDesc: "Vote for the best outputs to see which Model & Knowledge Base combination performs best.",
        arenaRank: "Rank",
        arenaSetup: "Setup (Model + KB)",
        arenaEloRating: "Elo Rating",
        arenaWinRate: "Win Rate",
        arenaMatches: "Matches",
        arenaNoBattles: "No battles fought yet.",
        arenaLoading: "Loading Arena Leaderboard...",
        arenaVoteLeftBetter: "👈 Left is better",
        arenaVoteTie: "🤝 Both are good",
        arenaVoteBothBad: "👎 Both bad",
        arenaVoteRightBetter: "👉 Right is better",
        battleArenaModeOn: "Arena: ON",
        battleArenaModeOff: "Arena: OFF",
        agentProcessing: "Processing query...",
        agentThoughtFor: "Processed in {time}s",
        stage_abbreviation_expansion: "Expanding abbreviations",
        stage_anaphora_resolution: "Resolving references",
        stage_query_rewrite: "Rewriting query",
        stage_retrieval: "Searching knowledge base",
        stage_fusion: "Merging results",
        stage_rerank: "Reranking",
        stage_context_assembly: "Assembling context",
        stage_generation: "Generating response",
        stage_retrieval_and_generation: "Search & generation",
        sources: "Sources"
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
