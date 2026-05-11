import { useState, useRef, useEffect } from 'react';
import { Trophy, Moon, Sun, ChevronDown, AlertCircle } from 'lucide-react';
import { useTranslation } from '../i18n.js';
import './SettingsBar.css';

function statusIcon(state) {
    if (state === 'rate_limited') return '◐';
    if (state === 'unreachable') return '○';
    return '●';
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

function ModelItem({ model, selected, onSelect }) {
    const isAvailable = (model.status?.state ?? 'available') === 'available';
    const stateLabel = model.status?.state === 'rate_limited'
        ? `Rate-limited ${formatUntil(model.status.until)}`
        : model.status?.state === 'unreachable'
            ? `Unreachable ${formatUntil(model.status.until)}`
            : null;
    return (
        <button
            key={model.id}
            className={`model-dropdown-item ${selected ? 'active' : ''} ${!isAvailable ? 'disabled' : ''}`}
            onClick={() => isAvailable && onSelect(model.id)}
            disabled={!isAvailable}
            type="button"
            title={stateLabel || ''}
        >
            <span className="model-status-icon">{statusIcon(model.status?.state)}</span>
            <span className="model-item-name">{model.display_name || model.id}</span>
            {selected && <span className="model-item-check">✓</span>}
            {stateLabel && <span className="model-item-state">{stateLabel}</span>}
        </button>
    );
}

function ModelGroup({ title, subtitle, items, selectedModel, onSelect }) {
    if (items.length === 0) return null;
    return (
        <div className="model-dropdown-group">
            <div className="model-dropdown-group-header">
                <span>{title}</span>
                {subtitle && <span className="model-dropdown-group-sub">{subtitle}</span>}
            </div>
            {items.map(m => (
                <ModelItem key={m.id} model={m} selected={m.id === selectedModel} onSelect={onSelect} />
            ))}
        </div>
    );
}

function AllFreeModelsExpander({ items, selectedModel, onSelect }) {
    const [open, setOpen] = useState(false);
    if (items.length === 0) return null;
    return (
        <div className="model-dropdown-group">
            <button
                className="model-dropdown-group-expander"
                onClick={() => setOpen(!open)}
                type="button"
            >
                {open ? '▾' : '▸'} All free models ({items.length})
            </button>
            {open && items.map(m => (
                <ModelItem key={m.id} model={m} selected={m.id === selectedModel} onSelect={onSelect} />
            ))}
        </div>
    );
}

export default function SettingsBar({ theme, toggleTheme, isSidebarOpen, models, selectedModel, onModelChange, onDropdownOpen, isArenaMode, setIsArenaMode, setCurrentView, coreModelId }) {
    const { t, lang, setLanguage } = useTranslation();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const handleLangToggle = () => {
        setLanguage(lang === 'ru' ? 'en' : 'ru');
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectModel = (modelId) => {
        onModelChange(modelId);
        setIsDropdownOpen(false);
    };

    const handleLeaderboardClick = () => {
        setCurrentView('leaderboard');
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
                                    <ModelGroup
                                        title="vLLM — all stages"
                                        items={models.filter(m => m.provider === 'vllm')}
                                        selectedModel={selectedModel}
                                        onSelect={handleSelectModel}
                                        coreModelId={coreModelId}
                                    />
                                    <ModelGroup
                                        title="OpenRouter — generation only"
                                        subtitle={coreModelId ? `rewrite/rerank: ${coreModelId}` : null}
                                        items={models.filter(m => m.provider === 'openrouter' && m.featured)}
                                        selectedModel={selectedModel}
                                        onSelect={handleSelectModel}
                                        coreModelId={coreModelId}
                                    />
                                    <AllFreeModelsExpander
                                        items={models.filter(m => m.provider === 'openrouter' && !m.featured)}
                                        selectedModel={selectedModel}
                                        onSelect={handleSelectModel}
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

            <div className="settings-actions">
                <button
                    className="btn-icon lang-toggle"
                    onClick={handleLangToggle}
                    title="Switch language"
                    style={{ fontWeight: "600", fontSize: "1rem" }}
                >
                    {lang.toUpperCase()}
                </button>
                <button
                    className="btn-icon leaderboard-toggle"
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
                    <span className="arena-icon">⚔️</span>
                    <span className="arena-text">{isArenaMode ? t('battleArenaModeOn') : t('battleArenaModeOff')}</span>
                </button>
                <button
                    className="btn-icon theme-toggle"
                    onClick={toggleTheme}
                    title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                >
                    {theme === 'light' ? <Moon size={22} /> : <Sun size={22} />}
                </button>
            </div>
        </header>
    );
}
