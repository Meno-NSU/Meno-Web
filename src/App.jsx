import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import ChatArea from './components/ChatArea.jsx';
import SettingsBar from './components/SettingsBar.jsx';
import { fetchModels, fetchKnowledgeBases, sendChatMessage } from './services/api.js';
import { loadChats, saveChats, createNewChat, generateTitle } from './store/chatStore.js';
import './index.css';

function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Data state
  const [models, setModels] = useState([]);
  const [kbs, setKbs] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedKb, setSelectedKb] = useState('');

  // Chat state
  const [chats, setChats] = useState(loadChats());
  const [activeChatId, setActiveChatId] = useState(null);
  const [generatingChats, setGeneratingChats] = useState(new Set());

  // Initialize data
  useEffect(() => {
    const initData = async () => {
      const [fetchedModels, fetchedKbs] = await Promise.all([
        fetchModels(),
        fetchKnowledgeBases()
      ]);
      setModels(fetchedModels);
      setKbs(fetchedKbs);

      if (fetchedModels.length > 0) setSelectedModel(fetchedModels[0].id);
      if (fetchedKbs.length > 0) setSelectedKb(fetchedKbs[0].id);
    };
    initData();
  }, []);

  // Initialize chat
  useEffect(() => {
    if (chats.length === 0) {
      const newChat = createNewChat();
      setChats([newChat]);
      setActiveChatId(newChat.id);
    } else if (!activeChatId) {
      // Sort by updated and pick first
      const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
      setActiveChatId(sorted[0].id);
    }
  }, [chats, activeChatId]);

  // Save changes
  useEffect(() => {
    saveChats(chats);
  }, [chats]);


  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  const handleNewChat = () => {
    // Don't create a new chat if the active one has no messages
    const currentChat = chats.find(c => c.id === activeChatId);
    if (currentChat && currentChat.messages.length === 0) {
      return;
    }
    const newChat = createNewChat();
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChat.id);
  };

  const handleDeleteChat = (id) => {
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) {
      setActiveChatId(null); // will auto-select latest in effect
    }
  };

  const activeChat = chats.find(c => c.id === activeChatId) || { messages: [] };

  const handleSendMessage = async (text) => {
    // Check if the ACTIVE chat is generating
    if (!text.trim() || generatingChats.has(activeChatId) || !activeChatId) return;

    const userMessage = { role: 'user', content: text };
    const targetChatId = activeChatId;

    // Update local state with user message
    setChats(prev => prev.map(c => {
      if (c.id === targetChatId) {
        const newMessages = [...c.messages, userMessage];
        return {
          ...c,
          messages: newMessages,
          title: generateTitle(newMessages),
          updatedAt: Date.now()
        };
      }
      return c;
    }));

    setGeneratingChats(prev => new Set(prev).add(targetChatId));

    try {
      // Create empty assistant message first
      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          return {
            ...c,
            // also tracking timestamps for think-time
            messages: [...c.messages, { role: 'assistant', content: '', thinkStartTime: Date.now() }]
          };
        }
        return c;
      }));

      // Find chat again since state updated
      const currentChat = chats.find(c => c.id === targetChatId);
      const messageHistory = [...(currentChat?.messages || []), userMessage];

      await sendChatMessage(
        messageHistory,
        selectedModel,
        selectedKb,
        true, // use streaming
        (_, fullContent) => {
          // Update the streaming content
          setChats(prev => prev.map(c => {
            if (c.id === targetChatId) {
              const msgs = [...c.messages];
              const lastMsg = msgs[msgs.length - 1];

              lastMsg.content = fullContent;

              // Check if think tag just closed, to freeze thinkTime
              if (fullContent.includes('</think>') && !lastMsg.thinkTime && lastMsg.thinkStartTime) {
                  lastMsg.thinkTime = Math.floor((Date.now() - lastMsg.thinkStartTime) / 1000);
              }

              return { ...c, messages: msgs };
            }
            return c;
          }));
        }
      );
      
      // Force calculation if stream closed without closing think tag
      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          const msgs = [...c.messages];
          const lastMsg = msgs[msgs.length - 1];
          // If thinkTime is still empty, and the message actually HAS a think block
          if (!lastMsg.thinkTime && lastMsg.thinkStartTime && lastMsg.content.includes('<think>')) {
              lastMsg.thinkTime = Math.floor((Date.now() - lastMsg.thinkStartTime) / 1000);
          }
          return { ...c, messages: msgs };
        }
        return c;
      }));

    } catch (error) {
      console.error(error);
      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          const msgs = [...c.messages];
          msgs[msgs.length - 1].content = `**Error:** Failed to get response. ${error.message}`;
          return { ...c, messages: msgs };
        }
        return c;
      }));
    } finally {
      setGeneratingChats(prev => {
        const next = new Set(prev);
        next.delete(targetChatId);
        return next;
      });
    }
  };

  return (
    <div className="app-container">
      <Sidebar
        isOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
        chats={chats.sort((a, b) => b.updatedAt - a.updatedAt)}
        activeChatId={activeChatId}
        onSelectChat={setActiveChatId}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        generatingChats={generatingChats}
      />

      <main className="main-content">
        <SettingsBar
          theme={theme}
          toggleTheme={toggleTheme}
          isSidebarOpen={isSidebarOpen}
          models={models}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />
        <ChatArea
          messages={activeChat.messages}
          isGenerating={generatingChats.has(activeChatId)}
          onSendMessage={handleSendMessage}
          modelsAvailable={models.length > 0}
          kbs={kbs}
          selectedKb={selectedKb}
          onKbChange={setSelectedKb}
        />
      </main>
    </div>
  );
}

export default App;
