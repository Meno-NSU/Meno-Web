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
  fetchConversation,
  fetchConversations,
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
import { buildArenaHistories, nextArenaTurnIndex } from './services/arenaHistory.js';
import { messagesFromTurns } from './services/conversationRestore.js';
import {
  chatFromSummary,
  chatsForIdentity,
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
// Stable reference for the "auth not resolved yet" state of visibleChats — a
// fresh [] literal there would change identity on every render and re-fire
// every effect that depends on it for as long as auth.ready stays false.
const EMPTY_CHATS = [];

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

// A local chat's updatedAt is a Date.now() number; a server-derived one (see
// chatFromSummary) is the backend's ISO timestamp string. `a - b` on two ISO
// strings is NaN, which Array#sort's stable ordering just passes through
// unchanged — harmless on its own (the backend already returns newest-first),
// but the two shapes never appear in the same list until a message is sent to
// an older server chat and its updatedAt flips to a live Date.now(). At that
// point a plain numeric subtraction can no longer tell it apart from its
// still-string-dated neighbours, and it stops bubbling to the top. Normalising
// both shapes to a real number keeps the comparison meaningful either way.
function toTimestamp(value) {
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getLatestChatId(chats) {
  if (!Array.isArray(chats) || chats.length === 0) {
    return null;
  }
  return [...chats].sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt))[0].id;
}

