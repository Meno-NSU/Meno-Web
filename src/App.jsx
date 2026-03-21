import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import ChatArea from './components/ChatArea.jsx';
import SettingsBar from './components/SettingsBar.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import {
  clearChatHistory,
  fetchKnowledgeBases,
  fetchModels,
  sendChatMessage,
} from './services/api.js';
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
  const details = error instanceof Error ? error.message : String(error);
  return `${SERVER_ERROR_TEXT}\n\n*(Детали: ${details})*`;
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
  if (!sideState.thinkStartTime || sideState.thinkTime || !sideState.content?.includes('<think>')) {
    return sideState;
  }

  return {
    ...sideState,
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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

  // Initialize data and migrate stored chats to the chat-scoped config shape.
  useEffect(() => {
    const initData = async () => {
      const [fetchedModels, fetchedKbs] = await Promise.all([
        fetchModels(),
        fetchKnowledgeBases(),
      ]);

      setModels(fetchedModels);
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
        const combinations = [];
        for (const model of models) {
          for (const kb of kbs) {
            combinations.push({ model: model.id, kb: kb.id });
          }
        }

        let setupA;
        let setupB;
        if (combinations.length < 2) {
          setupA = { model: requestConfig.modelId, kb: requestConfig.knowledgeBaseId };
          setupB = { model: requestConfig.modelId, kb: requestConfig.knowledgeBaseId };
        } else {
          const idxA = Math.floor(Math.random() * combinations.length);
          let idxB;
          do {
            idxB = Math.floor(Math.random() * combinations.length);
          } while (idxB === idxA);

          setupA = combinations[idxA];
          setupB = combinations[idxB];
        }

        const arenaMessage = {
          role: 'assistant',
          isArena: true,
          arenaData: {
            a: { ...setupA, content: '', thinkStartTime: Date.now() },
            b: { ...setupB, content: '', thinkStartTime: Date.now() },
            voted: false,
            winner: null,
          },
        };

        setChats((prev) => updateChatById(prev, targetChatId, (chat) => ({
          ...chat,
          messages: [...chat.messages, arenaMessage],
        })));

        const runArenaSide = async (sideKey, setup) => {
          try {
            await sendChatMessage({
              messages: messageHistory,
              modelId: setup.model,
              knowledgeBaseId: setup.kb,
              sessionId: requestConfig.sessionId,
              stream: true,
              onEvent: (event) => {
                if (event.type !== 'content') {
                  return;
                }

                setChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => (
                  applyArenaSideContent(sideState, event.fullContent)
                )));
              },
            });
          } catch (error) {
            setChats((prev) => updateLastArenaMessageSide(prev, targetChatId, sideKey, (sideState) => ({
              ...sideState,
              content: buildErrorMessage(error),
            })));
          }
        };

        await Promise.all([
          runArenaSide('a', setupA),
          runArenaSide('b', setupB),
        ]);

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

            if (event.type === 'summary') {
              setChats((prev) => updateLastMessageInChat(prev, targetChatId, (message) => {
                if (message?.isArena || message?.role !== 'assistant') {
                  return message;
                }
                return {
                  ...message,
                  agentSummary: { totalMs: event.totalMs, stages: event.stages },
                };
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
        setCurrentView={setCurrentView}
      />

      <main className="main-content">
        <SettingsBar
          theme={theme}
          toggleTheme={toggleTheme}
          isSidebarOpen={isSidebarOpen}
          models={models}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
          isArenaMode={isArenaMode}
          setIsArenaMode={setIsArenaMode}
          setCurrentView={setCurrentView}
        />
        {currentView === 'chat' ? (
          <ChatArea
            messages={activeChat.messages}
            isGenerating={activeChatId ? generatingChats.has(activeChatId) : false}
            onSendMessage={handleSendMessage}
            modelsAvailable={models.length > 0}
            kbs={kbs}
            selectedKb={selectedKb}
            onKbChange={handleKbChange}
            chatId={activeChatId}
            setChats={setChats}
          />
        ) : (
          <Leaderboard />
        )}
      </main>
    </div>
  );
}

export default App;
