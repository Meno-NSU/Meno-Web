import { useState, useRef, useEffect } from 'react';
import { Trophy, Moon, Sun, Menu, MessageSquarePlus, LogIn, LogOut, UserRound, Swords } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import Tooltip from './Tooltip.jsx';
import VersionPicker from './VersionPicker.jsx';
import './SettingsBar.css';

export default function SettingsBar({
    theme, toggleTheme, isSidebarOpen,
    models, selectedModel, onModelChange, onDropdownOpen,
    isArenaMode, setIsArenaMode,
    currentView, setCurrentView,
    onOpenSidebar,
    onNewChat,
    user,
    onOpenAuth,
    onLogout,
}) {
    const { t, lang, setLanguage } = useTranslation();
    const [isAuthMenuOpen, setIsAuthMenuOpen] = useState(false);
    const authMenuRef = useRef(null);

    const handleLangToggle = () => {
        setLanguage(lang === 'ru' ? 'en' : 'ru');
    };

    // Close the account menu on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (authMenuRef.current && !authMenuRef.current.contains(e.target)) {
                setIsAuthMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLeaderboardClick = () => {
        setCurrentView(currentView === 'leaderboard' ? 'chat' : 'leaderboard');
    };

    return (
        <header className="settings-bar">
            {/* Spacer to align content nicely when sidebar is collapsed */}
            <div className={`settings-spacer ${!isSidebarOpen ? 'spaced' : ''}`}></div>

            <Tooltip text={t('tipSidebar')} align="left">
                <button
                    className="btn-icon sidebar-hamburger"
                    onClick={onOpenSidebar}
                    aria-label={t('openSidebar')}
                >
                    <Menu size={20} />
                </button>
            </Tooltip>

            <div className="settings-controls">
                <VersionPicker
                    models={models}
                    selectedModel={selectedModel}
                    onSelect={onModelChange}
                    onRequireAuth={onOpenAuth}
                    onOpen={onDropdownOpen}
                />
            </div>

            <Tooltip text={t('tipNewChat')}>
                <button
                    className="btn-icon new-chat-btn-icon"
                    onClick={onNewChat}
                    aria-label={t('newChat')}
                >
                    <MessageSquarePlus size={20} />
                </button>
            </Tooltip>

            <div className="settings-actions">
                {user ? (
                    <div className="auth-menu" ref={authMenuRef}>
                        <button
                            className="auth-chip"
                            onClick={() => setIsAuthMenuOpen(!isAuthMenuOpen)}
                            title={user.email}
                            type="button"
                        >
                            <UserRound size={18} />
                            <span className="auth-chip-name">{user.nickname || user.email}</span>
                        </button>
                        {isAuthMenuOpen && (
                            <div className="auth-menu-dropdown">
                                <div className="auth-menu-signed">
                                    {t('authSignedInAs')}
                                    <strong>{user.nickname || user.email}</strong>
                                </div>
                                <button
                                    className="auth-menu-item"
                                    onClick={() => {
                                        setIsAuthMenuOpen(false);
                                        onLogout();
                                    }}
                                    type="button"
                                >
                                    <LogOut size={16} />
                                    {t('signOut')}
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <Tooltip text={t('tipSignIn')} align="right">
                        <button
                            className="btn-icon auth-signin-btn"
                            onClick={onOpenAuth}
                            aria-label={t('signIn')}
                        >
                            <LogIn size={20} />
                        </button>
                    </Tooltip>
                )}
                <Tooltip text={t('tipLanguage')} align="right">
                    <button
                        className="btn-icon lang-toggle"
                        onClick={handleLangToggle}
                        aria-label={t('langToggleAria')}
                        style={{ fontWeight: "600", fontSize: "1rem" }}
                    >
                        {lang.toUpperCase()}
                    </button>
                </Tooltip>
                <Tooltip text={t('tipLeaderboard')} align="right">
                    <button
                        className={`btn-icon leaderboard-toggle ${currentView === 'leaderboard' ? 'active' : ''}`}
                        onClick={handleLeaderboardClick}
                        aria-label={t('arenaLeaderboardTitle')}
                    >
                        <Trophy size={20} />
                    </button>
                </Tooltip>
                <Tooltip text={t('tipArena')} align="right">
                    <button
                        className={`btn-explicit arena-toggle ${isArenaMode ? 'active' : ''}`}
                        onClick={() => setIsArenaMode(!isArenaMode)}
                        aria-label={isArenaMode ? t('battleArenaModeOn') : t('battleArenaModeOff')}
                    >
                        <span className="arena-icon"><Swords size={17} /></span>
                        <span className="arena-text">{isArenaMode ? t('battleArenaModeOn') : t('battleArenaModeOff')}</span>
                    </button>
                </Tooltip>
                <Tooltip text={t('tipTheme')} align="right">
                    <button
                        className="btn-icon theme-toggle"
                        onClick={toggleTheme}
                        aria-label={t('themeToggleAria')}
                    >
                        {theme === 'light' ? <Moon size={19} /> : <Sun size={16} />}
                    </button>
                </Tooltip>
            </div>
        </header>
    );
}
