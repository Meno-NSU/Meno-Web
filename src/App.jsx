import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Sidebar from './components/Sidebar.jsx';
import ChatArea from './components/ChatArea.jsx';
import SettingsBar from './components/SettingsBar.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import AuthModal from './components/AuthModal.jsx';
import {
  clearChatHistory,
  ensureGuestSession,
  fetchKnowledgeBases,
  fetchModels,
  refreshModels,
  sendChatMessage,
  recordArenaTurn,
  fetchServiceStatus,
  getPrivacySettings,
  patchPrivacySettings,
  getLegalDocuments,
  deleteMyData,
  deleteServerHistory,
  setGuestToken,
} from './services/api.js';
import { resolveOverload } from './services/chatWaitState.js';
import {
  buildArenaPool,
  pickArenaPair,
  runArenaSideWithSubstitution,
  ArenaPoolExhaustedError,
} from './services/arenaMatching.js';
import { buildArenaHistories, arenaTurnIndex } from './services/arenaHistory.js';
import {
  clearChats,
  createNewChat,
  generateTitle,
  loadChats,
  migrateChats,
  saveChats,
} from './store/chatStore.js';
import { useAuth } from './store/authStore.js';
import SurveyModal from './components/SurveyModal.jsx';
import ConsentModal from './components/ConsentModal.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { submitSurvey } from './services/api.js';
import { shouldShowConsentModal, hasDecidedConsent, setConsentDecided, getConsentDeferredUntil, deferConsent, CONSENT_DECISION_FLAG, CONSENT_DEFER_UNTIL_KEY, CONSENT_KIND } from './services/consentGate.js';
import { shouldShowSurvey } from './services/surveyGate.js';
import { translateOnce as i18nLookup } from './i18n.js';
import { buildErrorNotice, buildStopNotice } from './services/chatNotice.js';
import { dropTrailingNotice } from './services/chatTurns.js';
import './index.css';

const LAST_USED_MODEL_KEY = 'lastUsedModelId';
const LAST_USED_KB_KEY = 'lastUsedKnowledgeBaseId';
const SERVER_ERROR_TEXT = 'Извините, произошла ошибка на сервере. Пожалуйста, попробуйте задать свой вопрос позже.';
const EMPTY_CHAT = {
  messages: [],
  runtimeConfig: {
    modelId: '',
    knowledgeBaseId: '',
    sessionId: '',
  },
};

function resolveValidId(items, candidateId, fallbackId = '') {
  const normalized = typeof candidateId === 'string' ? candidateId.trim() : '';
  if (!normalized) {
    return fallbackId;
  }
  if (items.length === 0 || items.some((item) => item.id === normalized)) {
    return normalized;
  }
  return fallbackId;
}

function getLatestChatId(chats) {
  if (!Array.isArray(chats) || chats.length === 0) {
    return null;
  }
  return [...chats].sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
}

function updateChatById(chats, chatId, updater) {
  return chats.map((chat) => (chat.id === chatId ? updater(chat) : chat));
}

function replaceLastMessage(messages, updater) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  const lastIndex = messages.length - 1;
  const currentMessage = messages[lastIndex];
  const updatedMessage = updater(currentMessage);

  if (updatedMessage === currentMessage) {
    return messages;
  }

  return [
    ...messages.slice(0, lastIndex),
    updatedMessage,
  ];
}

function updateLastMessageInChat(chats, chatId, updater) {
  return updateChatById(chats, chatId, (chat) => ({
    ...chat,
    messages: replaceLastMessage(chat.messages, updater),
  }));
}

function applyStreamingThinkTime(message, fullContent) {
  const nextMessage = {
    ...message,
    content: fullContent,
  };

  if (fullContent.includes('</think>') && !message.thinkTime && message.thinkStartTime) {
    nextMessage.thinkTime = Math.floor((Date.now() - message.thinkStartTime) / 1000);
  }

  return nextMessage;
}

function finalizeThinkTime(message) {
  if (!message.thinkStartTime || message.thinkTime || !message.content?.includes('<think>')) {
    return message;
  }

  return {
    ...message,
    thinkTime: Math.floor((Date.now() - message.thinkStartTime) / 1000),
  };
}

function applyArenaSideContent(sideState, fullContent) {
  const nextSideState = {
    ...sideState,
    content: fullContent,
  };

  if (fullContent.includes('</think>') && !sideState.thinkTime && sideState.thinkStartTime) {
    nextSideState.thinkTime = Math.floor((Date.now() - sideState.thinkStartTime) / 1000);
  }

  return nextSideState;
}

function finalizeArenaSideThink(sideState) {
  const next = { ...sideState, isStreaming: false };

  if (!sideState.thinkStartTime || sideState.thinkTime || !sideState.content?.includes('<think>')) {
    return next;
  }

  return {
    ...next,
    thinkTime: Math.floor((Date.now() - sideState.thinkStartTime) / 1000),
  };
}

function updateLastArenaMessageSide(chats, chatId, sideKey, updater) {
  return updateLastMessageInChat(chats, chatId, (message) => {
    if (!message?.isArena) {
      return message;
    }

    return {
      ...message,
      arenaData: {
        ...message.arenaData,
        [sideKey]: updater(message.arenaData[sideKey]),
      },
    };
  });
}

function finalizeLastArenaMessage(chats, chatId) {
  return updateLastMessageInChat(chats, chatId, (message) => {
    if (!message?.isArena) {
      return message;
    }

    return {
      ...message,
      arenaData: {
        ...message.arenaData,
        a: finalizeArenaSideThink(message.arenaData.a),
        b: finalizeArenaSideThink(message.arenaData.b),
      },
    };
  });
}

