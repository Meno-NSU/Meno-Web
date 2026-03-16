import { Plus, MessageSquare, PanelLeftClose, PanelLeft, MoreHorizontal, Trash2, Trophy } from 'lucide-react';
import { useTranslation } from '../i18n.js';
import './Sidebar.css';

export default function Sidebar({ isOpen, toggleSidebar, chats, activeChatId, onSelectChat, onNewChat, onDeleteChat, generatingChats, currentView, setCurrentView }) {
    const { t } = useTranslation();
    if (!isOpen) {
        return (
            <button className="sidebar-toggle-btn collapsed" onClick={toggleSidebar} title="Open sidebar">
                <PanelLeft size={20} />
            </button>
        );
    }

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <button className="sidebar-toggle-btn" onClick={toggleSidebar} title={t("closeSidebar")}>
                    <PanelLeftClose size={20} />
                </button>
                <div style={{display: 'flex', gap: '0.5rem', flex: 1}}>
                    <button className="new-chat-btn" onClick={() => { setCurrentView('chat'); onNewChat(); }} style={{ flex: 1 }}>
                        <Plus size={20} />
                        <span>{t("newChat")}</span>
                    </button>
                </div>
            </div>

            <div className="sidebar-content">
                <div className="sidebar-section-title">{t("recentChats")}</div>
                {chats && chats.length > 0 ? (
                    <ul className="chat-list">
                        {chats.map(chat => (
                            <li
                                key={chat.id}
                                className={`chat-list-item ${activeChatId === chat.id ? 'active' : ''} ${(generatingChats && generatingChats.has(chat.id)) ? 'generating' : ''}`}
                                onClick={() => onSelectChat(chat.id)}
                            >
                                <MessageSquare size={18} className="chat-icon" />
                                <span className="chat-title">{chat.title || t("newChat")}</span>

                                <button
                                    className="delete-chat-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteChat(chat.id);
                                    }}
                                    title={t("deleteChat")}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="no-chats-msg">{t("noRecentChats")}</div>
                )}
            </div>
        </aside>
    );
}
