import { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';

const translations = {
    ru: {
        newChat: "Новый чат",
        recentChats: "Недавние чаты",
        noRecentChats: "Нет недавних чатов",
        model: "Модель",
        knowledgeBase: "База знаний",
        placeholder: "Написать Менону...",
        emptyTitle: "Что хотите узнать об НГУ?",
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
        arenaVoteLeftBetter: "Левый ответ лучше",
        arenaVoteTie: "Оба хорошие",
        arenaVoteBothBad: "Оба плохие",
        arenaVoteRightBetter: "Правый ответ лучше",
        arenaRoundIncomplete: "⚠ Не удалось получить ответы от обеих моделей. Голосование недоступно — попробуйте ещё раз.",
        arenaVotePromptPending: "Сначала проголосуйте за ответ выше, чтобы продолжить.",
        arenaSwipeHint: "← свайп →",
        battleArenaModeOn: "Арена: ВКЛ",
        battleArenaModeOff: "Арена: ВЫКЛ",
        openSidebar: "Открыть боковую панель",
        closeLeaderboard: "Закрыть таблицу",
        signIn: "Войти",
        signOut: "Выйти",
        authRegisterTitle: "Регистрация",
        authWhy: "Вход открывает дополнительные модели (OpenRouter) и засчитывает ваш вклад в рейтинге участников.",
        authEmail: "Email",
        authPassword: "Пароль",
        authPasswordHint: "Не менее 8 символов",
        authNickname: "Никнейм",
        authNicknameHint: "Необязательно — отображается в рейтинге участников",
        authSubmitSignIn: "Войти",
        authSubmitRegister: "Создать аккаунт",
        authSwitchToRegister: "Нет аккаунта? Зарегистрируйтесь",
        authSwitchToSignIn: "Уже есть аккаунт? Войти",
        authSignedInAs: "Вы вошли как",
        authClose: "Закрыть",
        modelRequiresAuth: "Войдите, чтобы открыть эту модель",
        feedbackGoodTitle: "Хороший ответ",
        feedbackBadTitle: "Плохой ответ",
        feedbackCommentPlaceholder: "Расскажите подробнее (необязательно)",
        feedbackCommentSend: "Отправить отзыв",
        surveyQuestion: "Будете ли пользоваться Меноном для похожих вопросов?",
        surveyYes: "Да",
        surveyMaybe: "Возможно",
        surveyNo: "Нет",
        surveySkip: "Пропустить",
        leaderboardTabModels: "Модели",
        leaderboardTabContributors: "Участники",
        contribLeaderboardTitle: "Рейтинг участников",
        contribLeaderboardDesc: "Задавайте вопросы, голосуйте на арене и оценивайте ответы, чтобы подняться в рейтинге.",
        contribNickname: "Участник",
        contribQuestions: "Вопросы",
        contribVotes: "Голоса",
        contribFeedback: "Отзывы",
        contribTotal: "Вклад",
        contribAnonymous: "Аноним",
        contribEmpty: "Участников пока нет. Войдите и станьте первым!",
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
        sources: "Источники",
        kbUnavailable: "недоступно",
        chatTimeoutWarning: "Модель не начала отвечать за 60 секунд. Похоже, провайдер заглох — задайте вопрос ещё раз чуть позже.",
        arenaModelSwitched: "Модель не ответила, пробую другую…",
        loadingPhrases: [
            "Думаю над ответом…",
            "Обращаюсь к мудрецам Академгородка…",
            "Сопоставляю факты из базы знаний…",
            "Ищу релевантные документы…",
            "Роюсь в библиотеке…",
            "Обрабатываю контекст…",
            "Взвешиваю гипотезы…",
            "Прогоняю через нейронные веса…",
            "Консультируюсь с источниками…",
            "Анализирую семантику вопроса…",
            "Разбираю формулировку…",
            "Вспоминаю, что знаю по теме…",
            "Проверяю, правильно ли понял вопрос…",
            "Складываю кусочки воедино…",
            "Подбираю слова поточнее…",
            "Перечитываю найденное…",
            "Уточняю детали…",
            "Прикидываю, что важно сказать…",
            "Тку из контекста ответ…",
            "Прислушиваюсь к чанкам поиска…",
            "Проверяю себя на противоречия…",
            "Подбираю аналогии…",
            "Раскладываю мысли по полочкам…",
            "Не торопимся, проверяю аккуратно…",
            "Собираю каркас ответа…"
        ]
    },
    en: {
        newChat: "New Chat",
        recentChats: "Recent Chats",
        noRecentChats: "No recent chats",
        model: "Model",
        knowledgeBase: "Knowledge Base",
        placeholder: "Message Meno...",
        emptyTitle: "What would you like to know about NSU?",
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
        arenaVoteLeftBetter: "Left is better",
        arenaVoteTie: "Both are good",
        arenaVoteBothBad: "Both bad",
        arenaVoteRightBetter: "Right is better",
        arenaRoundIncomplete: "⚠ Could not get responses from both models. Voting is disabled — please try again.",
        arenaVotePromptPending: "Vote on the answers above to continue.",
        arenaSwipeHint: "← swipe →",
        battleArenaModeOn: "Arena: ON",
        battleArenaModeOff: "Arena: OFF",
        openSidebar: "Open sidebar",
        closeLeaderboard: "Close leaderboard",
        signIn: "Sign in",
        signOut: "Sign out",
        authRegisterTitle: "Create account",
        authWhy: "Signing in unlocks extra models (OpenRouter) and counts your contributions on the leaderboard.",
        authEmail: "Email",
        authPassword: "Password",
        authPasswordHint: "At least 8 characters",
        authNickname: "Nickname",
        authNicknameHint: "Optional — shown on the contributors leaderboard",
        authSubmitSignIn: "Sign in",
        authSubmitRegister: "Create account",
        authSwitchToRegister: "No account? Create one",
        authSwitchToSignIn: "Already have an account? Sign in",
        authSignedInAs: "Signed in as",
        authClose: "Close",
        modelRequiresAuth: "Sign in to unlock this model",
        feedbackGoodTitle: "Good response",
        feedbackBadTitle: "Bad response",
        feedbackCommentPlaceholder: "Tell us more (optional)",
        feedbackCommentSend: "Send feedback",
        surveyQuestion: "Would you use Meno again for similar questions?",
        surveyYes: "Yes",
        surveyMaybe: "Maybe",
        surveyNo: "No",
        surveySkip: "Skip",
        leaderboardTabModels: "Models",
        leaderboardTabContributors: "Contributors",
        contribLeaderboardTitle: "Contributors",
        contribLeaderboardDesc: "Ask questions, vote in the arena and rate answers to climb the board.",
        contribNickname: "Contributor",
        contribQuestions: "Questions",
        contribVotes: "Votes",
        contribFeedback: "Feedback",
        contribTotal: "Total",
        contribAnonymous: "Anonymous",
        contribEmpty: "No contributors yet. Sign in and be the first!",
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
        sources: "Sources",
        kbUnavailable: "unavailable",
        chatTimeoutWarning: "The model didn't start responding within 60 seconds. Looks like the provider is stuck — try again in a moment.",
        arenaModelSwitched: "That model didn't answer, trying another…",
        loadingPhrases: [
            "Thinking it through…",
            "Consulting the local archive…",
            "Cross-checking facts in the knowledge base…",
            "Pulling up relevant documents…",
            "Digging through the library…",
            "Processing the context…",
            "Weighing the hypotheses…",
            "Running this through the network…",
            "Talking to the sources…",
            "Parsing the question…",
            "Rereading what I just found…",
            "Lining the pieces up…",
            "Checking my understanding…",
            "Picking the right words…",
            "Looking for the best framing…",
            "Sanity-checking myself for contradictions…",
            "Making sure I got the question right…",
            "Pulling together a draft…",
            "Considering the angles…",
            "Listening to the retrieved chunks…",
            "Trying out an analogy…",
            "Organising the thoughts…",
            "Not rushing — verifying carefully…",
            "Sketching the structure…",
            "Putting it into one coherent answer…"
        ]
    }
};

let currentLang = localStorage.getItem('lang') || 'ru';
const listeners = new Set();

export const setLanguage = (lang) => {
    const apply = () => {
        currentLang = lang;
        localStorage.setItem('lang', lang);
        listeners.forEach(l => l(lang));
    };
    // Soft full-page crossfade on language switch (default view-transition
    // animation — the theme toggle's circular reveal is scoped behind the
    // .theme-switching class and doesn't apply here).
    const reduceMotion = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (typeof document === 'undefined'
        || typeof document.startViewTransition !== 'function'
        || reduceMotion) {
        apply();
        return;
    }
    document.startViewTransition(() => {
        flushSync(apply);
    });
};

export const getLanguage = () => currentLang;

// Non-reactive lookup helper for plain functions (error builders, services)
// that need a localized string but don't sit inside a React component.
// Returns the string in the active language at the moment of call; further
// language switches do not retroactively update strings written via this.
export function translateOnce(key) {
    return translations[currentLang]?.[key] || translations['en']?.[key] || key;
}

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
