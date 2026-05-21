import { useCallback, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import ChatArea from './components/ChatArea.jsx';
import SettingsBar from './components/SettingsBar.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import {
  clearChatHistory,
  fetchKnowledgeBases,
  fetchModels,
  refreshModels,
  sendChatMessage,
} from './services/api.js';
import {
  buildArenaPool,
  pickArenaPair,
  runArenaSideWithSubstitution,
  ArenaPoolExhaustedError,
} from './services/arenaMatching.js';
import { buildArenaHistories } from './services/arenaHistory.js';
import {
  createNewChat,
  generateTitle,
  loadChats,
  migrateChats,
  saveChats,
} from './store/chatStore.js';
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

function buildErrorMessage(error) {
  if (error.code === 'model_rate_limited') {
    const until = error.until ? new Date(error.until) : null;
    const hh = until ? String(until.getHours()).padStart(2, '0') : '??';
    const mm = until ? String(until.getMinutes()).padStart(2, '0') : '??';
    const mins = until ? Math.max(0, Math.round((until.getTime() - Date.now()) / 60000)) : null;
    return `⚠ Model is rate-limited until ${hh}:${mm}${mins !== null ? ` (~${mins} min)` : ''}. Try another model.`;
  }
  if (error.code === 'model_unreachable') {
    return `⚠ Model is currently unreachable. Try another model.`;
  }
  if (error.code === 'core_model_unavailable') {
    return `⚠ Internal RAG model unavailable — backend cannot run retrieval.`;
  }
  return `⚠ ${error.message || 'Request failed.'}`;
}

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

function applyLastMessageError(chats, chatId, error) {
  const errorMessage = buildErrorMessage(error);

  return updateLastMessageInChat(chats, chatId, (message) => {
    if (!message) {
      return message;
    }

    if (message.isArena) {
      return {
        ...message,
        arenaData: {
          ...message.arenaData,
          a: {
            ...message.arenaData.a,
            content: message.arenaData.a.content || errorMessage,
          },
          b: {
            ...message.arenaData.b,
            content: message.arenaData.b.content || errorMessage,
          },
        },
      };
    }

    if (message.role !== 'assistant') {
      return message;
    }

    return {
      ...message,
      content: errorMessage,
      responseModelId: message.responseModelId || message.requestModelId || null,
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

  // Initialize data and migrate stored chats to the chat-scoped config shape.
  useEffect(() => {
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

  // Auto-fallback when the selected model disappears from the available list.
  useEffect(() => {
    if (models.length === 0 || !activeChatId) return;
    if (selectedModel && models.some((m) => m.id === selectedModel)) return;
    const fallback = models[0]?.id || '';
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

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
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

  const handleKbChange = (knowledgeBaseId) => {
    updateActiveChatRuntimeConfig({ knowledgeBaseId });
  };

  const handleNewChat = () => {
    const currentChat = chats.find((chat) => chat.id === activeChatId);
    if (currentChat && currentChat.messages.length === 0) {
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

  const handleDeleteChat = (id) => {
    setChats((prev) => prev.filter((chat) => chat.id !== id));
    if (activeChatId === id) {
      setActiveChatId(null);
    }

    void clearChatHistory(id).catch((error) => {
      console.warn('Failed to clear server-side chat history', error);
    });
  };

  const handleSendMessage = async (text) => {
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

    const userMessage = { role: 'user', content: trimmedText };
    const messageHistory = [...targetChat.messages, userMessage];

    setChats((prev) => updateChatById(prev, targetChatId, (chat) => {
      const nextMessages = [...chat.messages, userMessage];
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
                content: '⚠ No available models for arena right now. Refresh to retry.',
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
                content: '⚠ Need at least two distinct models for an arena round. Try again in a moment.',
              },
            ],
          })));
          return;
        }
        const excludeA = new Set([pair.b.id]);
        const excludeB = new Set([pair.a.id]);
        const sideFailedExhaustion = { a: false, b: false };

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
            const { model } = await runArenaSideWithSubstitution({
              pool, exclude: sideExclude, kbId, messages: sideMessages, sessionId: requestConfig.sessionId,
              initialCandidate: sideInitial,
              sendChat: sendChatMessage,
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
              // missing answer.
              setChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
                ...sideState,
                model: null,
                content: sideState.content || '⚠ Модель не вернула ответ. Попробуйте новый вопрос.',
              })));
              return;
            }
            setChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
              ...sideState, model: model.id,
            })));
          } catch (error) {
            const isExhausted = error instanceof ArenaPoolExhaustedError;
            if (isExhausted) sideFailedExhaustion[sideKey] = true;
            const errorMessage = isExhausted
              ? '⚠ Could not find an available model after several attempts.'
              : buildErrorMessage(error);
            setChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
              ...sideState, content: sideState.content || errorMessage,
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
                content: '⚠ Could not run an arena round (pool exhausted). Try again in a moment.',
              },
            ],
          })));
          return;
        }

        setChats((prev) => finalizeLastArenaMessage(prev, targetChatId));
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

        const result = await sendChatMessage({
          messages: messageHistory,
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
          nextMessage = { ...nextMessage, isStreaming: false };
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
      setChats((prev) => applyLastMessageError(prev, targetChatId, error));
      refreshModelsAndApplyState();
    } finally {
      setGeneratingChats((prev) => {
        const next = new Set(prev);
        next.delete(targetChatId);
        return next;
      });
    }
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
    </div>
  );
}

export default App;
