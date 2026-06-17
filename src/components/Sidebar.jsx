import {
    LogIn,
    LogOut,
    MessageSquare,
    MessageSquarePlus,
    PanelLeftClose,
    PanelLeft,
    Trash2,
    Trophy,
    Moon,
    Sun,
    Swords,
} from './icons.jsx';
import { useTranslation } from '../i18n.js';
import './Sidebar.css';

export default function Sidebar({
    isOpen, toggleSidebar,
    chats, activeChatId, onSelectChat, onNewChat, onDeleteChat, generatingChats,
    // Mobile-only: the top-right actions in SettingsBar move into the sidebar
    // overlay on ≤768px. Desktop never sees `.sidebar-actions` (hidden via CSS).
    currentView, setCurrentView,
    theme, toggleTheme,
    isArenaMode, setIsArenaMode,
    user, onOpenAuth, onLogout,
}) {
    const { t, lang, setLanguage } = useTranslation();
    if (!isOpen) {
        return (
            <button className="sidebar-toggle-btn collapsed" onClick={toggleSidebar} title="Open sidebar">
                <PanelLeft size={20} />
            </button>
        );
    }

    // On mobile, every action that changes the main view (or a global setting
    // the user wants to see take effect) auto-closes the sidebar overlay so
    // they can see what they just did. On desktop the sidebar is in-flow and
    // these handlers aren't reachable (the mobile rendering is hidden via CSS).
    const closeAfter = (fn) => () => {
        fn();
        toggleSidebar();
    };

    const handleLeaderboard = closeAfter(() => {
        setCurrentView?.(currentView === 'leaderboard' ? 'chat' : 'leaderboard');
    });
    const handleArena = closeAfter(() => setIsArenaMode?.(!isArenaMode));
    // Keep the click event: toggleTheme uses it as the origin of the
    // circular theme reveal, so the new theme spreads from the tap point.
    const handleTheme = (event) => {
        toggleTheme?.(event);
        toggleSidebar();
    };
    const handleLang = closeAfter(() => setLanguage(lang === 'ru' ? 'en' : 'ru'));

    return (
        <>
            <div className="sidebar-backdrop" onClick={toggleSidebar} aria-hidden="true" />
            <aside className="sidebar">
                {/* Header row: brand logo on the left, collapse button on the
                    right (ChatGPT/DeepSeek-style). */}
                <div className="sidebar-header">
                    <img className="sidebar-logo" src="/menon-logo.svg" alt="Менон" />
                    <button className="sidebar-toggle-btn" onClick={toggleSidebar} title={t("closeSidebar")}>
                        {/* 22px → the panel's ink height (~15.8px) matches the
                            МЕНОН wordmark's letter height beside it. */}
                        <PanelLeftClose size={22} />
                    </button>
                </div>

                {/* New-chat button sits below the logo. Desktop only — on
                    mobile this affordance lives in the topbar instead (see
                    SettingsBar.new-chat-btn-icon), so the drawer doesn't
                    duplicate it. */}
                <button
                    className="new-chat-btn sidebar-new-chat-btn"
                    onClick={onNewChat}
                >
                    <MessageSquarePlus size={20} />
                    <span>{t("newChat")}</span>
                </button>

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

                {/* Mobile-only action panel — hidden via CSS on desktop. */}
                <div className="sidebar-actions" role="group">
                    {user ? (
                        <button
                            className="sidebar-action-btn"
                            onClick={closeAfter(() => onLogout?.())}
                            title={user.email}
                        >
                            <LogOut size={20} className="sidebar-action-icon" />
                            <span className="sidebar-action-label">
                                {t('signOut')} · {user.nickname || user.email}
                            </span>
                        </button>
                    ) : (
                        <button
                            className="sidebar-action-btn"
                            onClick={closeAfter(() => onOpenAuth?.())}
                            title={t('signIn')}
                        >
                            <LogIn size={20} className="sidebar-action-icon" />
                            <span className="sidebar-action-label">{t('signIn')}</span>
                        </button>
                    )}
                    <button
                        className="sidebar-action-btn"
                        onClick={handleLang}
                        title="Switch language"
                    >
                        <span className="sidebar-action-icon" style={{ fontWeight: 600 }}>{lang.toUpperCase()}</span>
                        <span className="sidebar-action-label">{lang === 'ru' ? 'Язык' : 'Language'}</span>
                    </button>
                    <button
                        className={`sidebar-action-btn ${currentView === 'leaderboard' ? 'active' : ''}`}
                        onClick={handleLeaderboard}
                        title={t('arenaLeaderboardTitle')}
                    >
                        <Trophy size={20} className="sidebar-action-icon" />
                        <span className="sidebar-action-label">{t('arenaLeaderboardTitle') || 'Leaderboard'}</span>
                    </button>
                    <button
                        className={`sidebar-action-btn arena ${isArenaMode ? 'active' : ''}`}
                        onClick={handleArena}
                        title={`Arena Mode is ${isArenaMode ? 'ON' : 'OFF'}`}
                    >
                        <span className="sidebar-action-icon" aria-hidden="true"><Swords size={20} /></span>
                        <span className="sidebar-action-label">
                            {isArenaMode ? t('battleArenaModeOn') : t('battleArenaModeOff')}
                        </span>
                    </button>
                    <button
                        className="sidebar-action-btn"
                        onClick={handleTheme}
                        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                    >
                        {theme === 'light'
                            ? <Moon size={20} className="sidebar-action-icon" />
                            : <Sun size={20} className="sidebar-action-icon" />}
                        <span className="sidebar-action-label">
                            {theme === 'light'
                                ? (lang === 'ru' ? 'Тёмная тема' : 'Dark theme')
                                : (lang === 'ru' ? 'Светлая тема' : 'Light theme')}
                        </span>
                    </button>
                </div>
            </aside>
        </>
    );
}
