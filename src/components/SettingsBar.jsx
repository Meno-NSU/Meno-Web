import { useState, useRef, useEffect } from 'react';
import { Trophy, Moon, Sun, ChevronDown, ChevronRight, AlertCircle, Menu, MessageSquarePlus, LogIn, LogOut, UserRound, Lock, Swords, Check, Circle, Schedule, CloudOff } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import './SettingsBar.css';

function StatusIcon({ state }) {
    if (state === 'rate_limited') return <Schedule size={12} />;
    if (state === 'unreachable') return <CloudOff size={12} />;
    return <Circle size={9} />; // available
}

function formatUntil(untilIso) {
    if (!untilIso) return null;
    const until = new Date(untilIso);
    const diffMin = Math.round((until.getTime() - Date.now()) / 60000);
    if (diffMin <= 0) return 'soon';
    const hh = String(until.getHours()).padStart(2, '0');
    const mm = String(until.getMinutes()).padStart(2, '0');
    return `until ${hh}:${mm} (~${diffMin} min)`;
}

function ModelItem({ model, selected, onSelect, onRequireAuth }) {
    const { t } = useTranslation();
    const isAvailable = (model.status?.state ?? 'available') === 'available';
    // The backend marks OpenRouter models requires_auth for anonymous callers
    // and rejects chat requests against them — clicking one opens the auth
    // modal instead of selecting an unusable model.
    const requiresAuth = Boolean(model.requires_auth);
    const stateLabel = model.status?.state === 'rate_limited'
        ? `Rate-limited ${formatUntil(model.status.until)}`
        : model.status?.state === 'unreachable'
            ? `Unreachable ${formatUntil(model.status.until)}`
            : null;
    return (
        <button
            key={model.id}
            className={`model-dropdown-item ${selected ? 'active' : ''} ${!isAvailable ? 'disabled' : ''} ${requiresAuth ? 'locked' : ''}`}
            onClick={() => {
                if (!isAvailable) return;
                if (requiresAuth) {
                    onRequireAuth?.();
                    return;
                }
                onSelect(model.id);
            }}
            disabled={!isAvailable}
            type="button"
            title={requiresAuth ? t('modelRequiresAuth') : stateLabel || ''}
        >
            <span className="model-status-icon">
                {requiresAuth ? <Lock size={12} className="model-item-lock" /> : <StatusIcon state={model.status?.state} />}
            </span>
            <span className="model-item-name">{model.display_name || model.id}</span>
            {selected && <span className="model-item-check"><Check size={16} /></span>}
            {requiresAuth && <span className="model-item-state">{t('signIn')}</span>}
            {!requiresAuth && stateLabel && <span className="model-item-state">{stateLabel}</span>}
        </button>
    );
}

function ModelGroup({ title, subtitle, items, selectedModel, onSelect, onRequireAuth }) {
    if (items.length === 0) return null;
    return (
        <div className="model-dropdown-group">
            {title && (
                <div className="model-dropdown-group-header">
                    <span>{title}</span>
                    {subtitle && <span className="model-dropdown-group-sub">{subtitle}</span>}
                </div>
            )}
            {items.map(m => (
                <ModelItem key={m.id} model={m} selected={m.id === selectedModel} onSelect={onSelect} onRequireAuth={onRequireAuth} />
            ))}
        </div>
    );
}

function AllFreeModelsExpander({ items, selectedModel, onSelect, onRequireAuth }) {
    const [open, setOpen] = useState(false);
    if (items.length === 0) return null;
    return (
        <div className="model-dropdown-group">
            <button
                className="model-dropdown-group-expander"
                onClick={() => setOpen(!open)}
                type="button"
            >
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>All free models ({items.length})</span>
            </button>
            {open && items.map(m => (
                <ModelItem key={m.id} model={m} selected={m.id === selectedModel} onSelect={onSelect} onRequireAuth={onRequireAuth} />
            ))}
        </div>
    );
}