function updateChatById(chats, chatId, updater) {
  // Returning the exact same array reference when nothing matched (rather than a
  // new-but-identical one from .map) lets React's setState bail-out skip a
  // re-render entirely, and stops an unrelated chat mutation from being mistaken,
  // by reference, for a real change to chats/serverChats it never touched — see
  // the conversation-load effect below, which used to depend on that reference.
  const index = chats.findIndex((chat) => chat.id === chatId);
  if (index === -1) return chats;
  const next = chats.slice();
  next[index] = updater(chats[index]);
  return next;
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

// Records, locally, the turn_index a just-recorded round was ACTUALLY posted
// under. Without this, a later vote on this same round (ChatArea.handleVote)
// would have no stored arenaData.turnIndex to prefer and would fall back to
// recomputing one via nextArenaTurnIndex/arenaTurnIndex over the same
// historyBefore the recorder used — landing on the SAME index the recorder
// just avoided reusing, in a conversation with an earlier gap. Stamping it
// here is what keeps the recorder and the voter in agreement for this round.
function stampLastArenaTurnIndex(chats, chatId, turnIndex) {
  return updateLastMessageInChat(chats, chatId, (message) => {
    if (!message?.isArena) {
      return message;
    }
    return { ...message, arenaData: { ...message.arenaData, turnIndex } };
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

  // Chat state. `chats` is the guest/local list (localStorage-backed).
  // `serverChats` is a signed-in user's list, fetched from the account —
  // never persisted locally (see the saveChats effect below). Which one is
  // actually rendered is decided once, by chatsForIdentity, wherever the
  // sidebar list or the active chat is read (see `visibleChats`).
  const [chats, setChats] = useState(() => loadChats());
  const [serverChats, setServerChats] = useState([]);
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

  // Single write path for "the chat currently in use": while signed in it targets
  // serverChats (the only list rendered for that identity), otherwise the local,
  // localStorage-backed `chats`. Every handler below that mutates a chat's
  // content — sending a message, voting, feedback, runtime-config, delete —
  // goes through this, so a chat created mid-session while signed in (never
  // returned by fetchConversations, since it didn't exist yet) still renders
  // and updates correctly: it simply lives in serverChats from the moment it's
  // created.
  const setActiveChats = useCallback((updater) => {
    if (auth.isAuthenticated) {
      setServerChats(updater);
    } else {
      setChats(updater);
    }
  }, [auth.isAuthenticated]);

  // What is actually shown in the sidebar and as the active chat. Gated on
  // auth.ready (not just isAuthenticated): a returning signed-in user's token
  // is verified asynchronously, and isAuthenticated is false until that
  // resolves. Without this gate, a browser with a stored token would render
  // its LOCAL chats for that brief window — exactly the shared-computer leak
  // this whole design exists to prevent. A guest with no stored token has
  // auth.ready true from the first render, so this costs guests nothing.
  const visibleChats = auth.ready
    ? chatsForIdentity({ isAuthenticated: auth.isAuthenticated, localChats: chats, serverChats })
    : EMPTY_CHATS;

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
    // Persist the LOCAL (guest) list only. A signed-in user's chats live entirely
    // in serverChats; writing them here would leak an account's history into this
    // browser's localStorage — precisely the shared-computer risk this design
    // exists to prevent. Nothing needs to happen on the sign-in transition itself:
    // `chats` doesn't change while signed in (every mutation routes to serverChats
    // instead), so there is simply nothing new to persist during that window.
    if (auth.isAuthenticated) return;
    saveChats(chats);
  }, [chats, auth.isAuthenticated]);

  // Fetch a signed-in user's conversation list whenever the identity becomes
  // signed-in; drop it on sign-out (a guest never sees another account's list,
  // even for the instant before the next effect run would have cleared it).
  useEffect(() => {
    let cancelled = false;
    if (!auth.isAuthenticated) {
      setServerChats([]);
      return () => { cancelled = true; };
    }
    (async () => {
      const summaries = await fetchConversations();
      if (cancelled) return;
      setServerChats(summaries.map((s) => chatFromSummary(s, {
        defaultModelId: resolveValidId(models, localStorage.getItem(LAST_USED_MODEL_KEY), models[0]?.id || ''),
        defaultKnowledgeBaseId: resolveValidId(kbs, localStorage.getItem(LAST_USED_KB_KEY), kbs[0]?.id || ''),
      })));
    })();
    return () => { cancelled = true; };
    // Deliberately NOT depending on models/kbs (refreshed every 30s): a
    // dependency on either would re-fetch the whole conversation list on every
    // poll tick, discarding any conversation content already loaded by the
    // effect below (its `messages !== null` guard would then find every
    // fetched chat "unloaded" again).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isAuthenticated]);

  // Whether the active chat is a server chat still waiting on its content fetch.
  // Deliberately a primitive, not the serverChats array itself: updateChatById /
  // updateLastMessageInChat return a NEW array reference on every streamed token
  // for whichever chat is generating, even a completely unrelated one, and the
  // load effect below used to depend on that array directly — restarting this
  // fetch on every one of those unrelated changes (measured at one GET per
  // streamed token). A boolean only changes when THIS chat's loaded state
  // actually does.
  const activeServerChat = auth.isAuthenticated
    ? serverChats.find((c) => c.id === activeChatId)
    : undefined;
  const activeChatStillLoading = !!activeServerChat && activeServerChat.messages === null;

  // Per-chat guard against firing this fetch twice for the same id while one is
  // already outstanding (e.g. React's dev-mode double-invoke of effects) — belt
  // and suspenders alongside the dependency fix above.
  const conversationFetchesInFlightRef = useRef(new Set());

  // Load one conversation's content the first time it's opened.
  useEffect(() => {
    if (!auth.isAuthenticated || !activeChatId || !activeChatStillLoading) return;
    if (conversationFetchesInFlightRef.current.has(activeChatId)) return;
    conversationFetchesInFlightRef.current.add(activeChatId);
    const chatIdBeingFetched = activeChatId;
    let cancelled = false;
    (async () => {
      try {
        const conversation = await fetchConversation(chatIdBeingFetched);
        if (cancelled) return;
        // 404 (or a network failure — fetchConversation reads the same either
        // way) means gone or not ours; show it empty rather than spinning forever.
        const messages = conversation ? messagesFromTurns(conversation.turns) : [];
        setServerChats((prev) => prev.map((c) => (c.id === chatIdBeingFetched ? { ...c, messages } : c)));
      } finally {
        conversationFetchesInFlightRef.current.delete(chatIdBeingFetched);
      }
    })();
    return () => { cancelled = true; };
  }, [auth.isAuthenticated, activeChatId, activeChatStillLoading]);

  useEffect(() => {
    if (visibleChats.length === 0) {
      setActiveChatId(null);
      return;
    }

    if (!activeChatId || !visibleChats.some((chat) => chat.id === activeChatId)) {
      setActiveChatId(getLatestChatId(visibleChats));
    }
  }, [visibleChats, activeChatId]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const activeChat = visibleChats.find((chat) => chat.id === activeChatId) || EMPTY_CHAT;
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

    setActiveChats((prev) => updateChatById(prev, activeChatId, (chat) => ({
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
    const prevChat = visibleChats.find((chat) => chat.id === prevId);
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
    setActiveChats((prev) => prev.map((chat) => (
      chat.id === prevId ? { ...chat, surveyed: true } : chat
    )));
    if (shouldShowSurvey()) setSurveySessionId(prevId);
  }, [activeChatId, visibleChats, generatingChats, setActiveChats]);

  // Both outcomes mark the chat surveyed locally first (never nag twice, even
  // if the POST fails) and report best-effort: answers as themselves, every
  // dismissal path as the explicit 'skipped'.
  const handleSurveyDone = (answer) => {
    const sessionId = surveySessionId;
    setSurveySessionId(null);
    if (!sessionId) return;
    setActiveChats((prev) => prev.map((chat) => (
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
    // chat). A server chat summary not yet opened carries `messages: null`
    // (see chatFromSummary) — Array.isArray excludes it from this check, so
    // an unopened conversation is never mistaken for an empty one.
    const existingEmpty = visibleChats.find((c) => Array.isArray(c.messages) && c.messages.length === 0);
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

    // While signed in this lands in serverChats (see setActiveChats): a chat
    // created mid-session, never returned by fetchConversations, still needs
    // to be part of the list that's actually rendered.
    setActiveChats((prev) => [nextChat, ...prev]);
    setActiveChatId(nextChat.id);
  };

  // Logout signs out but must NOT touch local (guest) history: that history was
  // only ever hidden while signed in (chatsForIdentity), never destroyed, and
  // the whole point is that it comes back now. serverChats itself clears
  // reactively (the auth.isAuthenticated-driven effect above resets it to []
  // on sign-out) — nothing to do for it here. A guest who never had a local
  // chat (e.g. registered and signed in immediately) still deserves a fresh
  // one to land on.
  const handleLogout = () => {
    auth.logout();
    if (chats.length === 0) {
      const fresh = createNewChat({
        modelId: resolveValidId(models, localStorage.getItem(LAST_USED_MODEL_KEY), models[0]?.id || ''),
        knowledgeBaseId: resolveValidId(kbs, localStorage.getItem(LAST_USED_KB_KEY), kbs[0]?.id || ''),
      });
      setChats([fresh]);
      setActiveChatId(fresh.id);
    }
  };

  const handleDeleteChat = (id) => {
    setActiveChats((prev) => prev.filter((chat) => chat.id !== id));
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

    const targetChat = visibleChats.find((chat) => chat.id === targetChatId);
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
    // targetChat.messages can be null here: a server chat summary whose content
    // hasn't finished loading yet (see chatFromSummary). Treated as empty rather
    // than crashing on the spread below; see setActiveChats for why this can't
    // race the background fetch and lose the fetched history underneath it.
    const existingMessages = targetChat.messages || [];
    const messageHistory = isRetry ? dropTrailingNotice(existingMessages) : [...existingMessages, userMessage];

    setActiveChats((prev) => updateChatById(prev, targetChatId, (chat) => {
      const chatMessages = chat.messages || [];
      const nextMessages = isRetry ? dropTrailingNotice(chatMessages) : [...chatMessages, userMessage];
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
          setActiveChats((prev) => updateChatById(prev, targetChatId, (chat) => ({
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
        setActiveChats((prev) => updateChatById(prev, targetChatId, (chat) => ({
          ...chat, messages: [...chat.messages, arenaMessage],
        })));

        // Pick the two models up front so the pair is always disjoint —
        // users explicitly do not want the arena to compare a model with
        // itself. Each side's substitution pool starts pre-seeded with the
        // other side's pick, so retries also can't collide.
        // pickArenaPair internally weighs vLLM models higher than OpenRouter.
        const pair = pickArenaPair(pool);
        if (!pair) {
          setActiveChats((prev) => updateChatById(prev, targetChatId, (chat) => ({
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
          // Sources shown for this side's answer, captured off the stream so
          // recordArenaTurn can send what the bubble actually displays instead
          // of an empty list. Reset on substitution (below) so a burned
          // attempt's sources never end up attached to the replacement
          // model's answer.
          let sideSources = [];
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
                sideSources = [];
                setActiveChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
                  ...sideState, content: `⏳ ${i18nLookup('arenaModelSwitched')}`,
                })));
              },
              onEvent: (event) => {
                if (event.type === 'sources') {
                  sideSources = event.sources || [];
                  return;
                }
                if (event.type !== 'content') return;
                if (event.fullContent && event.fullContent.length > 0) {
                  receivedContent = true;
                }
                setActiveChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => (
                  applyArenaSideContent(sideState, event.fullContent)
                )));
              },
            });
            if (!receivedContent) {
              // Blank response: keep `model: null` so `bothSidesReady` stays
              // false in ArenaMessageBubble and the user can't vote on a
              // missing answer. Stop the spinner regardless — this side IS
              // done, just unsuccessfully.
              setActiveChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
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
            sideResults[sideKey] = { model: model.id, content: result?.content || '', sources: sideSources };
            setActiveChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
              ...sideState, model: model.id, isStreaming: false,
            })));
          } catch (error) {
            const isExhausted = error instanceof ArenaPoolExhaustedError;
            if (isExhausted) sideFailedExhaustion[sideKey] = true;
            const notice = isExhausted
              ? { kind: 'error', key: 'arenaModelSearchFailed' }
              : buildErrorNotice(error);
            setActiveChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
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
          setActiveChats((prev) => updateChatById(prev, targetChatId, (chat) => ({
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

        setActiveChats((prev) => finalizeLastArenaMessage(prev, targetChatId));

        if (sideResults.a && sideResults.b) {
          // Store the comparison itself. Best-effort: the answer is already on screen, and a
          // failure here must never surface as a chat error. It is also a no-op server-side
          // without the history consent.
          //
          // Computed once, from the restored+live history actually in front of us right now
          // (not a plain count — see nextArenaTurnIndex for why a restored conversation with
          // an earlier unposted round needs this instead of arenaTurnIndex).
          const turnIndexForThisRound = nextArenaTurnIndex(historyBefore);
          try {
            await recordArenaTurn({
              sessionId: requestConfig.sessionId,
              question: userMessage.content,
              turnIndex: turnIndexForThisRound,
              sides: [
                { key: 'a', model: sideResults.a.model, knowledgeBaseId: kbId, content: sideResults.a.content, sources: sideResults.a.sources },
                { key: 'b', model: sideResults.b.model, knowledgeBaseId: kbId, content: sideResults.b.content, sources: sideResults.b.sources },
              ],
            });
            // Stamp the index this round actually landed on so a later vote
            // (ChatArea.handleVote) uses it directly instead of recomputing —
            // see stampLastArenaTurnIndex.
            setActiveChats((prev) => stampLastArenaTurnIndex(prev, targetChatId, turnIndexForThisRound));
          } catch (error) {
            console.error('Failed to record the arena turn:', error);
          }
        } else {
          // One or both sides never produced a votable answer (blank response, or a
          // non-exhaustion error) — bothSidesReady in ArenaMessageBubble is false too,
          // so this round can never be voted on and skipping the POST loses nothing
          // vote-wise. But log it: without this, "never posted" and "posted then lost"
          // look identical from the outside, and a comparison missing from restored
          // history would otherwise be silent all the way through.
          console.warn('Arena turn not recorded: at least one side produced no result.', {
            sessionId: requestConfig.sessionId,
            hasA: !!sideResults.a,
            hasB: !!sideResults.b,
          });
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

        setActiveChats((prev) => updateChatById(prev, targetChatId, (chat) => ({
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
              setActiveChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
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
              setActiveChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
                if (message?.isArena || message?.role !== 'assistant') return message;
                return { ...message, slowWarning: true };
              }));
              return;
            }

            if (event.type === 'thinking') {
              setActiveChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
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
              setActiveChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
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
              setActiveChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
                if (message?.isArena || message?.role !== 'assistant') return message;
                return { ...message, sources: event.sources };
              }));
              return;
            }

            if (event.type === 'model') {
              setActiveChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
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
              setActiveChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
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

        setActiveChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
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
        setActiveChats((prev) => applyLastMessageNotice(prev, targetChatId, buildStopNotice(), { userText: trimmedText }));
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
        setActiveChats((prev) => applyLastMessageNotice(prev, targetChatId, buildErrorNotice(error, { load }), { userText: trimmedText }));
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
  // Resets serverChats directly (not local `chats`, and not through setActiveChats):
  // this is unconditionally about the server-rendered view, and local history — whatever
  // guest chats were hidden before this sign-in — is not this action's business.
  const handleDeleteServerHistory = async () => {
    try {
      await deleteServerHistory();
    } catch (error) {
      console.warn('Server history deletion failed', error);
      return;
    }
    const fresh = createNewChat({
      modelId: resolveValidId(models, localStorage.getItem(LAST_USED_MODEL_KEY), models[0]?.id || ''),
      knowledgeBaseId: resolveValidId(kbs, localStorage.getItem(LAST_USED_KB_KEY), kbs[0]?.id || ''),
    });
    setServerChats([fresh]);
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

  const sortedChats = [...visibleChats].sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt));

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
                messages={activeChatMessages}
                isGenerating={isGeneratingNow}
                onSendMessage={handleSendMessage}
                onRetry={handleRetryMessage}
                onStop={handleStopWaiting}
                modelsAvailable={models.length > 0}
                kbs={kbs}
                selectedKb={selectedKb}
                onKbChange={handleKbChange}
                chatId={activeChatId}
                setChats={setActiveChats}
                voteIsPending={voteIsPending}
                isLoadingConversation={activeChatStillLoading}
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