function applyLastMessageNotice(chats, chatId, notice, opts = {}) {
  return updateLastMessageInChat(chats, chatId, (message) => {
    if (!message) {
      return message;
    }

    // Arena: attach the notice to any side that produced no content; never
    // overwrite a side that did stream an answer.
    if (message.isArena) {
      const withNotice = (side) => (side.content ? side : { ...side, isStreaming: false, notice });
      return {
        ...message,
        arenaData: {
          ...message.arenaData,
          a: withNotice(message.arenaData.a),
          b: withNotice(message.arenaData.b),
        },
      };
    }

    if (message.role !== 'assistant') {
      return message;
    }

    // content is preserved verbatim — we never wipe what the user already saw.
    return {
      ...message,
      responseModelId: message.responseModelId || message.requestModelId || null,
      isStreaming: false,
      slowWarning: false,
      interrupted: true,
      notice,
      retry: { userText: opts.userText || '' },
    };
  });
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth > 768;
  });

  // Data state
  const [models, setModels] = useState([]);
  const [kbs, setKbs] = useState([]);

  // Chat state
  const [chats, setChats] = useState(() => loadChats());
  const [activeChatId, setActiveChatId] = useState(null);
  const [generatingChats, setGeneratingChats] = useState(new Set());

  // App routing state
  const [currentView, setCurrentView] = useState('chat');

  // Arena Mode
  const [isArenaMode, setIsArenaMode] = useState(false);

  // Core model annotation from /v1/models response
  const [coreModelId, setCoreModelId] = useState(null);

  // Auth (S3): optional sign-in — anonymous users keep full chat access.
  const auth = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // End-of-session survey (S2): chat id awaiting the one-question survey.
  const [surveySessionId, setSurveySessionId] = useState(null);

  // Consent (defer model): a gate modal asks the improvement opt-in. «Продолжить»
  // grants it; «Не сейчас» defers and the gate re-asks later (gently — re-prompts are
  // dismissible). The chat is always stored (SERVICE_AND_HISTORY, guests included), so
  // storage never hinges on the choice. See spec 2026-07-22-consent-defer-model.
  const consentVersionRef = useRef(null);
  const [isConsentModalVisible, setIsConsentModalVisible] = useState(false);
  // A re-prompt (the user deferred before) is dismissible; the first prompt is not.
  const [consentDismissible, setConsentDismissible] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [improvementEnabled, setImprovementEnabled] = useState(null);

  // Initialize data and migrate stored chats to the chat-scoped config shape.
  useEffect(() => {
    // Mint a guest session on first load so anonymous requests carry X-Guest-Token,
    // then decide whether to show the (non-blocking) improvement banner and read
    // the current consent-document version.
    ensureGuestSession().then(async () => {
      let serverState = null;
      try {
        serverState = await getPrivacySettings();
      } catch { /* unknown — the modal may still show */ }
      const deferredUntil = getConsentDeferredUntil();
      const show = shouldShowConsentModal({
        decided: hasDecidedConsent(),
        deferredUntil,
        improvementGranted: !!serverState?.menoImprovement,
        now: Date.now(),
      });
      if (show) {
        setConsentDismissible(deferredUntil != null); // deferred before → gentle re-prompt
        setIsConsentModalVisible(true);
      }
      getLegalDocuments()
        .then((docs) => {
          const consentDoc = docs.find((doc) => doc.kind === CONSENT_KIND);
          if (consentDoc) consentVersionRef.current = consentDoc.version;
        })
        .catch(() => { /* version fetched on demand when a choice is made */ });
    });
    const initData = async () => {
      const [{ models: fetchedModels, coreModelId: fetchedCoreModelId }, fetchedKbs] = await Promise.all([
        fetchModels(),
        fetchKnowledgeBases(),
      ]);

      setModels(fetchedModels);
      setCoreModelId(fetchedCoreModelId);
      setKbs(fetchedKbs);

      const defaultModelId = resolveValidId(
        fetchedModels,
        localStorage.getItem(LAST_USED_MODEL_KEY),
        fetchedModels[0]?.id || '',
      );
      const defaultKnowledgeBaseId = resolveValidId(
        fetchedKbs,
        localStorage.getItem(LAST_USED_KB_KEY),
        fetchedKbs[0]?.id || '',
      );

      if (defaultModelId) {
        localStorage.setItem(LAST_USED_MODEL_KEY, defaultModelId);
      }
      if (defaultKnowledgeBaseId) {
        localStorage.setItem(LAST_USED_KB_KEY, defaultKnowledgeBaseId);
      }

      const storedChats = loadChats();
      const nextChats = migrateChats(storedChats, {
        validModelIds: new Set(fetchedModels.map((model) => model.id)),
        validKnowledgeBaseIds: new Set(fetchedKbs.map((kb) => kb.id)),
        defaultModelId,
        defaultKnowledgeBaseId,
      });
      const hydratedChats = nextChats.length > 0
        ? nextChats
        : [createNewChat({ modelId: defaultModelId, knowledgeBaseId: defaultKnowledgeBaseId })];

      setChats(hydratedChats);
      setActiveChatId((currentChatId) => (
        currentChatId && hydratedChats.some((chat) => chat.id === currentChatId)
          ? currentChatId
          : getLatestChatId(hydratedChats)
      ));
    };

    initData();
  }, []);

  // Periodically poll models and knowledge bases to keep lists fresh.
  useEffect(() => {
    const POLL_INTERVAL_MS = 30_000;
    let intervalId = null;

    const poll = async () => {
      if (document.hidden) return;
      const [{ models: freshModels, coreModelId: freshCoreModelId }, freshKbs] = await Promise.all([
        fetchModels(),
        fetchKnowledgeBases(),
      ]);
      setCoreModelId(freshCoreModelId);
      setModels((prev) => {
        const prevIds = prev.map((m) => m.id).sort().join(',');
        const nextIds = freshModels.map((m) => m.id).sort().join(',');
        return prevIds === nextIds ? prev : freshModels;
      });
      setKbs((prev) => {
        const prevKey = JSON.stringify(prev.map((kb) => ({ id: kb.id, available: kb.available })));
        const nextKey = JSON.stringify(freshKbs.map((kb) => ({ id: kb.id, available: kb.available })));
        return prevKey === nextKey ? prev : freshKbs;
      });
    };

    intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    saveChats(chats);
  }, [chats]);

  useEffect(() => {
    if (chats.length === 0) {
      setActiveChatId(null);
      return;
    }

    if (!activeChatId || !chats.some((chat) => chat.id === activeChatId)) {
      setActiveChatId(getLatestChatId(chats));
    }
  }, [chats, activeChatId]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const activeChat = chats.find((chat) => chat.id === activeChatId) || EMPTY_CHAT;
  const selectedModel = activeChat.runtimeConfig?.modelId || '';
  const selectedKb = activeChat.runtimeConfig?.knowledgeBaseId || '';

  // Auto-fallback when the selected model disappears from the available list
  // or becomes locked behind login (e.g. the user signed out while an
  // OpenRouter model was selected — the server would reject chat against it).
  useEffect(() => {
    if (models.length === 0 || !activeChatId) return;
    const usable = (m) => !m.requires_auth;
    if (selectedModel && models.some((m) => m.id === selectedModel && usable(m))) return;
    const fallback = models.find(usable)?.id || '';
    if (fallback) {
      updateActiveChatRuntimeConfig({ modelId: fallback });
    }
  }, [models, selectedModel, activeChatId]);

  // Auto-fallback when the selected KB becomes unavailable.
  useEffect(() => {
    if (kbs.length === 0 || !activeChatId) return;
    const availableKbs = kbs.filter((kb) => kb.available !== false);
    if (availableKbs.length === 0) return;
    if (selectedKb && availableKbs.some((kb) => kb.id === selectedKb)) return;
    const fallback = availableKbs[0]?.id || '';
    if (fallback) {
      updateActiveChatRuntimeConfig({ knowledgeBaseId: fallback });
    }
  }, [kbs, selectedKb, activeChatId]);

  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem(LAST_USED_MODEL_KEY, selectedModel);
    }
    if (selectedKb) {
      localStorage.setItem(LAST_USED_KB_KEY, selectedKb);
    }
  }, [selectedModel, selectedKb]);

  // Theme switch "flows" across the screen: a circular reveal growing from
  // the clicked control, via the View Transitions API. Browsers without it
  // (and reduced-motion users) just get the instant switch.
  const toggleTheme = (event) => {
    const next = theme === 'light' ? 'dark' : 'light';
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (typeof document.startViewTransition !== 'function' || reduceMotion) {
      setTheme(next);
      return;
    }

    // Fallback origin ≈ where the topbar toggle lives.
    const x = event?.clientX ?? window.innerWidth - 48;
    const y = event?.clientY ?? 48;
    const maxRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    document.documentElement.classList.add('theme-switching');
    const transition = document.startViewTransition(() => {
      flushSync(() => setTheme(next));
      // The persisting useEffect is async — snapshot needs the final DOM now.
      document.documentElement.setAttribute('data-theme', next);
    });
    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${maxRadius}px at ${x}px ${y}px)`,
            ],
          },
          { duration: 550, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => { /* transition skipped (rapid toggles) — theme already applied */ });
    transition.finished.finally(() => {
      document.documentElement.classList.remove('theme-switching');
    });
  };

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const updateActiveChatRuntimeConfig = (updates) => {
    if (!activeChatId) {
      return;
    }

    setChats((prev) => updateChatById(prev, activeChatId, (chat) => ({
      ...chat,
      runtimeConfig: {
        ...chat.runtimeConfig,
        ...updates,
        sessionId: chat.id,
      },
    })));
  };

  const handleModelChange = (modelId) => {
    updateActiveChatRuntimeConfig({ modelId });
  };

  const handleModelsDropdownOpen = async () => {
    const { models: freshModels, coreModelId: freshCoreModelId } = await refreshModels();
    setCoreModelId(freshCoreModelId);
    setModels((prev) => {
      const prevIds = prev.map((m) => m.id).sort().join(',');
      const nextIds = freshModels.map((m) => m.id).sort().join(',');
      return prevIds === nextIds ? prev : freshModels;
    });
  };

  const refreshModelsAndApplyState = useCallback(async () => {
    try {
      const { models: freshModels, coreModelId: freshCoreModelId } = await refreshModels();
      setModels(freshModels);
      setCoreModelId(freshCoreModelId);
    } catch { /* ignore */ }
  }, []);

  // Survey trigger: leaving a chat that actually got answers and hasn't been
  // surveyed yet. "Leaving" = activeChatId moved to a different chat (chat
  // switch, new chat). Generation in flight defers the prompt — switching
  // away mid-answer shouldn't interrupt with a modal.
  const prevActiveChatRef = useRef(null);
  // Per-chat AbortController so a "Stop waiting" click can cancel the in-flight
  // request; an abort surfaces as ChatTimeoutError -> the overload/retry state.
  const abortControllersRef = useRef(new Map());
  useEffect(() => {
    const prevId = prevActiveChatRef.current;
    prevActiveChatRef.current = activeChatId;
    if (!prevId || prevId === activeChatId) return;
    const prevChat = chats.find((chat) => chat.id === prevId);
    if (!prevChat || prevChat.surveyed) return;
    if (generatingChats.has(prevId)) return;
    const hadAnswer = (prevChat.messages || []).some(
      (m) => m.role === 'assistant' && (m.completionId || m.isArena),
    );
    if (!hadAnswer) return;
    // Each answered dialogue is one survey opportunity: mark it surveyed so
    // revisiting the chat can't re-roll, then give it an independent
    // SURVEY_PROBABILITY chance of opening the modal. See services/surveyGate.js.
    // The prevActiveChatRef guard above makes the setChats re-render a no-op
    // (prevId === activeChatId on the re-run), so this cannot loop.
    setChats((prev) => prev.map((chat) => (
      chat.id === prevId ? { ...chat, surveyed: true } : chat
    )));
    if (shouldShowSurvey()) setSurveySessionId(prevId);
  }, [activeChatId, chats, generatingChats]);

  // Both outcomes mark the chat surveyed locally first (never nag twice, even
  // if the POST fails) and report best-effort: answers as themselves, every
  // dismissal path as the explicit 'skipped'.
  const handleSurveyDone = (answer) => {
    const sessionId = surveySessionId;
    setSurveySessionId(null);
    if (!sessionId) return;
    setChats((prev) => prev.map((chat) => (
      chat.id === sessionId ? { ...chat, surveyed: true } : chat
    )));
    submitSurvey({ sessionId, answer }).catch((error) => {
      console.warn('Survey answer not recorded', error);
    });
  };

  // Signing in/out changes what /v1/models returns (OpenRouter is gated behind
  // login), so refresh the list whenever the auth state actually flips. The
  // ref skips the initial render — initData already fetched the list.
  const prevAuthedRef = useRef(null);
  useEffect(() => {
    if (!auth.ready) return;
    if (prevAuthedRef.current === null) {
      prevAuthedRef.current = auth.isAuthenticated;
      return;
    }
    if (prevAuthedRef.current !== auth.isAuthenticated) {
      prevAuthedRef.current = auth.isAuthenticated;
      refreshModelsAndApplyState();
    }
  }, [auth.ready, auth.isAuthenticated, refreshModelsAndApplyState]);

  const handleKbChange = (knowledgeBaseId) => {
    updateActiveChatRuntimeConfig({ knowledgeBaseId });
  };

  const handleNewChat = () => {
    // Always land in the chat view (the user might be on the leaderboard
    // when they press "new chat"). Pressing the affordance from anywhere
    // should take them to the chat surface.
    setCurrentView('chat');

    // At most one empty chat exists at any time — pressing "new chat" while
    // an empty chat already lives in the sidebar just re-selects it instead
    // of stacking another empty placeholder. Without this, switching to an
    // existing-with-messages chat and pressing "new chat" was creating a
    // fresh empty every time (the old guard only checked the *current*
    // chat).
    const existingEmpty = chats.find((c) => !c.messages || c.messages.length === 0);
    if (existingEmpty) {
      setActiveChatId(existingEmpty.id);
      return;
    }

    const nextChat = createNewChat({
      modelId: resolveValidId(
        models,
        selectedModel || localStorage.getItem(LAST_USED_MODEL_KEY),
        models[0]?.id || '',
      ),
      knowledgeBaseId: resolveValidId(
        kbs,
        selectedKb || localStorage.getItem(LAST_USED_KB_KEY),
        kbs[0]?.id || '',
      ),
    });

    setChats((prev) => [nextChat, ...prev]);
    setActiveChatId(nextChat.id);
  };

  // Logout wipes account-specific local state so the next person on this browser
  // cannot see the previous session's history (privacy: shared-device leak).
  const handleLogout = () => {
    auth.logout();
    clearChats();
    const fresh = createNewChat({
      modelId: resolveValidId(models, localStorage.getItem(LAST_USED_MODEL_KEY), models[0]?.id || ''),
      knowledgeBaseId: resolveValidId(kbs, localStorage.getItem(LAST_USED_KB_KEY), kbs[0]?.id || ''),
    });
    setChats([fresh]);
    setActiveChatId(fresh.id);
  };

  const handleDeleteChat = (id) => {
    setChats((prev) => prev.filter((chat) => chat.id !== id));
    if (activeChatId === id) {
      setActiveChatId(null);
    }

    void clearChatHistory(id).catch((error) => {
      console.warn('Failed to clear server-side chat history', error);
    });
  };

  const handleSendMessage = async (text, { retryOf = null } = {}) => {
    const trimmedText = text.trim();
    const targetChatId = activeChatId;

    if (!trimmedText || !targetChatId || generatingChats.has(targetChatId)) {
      return;
    }

    const targetChat = chats.find((chat) => chat.id === targetChatId);
    if (!targetChat) {
      return;
    }

    const requestConfig = {
      modelId: resolveValidId(models, targetChat.runtimeConfig?.modelId, models[0]?.id || ''),
      knowledgeBaseId: resolveValidId(
        kbs,
        targetChat.runtimeConfig?.knowledgeBaseId,
        kbs[0]?.id || '',
      ),
      sessionId: targetChat.id,
    };

    if (!requestConfig.modelId) {
      return;
    }

    // Retry re-runs the same user turn: drop the errored assistant message and
    // reuse the existing user message instead of appending a duplicate.
    const isRetry = !!retryOf;
    const userMessage = { role: 'user', content: trimmedText };
    // Retry re-runs the last turn: drop the trailing interrupted assistant so the
    // list ends on its user question; a normal send appends the new question.
    // Interrupted turns are otherwise KEPT: their error text lives in `notice`,
    // not `content`, so nothing stale leaks, and keeping the assistant slot
    // preserves the strict user/assistant alternation the backend requires —
    // stripping them would create consecutive user turns and 500 there.
    const messageHistory = isRetry ? dropTrailingNotice(targetChat.messages) : [...targetChat.messages, userMessage];

    setChats((prev) => updateChatById(prev, targetChatId, (chat) => {
      const nextMessages = isRetry ? dropTrailingNotice(chat.messages) : [...chat.messages, userMessage];
      return {
        ...chat,
        messages: nextMessages,
        title: generateTitle(nextMessages),
        updatedAt: Date.now(),
        runtimeConfig: {
          ...chat.runtimeConfig,
          ...requestConfig,
        },
      };
    }));

    setGeneratingChats((prev) => {
      const next = new Set(prev);
      next.add(targetChatId);
      return next;
    });

    try {
      if (isArenaMode) {
        const pool = buildArenaPool(models);
        if (pool.length < 2) {
          setChats((prev) => updateChatById(prev, targetChatId, (chat) => ({
            ...chat,
            messages: [
              ...chat.messages,
              {
                role: 'assistant',
                isArena: false,
                content: '',
                notice: { kind: 'error', key: 'arenaNoModels' },
              },
            ],
          })));
          return;
        }
        const kbId = requestConfig.knowledgeBaseId;

        // messageHistory currently ends with the new user message; histories must
        // be derived from everything BEFORE that tail.
        const userMessage = messageHistory[messageHistory.length - 1];
        const historyBefore = messageHistory.slice(0, -1);
        const { historyA, historyB } = buildArenaHistories(historyBefore);
        const messagesA = [...historyA, userMessage];
        const messagesB = [...historyB, userMessage];

        // Stable id for the bubble. ArenaMessageBubble.handleVote uses this to
        // re-locate the bubble after the optimistic setChats has replaced the
        // message object reference — without it, the success-path setChats
        // matches nothing (m === message is stale), `voted` is never set to
        // true, and the user can spam-click the vote buttons.
        const bubbleId = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `bubble-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const arenaMessage = {
          role: 'assistant', isArena: true,
          arenaData: {
            bubbleId,
            a: { model: null, kb: kbId, content: '', thinkStartTime: Date.now(), isStreaming: true },
            b: { model: null, kb: kbId, content: '', thinkStartTime: Date.now(), isStreaming: true },
            voted: false, winner: null,
          },
        };
        setChats((prev) => updateChatById(prev, targetChatId, (chat) => ({
          ...chat, messages: [...chat.messages, arenaMessage],
        })));

        // Pick the two models up front so the pair is always disjoint —
        // users explicitly do not want the arena to compare a model with
        // itself. Each side's substitution pool starts pre-seeded with the
        // other side's pick, so retries also can't collide.
        // pickArenaPair internally weighs vLLM models higher than OpenRouter.
        const pair = pickArenaPair(pool);
        if (!pair) {
          setChats((prev) => updateChatById(prev, targetChatId, (chat) => ({
            ...chat,
            messages: [
              ...chat.messages.slice(0, -1),
              {
                role: 'assistant',
                isArena: false,
                content: '',
                notice: { kind: 'error', key: 'arenaNeedTwoModels' },
              },
            ],
          })));
          return;
        }
        const excludeA = new Set([pair.b.id]);
        const excludeB = new Set([pair.a.id]);
        const sideFailedExhaustion = { a: false, b: false };
        // Populated on each side's successful, non-blank completion so the finished
        // comparison can be posted once both sides land — React state (arenaData.a/b)
        // isn't readable synchronously right after the setChats calls below.
        const sideResults = { a: null, b: null };

        const runSide = async (sideKey) => {
          const sideExclude = sideKey === 'a' ? excludeA : excludeB;
          const sideMessages = sideKey === 'a' ? messagesA : messagesB;
          const sideInitial = sideKey === 'a' ? pair.a : pair.b;
          // Track whether any content event actually delivered a non-empty
          // payload. Without this, a model that streams a clean 200 with zero
          // tokens lands in the success branch and the bubble becomes
          // votable on a blank response — user reported exactly this.
          let receivedContent = false;
          try {
            const { model, result } = await runArenaSideWithSubstitution({
              pool, exclude: sideExclude, kbId, messages: sideMessages, sessionId: requestConfig.sessionId,
              initialCandidate: sideInitial,
              sendChat: sendChatMessage,
              arena: true,
              // Notify the user the moment we burn a model and pick another:
              // briefly write a hint into this side's content so they know
              // why this column is still spinning. The hint is overwritten
              // by the next model's content as soon as it starts streaming.
              onSubstitution: () => {
                setChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
                  ...sideState, content: `⏳ ${i18nLookup('arenaModelSwitched')}`,
                })));
              },
              onEvent: (event) => {
                if (event.type !== 'content') return;
                if (event.fullContent && event.fullContent.length > 0) {
                  receivedContent = true;
                }
                setChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => (
                  applyArenaSideContent(sideState, event.fullContent)
                )));
              },
            });
            if (!receivedContent) {
              // Blank response: keep `model: null` so `bothSidesReady` stays
              // false in ArenaMessageBubble and the user can't vote on a
              // missing answer. Stop the spinner regardless — this side IS
              // done, just unsuccessfully.
              setChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
                ...sideState,
                model: null,
                isStreaming: false,
                ...(sideState.content ? {} : { notice: { kind: 'error', key: 'arenaModelNoAnswer' } }),
              })));
              return;
            }
            // Per-side completion: stop *this* column's spinner now, even
            // though the other side may still be streaming. Avoids the
            // "two thinking phrases when only one is actually working"
            // confusion.
            sideResults[sideKey] = { model: model.id, content: result?.content || '' };
            setChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
              ...sideState, model: model.id, isStreaming: false,
            })));
          } catch (error) {
            const isExhausted = error instanceof ArenaPoolExhaustedError;
            if (isExhausted) sideFailedExhaustion[sideKey] = true;
            const notice = isExhausted
              ? { kind: 'error', key: 'arenaModelSearchFailed' }
              : buildErrorNotice(error);
            setChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
              ...sideState, isStreaming: false, ...(sideState.content ? {} : { notice }),
            })));
            refreshModelsAndApplyState();
          }
        };

        await Promise.all([runSide('a'), runSide('b')]);

        if (sideFailedExhaustion.a || sideFailedExhaustion.b) {
          // Strip the unvotable arena bubble and leave a non-arena notice so
          // input unlocks and the chat history walker doesn't see a pending
          // arena round forever.
          setChats((prev) => updateChatById(prev, targetChatId, (chat) => ({
            ...chat,
            messages: [
              ...chat.messages.slice(0, -1),
              {
                role: 'assistant',
                isArena: false,
                content: '',
                notice: { kind: 'error', key: 'arenaPoolExhausted' },
              },
            ],
          })));
          return;
        }

        setChats((prev) => finalizeLastArenaMessage(prev, targetChatId));

        if (sideResults.a && sideResults.b) {
          // Store the comparison itself. Best-effort: the answer is already on screen, and a
          // failure here must never surface as a chat error. It is also a no-op server-side
          // without the history consent.
          try {
            await recordArenaTurn({
              sessionId: requestConfig.sessionId,
              question: userMessage.content,
              turnIndex: arenaTurnIndex(historyBefore),
              sides: [
                { key: 'a', model: sideResults.a.model, knowledgeBaseId: kbId, content: sideResults.a.content, sources: [] },
                { key: 'b', model: sideResults.b.model, knowledgeBaseId: kbId, content: sideResults.b.content, sources: [] },
              ],
            });
          } catch (error) {
            console.error('Failed to record the arena turn:', error);
          }
        }
      } else {
        const assistantMessage = {
          role: 'assistant',
          content: '',
          thinkStartTime: Date.now(),
          requestModelId: requestConfig.modelId,
          responseModelId: null,
          knowledgeBaseId: requestConfig.knowledgeBaseId,
          agentStages: [],
          agentSummary: null,
          thinkingContent: '',
          isStreaming: true,
        };

        setChats((prev) => updateChatById(prev, targetChatId, (chat) => ({
          ...chat,
          messages: [...chat.messages, assistantMessage],
        })));

        const controller = new AbortController();
        abortControllersRef.current.set(targetChatId, controller);
        const result = await sendChatMessage({
          messages: messageHistory,
          signal: controller.signal,
          modelId: requestConfig.modelId,
          knowledgeBaseId: requestConfig.knowledgeBaseId,
          sessionId: requestConfig.sessionId,
          stream: true,
          onEvent: (event) => {
            if (event.type === 'stage') {
              setChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
                if (message?.isArena || message?.role !== 'assistant') {
                  return message;
                }

                const stages = [...(message.agentStages || [])];

                if (event.status === 'started') {
                  stages.push({
                    stage: event.stage,
                    status: 'running',
                    durationMs: null,
                    detail: event.detail,
                  });
                } else if (event.status === 'completed' || event.status === 'complete') {
                  const idx = stages.findIndex(
                    (s) => s.stage === event.stage && s.status === 'running',
                  );
                  if (idx >= 0) {
                    stages[idx] = {
                      ...stages[idx],
                      status: 'complete',
                      durationMs: event.durationMs,
                      detail: event.detail || stages[idx].detail,
                    };
                  } else {
                    stages.push({
                      stage: event.stage,
                      status: 'complete',
                      durationMs: event.durationMs,
                      detail: event.detail,
                    });
                  }
                } else if (event.status === 'failed') {
                  const idx = stages.findIndex(
                    (s) => s.stage === event.stage && s.status === 'running',
                  );
                  if (idx >= 0) {
                    stages[idx] = { ...stages[idx], status: 'failed', durationMs: event.durationMs };
                  }
                } else if (event.status === 'skipped') {
                  stages.push({
                    stage: event.stage,
                    status: 'skipped',
                    durationMs: null,
                    detail: event.detail,
                  });
                }

                return { ...message, agentStages: stages };
              }));
              return;
            }

            if (event.type === 'slow_warning') {
              setChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
                if (message?.isArena || message?.role !== 'assistant') return message;
                return { ...message, slowWarning: true };
              }));
              return;
            }

            if (event.type === 'thinking') {
              setChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
                if (message?.isArena || message?.role !== 'assistant') {
                  return message;
                }
                return {
                  ...message,
                  thinkingContent: (message.thinkingContent || '') + event.content,
                };
              }));
              return;
            }

            if (event.type === 'summary') {
              setChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
                if (message?.isArena || message?.role !== 'assistant') {
                  return message;
                }
                // Mark any still-running stages as complete
                const stages = (message.agentStages || []).map((s) =>
                  s.status === 'running' ? { ...s, status: 'complete' } : s,
                );
                return {
                  ...message,
                  agentStages: stages,
                  agentSummary: { totalMs: event.totalMs, stages: event.stages },
                };
              }));
              return;
            }

            if (event.type === 'sources') {
              setChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
                if (message?.isArena || message?.role !== 'assistant') return message;
                return { ...message, sources: event.sources };
              }));
              return;
            }

            if (event.type === 'model') {
              setChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
                if (message?.isArena || message?.role !== 'assistant' || message.responseModelId === event.modelId) {
                  return message;
                }

                return {
                  ...message,
                  responseModelId: event.modelId,
                };
              }));
              return;
            }

            if (event.type === 'content') {
              setChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
                if (message?.isArena || message?.role !== 'assistant') {
                  return message;
                }

                const nextMessage = applyStreamingThinkTime(message, event.fullContent);
                if (event.modelId) {
                  nextMessage.responseModelId = event.modelId;
                }
                return nextMessage;
              }));
            }
          },
        });

        setChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
          if (message?.isArena || message?.role !== 'assistant') {
            return message;
          }

          let nextMessage = finalizeThinkTime(message);
          // completionId is the OpenAI response id captured by the API client —
          // message feedback (👍/👎) is attached to it server-side.
          nextMessage = { ...nextMessage, isStreaming: false, completionId: result.completionId ?? null };
          const resolvedModelId = result.modelId
            || nextMessage.responseModelId
            || nextMessage.requestModelId
            || null;

          if (nextMessage.responseModelId !== resolvedModelId) {
            nextMessage = {
              ...nextMessage,
              responseModelId: resolvedModelId,
            };
          }

          return nextMessage;
        }));
      }
    } catch (error) {
      console.error(error);
      if (error?.code === 'user_stopped') {
        // Manual stop: keep whatever streamed, show a neutral "Stopped" notice and
        // a retry. No /v1/status probe, no model refresh — nothing failed.
        setChats((prev) => applyLastMessageNotice(prev, targetChatId, buildStopNotice(), { userText: trimmedText }));
      } else {
        // Overload UX: for a timeout, fetch live load so the message can show
        // "~N in progress" past the threshold. Retry re-runs this same user turn.
        const load =
          error?.code === 'chat_timeout'
            ? resolveOverload(await fetchServiceStatus())
            : resolveOverload(
                error?.httpStatus === 503
                  ? { active: error?.activeRequests, limit: error?.limit }
                  : {},
              );
        setChats((prev) => applyLastMessageNotice(prev, targetChatId, buildErrorNotice(error, { load }), { userText: trimmedText }));
        refreshModelsAndApplyState();
      }
    } finally {
      setGeneratingChats((prev) => {
        const next = new Set(prev);
        next.delete(targetChatId);
        return next;
      });
      abortControllersRef.current.delete(targetChatId);
    }
  };

  // Stop waiting: abort the in-flight request for the active chat. The abort
  // unwinds to the catch above, which renders the overload/retry state.
  const handleStopWaiting = () => {
    const controller = abortControllersRef.current.get(activeChatId);
    if (controller) controller.abort();
  };

  // Re-run the same user question after an interrupted answer. handleSendMessage
  // guards against an empty text / an in-flight chat, and `retryOf` makes it
  // reuse the existing user message rather than appending a duplicate.
  const handleRetryMessage = (message) => {
    void handleSendMessage(message?.retry?.userText || '', { retryOf: message });
  };

  // Current consent-document version, fetched on demand if the mount prime missed it.
  const resolveConsentVersion = async () => {
    if (consentVersionRef.current) return consentVersionRef.current;
    try {
      const docs = await getLegalDocuments();
      consentVersionRef.current = docs.find((doc) => doc.kind === CONSENT_KIND)?.version || null;
    } catch { /* leave null — the choice just won't be recorded this time */ }
    return consentVersionRef.current;
  };

  // Records service consent (chat storage) + the improvement opt-in. `improve` is
  // true for «Продолжить», false for «Не сейчас» — either way the chat is stored.
  const recordConsent = async (improve, source) => {
    const version = await resolveConsentVersion();
    if (!version) return;
    try {
      await patchPrivacySettings({
        documentVersion: version,
        serviceAndHistory: true,
        menoImprovement: improve,
        source,
      });
    } catch (error) {
      console.warn('Consent choice not recorded', error);
    }
  };

  // «Продолжить»: grant the improvement opt-in (definitive — the gate won't nag again).
  const handleConsentContinue = async () => {
    setConsentDecided();
    setImprovementEnabled(true); // consent granted → the settings toggle reflects it
    setIsConsentModalVisible(false);
    await recordConsent(true, 'consent_modal');
  };

  // «Не сейчас» (or X / Esc / backdrop on a re-prompt): defer. The chat is still
  // stored (service consent recorded), improvement stays off, and the gate re-asks
  // after CONSENT_REPROMPT_DAYS — gently, as a dismissible re-prompt.
  const handleConsentDefer = async () => {
    deferConsent();
    setConsentDismissible(true); // next appearance is a gentle re-prompt
    setImprovementEnabled(false); // deferred → improvement stays off (matches «Не сейчас»)
    setIsConsentModalVisible(false);
    await recordConsent(false, 'consent_modal_defer');
  };

  // Registration records service consent (best-effort) so the account starts
  // consented; improvement stays opt-in via the banner.
  const handleRegister = async (email, password, nickname) => {
    const user = await auth.register(email, password, nickname);
    setIsConsentModalVisible(false);
    const version = await resolveConsentVersion();
    if (version) {
      patchPrivacySettings({
        documentVersion: version,
        serviceAndHistory: true,
        menoImprovement: false,
        source: 'registration',
      }).catch((error) => console.warn('Registration consent not recorded', error));
    }
    return user;
  };

  // «Настройки»: open on the «О сервисе» menu; pre-fetch the improvement state so
  // the «Данные и конфиденциальность» sub-view is ready when the user drills in.
  const handleOpenSettings = async () => {
    setIsSettingsOpen(true);
    try {
      const state = await getPrivacySettings();
      setImprovementEnabled(!!state.menoImprovement);
    } catch { /* leave unknown; the toggle still works optimistically */ }
  };

  const handleToggleImprovement = async (next) => {
    setImprovementEnabled(next); // optimistic
    setConsentDecided(); // an explicit settings choice — the gate should stop prompting
    const version = await resolveConsentVersion();
    if (!version) return;
    try {
      await patchPrivacySettings({
        documentVersion: version,
        serviceAndHistory: true,
        menoImprovement: next,
        source: 'settings',
      });
    } catch (error) {
      console.warn('Improvement setting not saved', error);
      setImprovementEnabled(!next); // revert
    }
  };

  const handleClearLocalHistory = () => {
    clearChats();
    const fresh = createNewChat({
      modelId: resolveValidId(models, localStorage.getItem(LAST_USED_MODEL_KEY), models[0]?.id || ''),
      knowledgeBaseId: resolveValidId(kbs, localStorage.getItem(LAST_USED_KB_KEY), kbs[0]?.id || ''),
    });
    setChats([fresh]);
    setActiveChatId(fresh.id);
    setIsSettingsOpen(false);
  };

  // Erase the server-side history but stay signed in — the identity survives, so only
  // the chat list resets. Distinct from handleDeleteData, which also drops the account.
  const handleDeleteServerHistory = async () => {
    try {
      await deleteServerHistory();
    } catch (error) {
      console.warn('Server history deletion failed', error);
      return;
    }
    clearChats();
    const fresh = createNewChat({
      modelId: resolveValidId(models, localStorage.getItem(LAST_USED_MODEL_KEY), models[0]?.id || ''),
      knowledgeBaseId: resolveValidId(kbs, localStorage.getItem(LAST_USED_KB_KEY), kbs[0]?.id || ''),
    });
    setChats([fresh]);
    setActiveChatId(fresh.id);
    setIsSettingsOpen(false);
  };

  // Right to erasure: delete everything server-side, then reset to a fresh anonymous
  // identity (the old JWT / guest token no longer resolves).
  const handleDeleteData = async () => {
    try {
      await deleteMyData();
    } catch (error) {
      console.warn('Data deletion failed', error);
      return;
    }
    auth.logout();
    clearChats();
    setGuestToken(null);
    try {
      localStorage.removeItem(CONSENT_DECISION_FLAG);
      localStorage.removeItem(CONSENT_DEFER_UNTIL_KEY);
    } catch { /* ignore */ }
    setConsentDismissible(false); // fresh identity → next prompt is a first prompt
    await ensureGuestSession();
    const fresh = createNewChat({
      modelId: resolveValidId(models, localStorage.getItem(LAST_USED_MODEL_KEY), models[0]?.id || ''),
      knowledgeBaseId: resolveValidId(kbs, localStorage.getItem(LAST_USED_KB_KEY), kbs[0]?.id || ''),
    });
    setChats([fresh]);
    setActiveChatId(fresh.id);
    setImprovementEnabled(false);
    setIsSettingsOpen(false);
    setIsConsentModalVisible(true);
  };

  const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="app-container">
      <Sidebar
        isOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
        chats={sortedChats}
        activeChatId={activeChatId}
        onSelectChat={(id) => {
          setActiveChatId(id);
          setCurrentView('chat');
        }}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        generatingChats={generatingChats}
        currentView={currentView}
        setCurrentView={setCurrentView}
        theme={theme}
        toggleTheme={toggleTheme}
        isArenaMode={isArenaMode}
        setIsArenaMode={setIsArenaMode}
        user={auth.user}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
        onOpenSettings={handleOpenSettings}
      />

      <main className="main-content">
        <SettingsBar
          onNewChat={handleNewChat}
          theme={theme}
          toggleTheme={toggleTheme}
          isSidebarOpen={isSidebarOpen}
          models={models}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
          onDropdownOpen={handleModelsDropdownOpen}
          isArenaMode={isArenaMode}
          setIsArenaMode={setIsArenaMode}
          currentView={currentView}
          setCurrentView={setCurrentView}
          coreModelId={coreModelId}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          user={auth.user}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onLogout={handleLogout}
        />
        {currentView === 'chat' ? (
          (() => {
            const activeChatMessages = activeChat?.messages || [];
            const lastMessage = activeChatMessages[activeChatMessages.length - 1];
            const isGeneratingNow = activeChatId ? generatingChats.has(activeChatId) : false;
            // Couples to the live isArenaMode toggle: turning arena off unblocks the
            // input even on an unvoted bubble (intentional — user explicitly left arena).
            const voteIsPending = Boolean(
              isArenaMode &&
              lastMessage?.isArena &&
              lastMessage?.arenaData &&
              lastMessage.arenaData.voted === false &&
              !isGeneratingNow
            );
            return (
              <ChatArea
                messages={activeChat.messages}
                isGenerating={isGeneratingNow}
                onSendMessage={handleSendMessage}
                onRetry={handleRetryMessage}
                onStop={handleStopWaiting}
                modelsAvailable={models.length > 0}
                kbs={kbs}
                selectedKb={selectedKb}
                onKbChange={handleKbChange}
                chatId={activeChatId}
                setChats={setChats}
                voteIsPending={voteIsPending}
              />
            );
          })()
        ) : (
          <Leaderboard onClose={() => setCurrentView('chat')} />
        )}
      </main>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        login={auth.login}
        register={handleRegister}
      />

      <SurveyModal
        isOpen={surveySessionId !== null}
        onAnswer={handleSurveyDone}
        onSkip={() => handleSurveyDone('skipped')}
      />

      {isConsentModalVisible && (
        <ConsentModal
          onContinue={handleConsentContinue}
          onDefer={handleConsentDefer}
          dismissible={consentDismissible}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        improvementEnabled={improvementEnabled}
        onToggleImprovement={handleToggleImprovement}
        onClearHistory={handleClearLocalHistory}
        onDeleteServerHistory={handleDeleteServerHistory}
        onDeleteData={handleDeleteData}
      />
    </div>
  );
}

export default App;
