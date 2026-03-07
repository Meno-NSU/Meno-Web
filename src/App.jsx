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
  const [isGenerating, setIsGenerating] = useState(false);

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
    if (!text.trim() || isGenerating || !activeChatId) return;

    const userMessage = { role: 'user', content: text };

    // Update local state with user message
    setChats(prev => prev.map(c => {
      if (c.id === activeChatId) {
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

    setIsGenerating(true);

    try {
      // Create empty assistant message first
      setChats(prev => prev.map(c => {
        if (c.id === activeChatId) {
          return {
            ...c,
            messages: [...c.messages, { role: 'assistant', content: '' }]
          };
        }
        return c;
      }));

      // Find chat again since state updated
      const currentChat = chats.find(c => c.id === activeChatId);
      const messageHistory = [...(currentChat?.messages || []), userMessage];

      await sendChatMessage(
        messageHistory,
        selectedModel,
        selectedKb,
        true, // use streaming
        (_, fullContent) => {
          // Update the streaming content
          setChats(prev => prev.map(c => {
            if (c.id === activeChatId) {
              const msgs = [...c.messages];
              msgs[msgs.length - 1].content = fullContent;
              return { ...c, messages: msgs };
            }
            return c;
          }));
        }
      );
    } catch (error) {
      console.error(error);
      setChats(prev => prev.map(c => {
        if (c.id === activeChatId) {
          const msgs = [...c.messages];
          msgs[msgs.length - 1].content = `**Error:** Failed to get response. ${error.message}`;
          return { ...c, messages: msgs };
        }
        return c;
      }));
    } finally {
      setIsGenerating(false);
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
          isGenerating={isGenerating}
          onSendMessage={handleSendMessage}
          kbs={kbs}
          selectedKb={selectedKb}
          onKbChange={setSelectedKb}
        />
      </main>
    </div>
  );
}

export default App;