export default function SettingsBar({
    theme, toggleTheme, isSidebarOpen,
    models, selectedModel, onModelChange, onDropdownOpen,
    isArenaMode, setIsArenaMode,
    currentView, setCurrentView,
    coreModelId,
    onOpenSidebar,
    onNewChat,
    user,
    onOpenAuth,
    onLogout,
}) {
    const { t, lang, setLanguage } = useTranslation();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isAuthMenuOpen, setIsAuthMenuOpen] = useState(false);
    const dropdownRef = useRef(null);
    const authMenuRef = useRef(null);

    const handleLangToggle = () => {
        setLanguage(lang === 'ru' ? 'en' : 'ru');
    };

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsDropdownOpen(false);
            }
            if (authMenuRef.current && !authMenuRef.current.contains(e.target)) {
                setIsAuthMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectModel = (modelId) => {
        onModelChange(modelId);
        setIsDropdownOpen(false);
    };

    const handleModelRequiresAuth = () => {
        setIsDropdownOpen(false);
        onOpenAuth?.();
    };

    const handleLeaderboardClick = () => {
        setCurrentView(currentView === 'leaderboard' ? 'chat' : 'leaderboard');
    };

    const hasModels = models.length > 0;
    const currentModelMeta = hasModels ? models.find(m => m.id === selectedModel) : null;
    const currentModelName = hasModels
        ? (currentModelMeta?.display_name || currentModelMeta?.id || selectedModel || t('model'))
        : t('noModelsAvailable');
    const currentIsOr = currentModelMeta?.provider === 'openrouter';

    return (
        <header className="settings-bar">
            {/* Spacer to align content nicely when sidebar is collapsed */}
            <div className={`settings-spacer ${!isSidebarOpen ? 'spaced' : ''}`}></div>

            <button
                className="btn-icon sidebar-hamburger"
                onClick={onOpenSidebar}
                title={t('openSidebar')}
                aria-label={t('openSidebar')}
            >
                <Menu size={20} />
            </button>

            <div className="settings-controls">
                <div className="model-dropdown" ref={dropdownRef}>
                    <button
                        className={`model-dropdown-trigger ${!hasModels ? 'no-models' : ''}`}
                        onClick={() => {
                            const willOpen = !isDropdownOpen;
                            setIsDropdownOpen(willOpen);
                            if (willOpen && onDropdownOpen) onDropdownOpen();
                        }}
                        type="button"
                    >
                        {!hasModels && <AlertCircle size={16} className="no-models-icon" />}
                        <span className="model-dropdown-label">
                            {currentModelName}
                            {currentIsOr && coreModelId && (
                                <span className="model-dropdown-sublabel">gen only · {coreModelId} for retrieval</span>
                            )}
                        </span>
                        <ChevronDown size={16} className={`model-dropdown-chevron ${isDropdownOpen ? 'open' : ''}`} />
                    </button>

                    {isDropdownOpen && (
                        <div className="model-dropdown-menu">
                            {hasModels ? (
                                <>
                                    <div className="model-dropdown-hint">{t('modelDropdownHint')}</div>
                                    <ModelGroup
                                        items={models.filter(m => m.provider === 'vllm')}
                                        selectedModel={selectedModel}
                                        onSelect={handleSelectModel}
                                        onRequireAuth={handleModelRequiresAuth}
                                        coreModelId={coreModelId}
                                    />
                                    <ModelGroup
                                        title={t('modelGroupOther')}
                                        items={models.filter(m => m.provider === 'openrouter' && m.featured)}
                                        selectedModel={selectedModel}
                                        onSelect={handleSelectModel}
                                        onRequireAuth={handleModelRequiresAuth}
                                        coreModelId={coreModelId}
                                    />
                                    <AllFreeModelsExpander
                                        items={models.filter(m => m.provider === 'openrouter' && !m.featured)}
                                        selectedModel={selectedModel}
                                        onSelect={handleSelectModel}
                                        onRequireAuth={handleModelRequiresAuth}
                                    />
                                </>
                            ) : (
                                <div className="model-dropdown-item no-models-hint">
                                    {t('noModelsAvailable')}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <button
                className="btn-icon new-chat-btn-icon"
                onClick={onNewChat}
                title={t('newChat')}
                aria-label={t('newChat')}
            >
                <MessageSquarePlus size={20} />
            </button>

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
                    <button
                        className="btn-icon auth-signin-btn"
                        onClick={onOpenAuth}
                        title={t('signIn')}
                        aria-label={t('signIn')}
                    >
                        <LogIn size={20} />
                    </button>
                )}
                <button
                    className="btn-icon lang-toggle"
                    onClick={handleLangToggle}
                    title="Switch language"
                    style={{ fontWeight: "600", fontSize: "1rem" }}
                >
                    {lang.toUpperCase()}
                </button>
                <button
                    className={`btn-icon leaderboard-toggle ${currentView === 'leaderboard' ? 'active' : ''}`}
                    onClick={handleLeaderboardClick}
                    title={t('arenaLeaderboardTitle')}
                >
                    <Trophy size={20} />
                </button>
                <button
                    className={`btn-explicit arena-toggle ${isArenaMode ? 'active' : ''}`}
                    onClick={() => setIsArenaMode(!isArenaMode)}
                    title={`Arena Mode is ${isArenaMode ? 'ON' : 'OFF'}`}
                >
                    <span className="arena-icon"><Swords size={17} /></span>
                    <span className="arena-text">{isArenaMode ? t('battleArenaModeOn') : t('battleArenaModeOff')}</span>
                </button>
                <button
                    className="btn-icon theme-toggle"
                    onClick={toggleTheme}
                    title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                >
                    {theme === 'light' ? <Moon size={19} /> : <Sun size={16} />}
                </button>
            </div>
        </header>
    );
}
