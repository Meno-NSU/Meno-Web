import { useState, useRef, useEffect } from 'react';
import { Trophy, Moon, Sun, ChevronDown, AlertCircle } from 'lucide-react';
import { useTranslation } from '../i18n.js';
import './SettingsBar.css';

export default function SettingsBar({ theme, toggleTheme, isSidebarOpen, models, selectedModel, onModelChange, isArenaMode, setIsArenaMode, setCurrentView }) {
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
    const currentModelName = hasModels
        ? (models.find(m => m.id === selectedModel)?.id || selectedModel)
        : t('noModelsAvailable');

    return (
        <header className="settings-bar">
            {/* Spacer to align content nicely when sidebar is collapsed */}
            <div className={`settings-spacer ${!isSidebarOpen ? 'spaced' : ''}`}></div>

            <div className="settings-controls">
                <div className="model-dropdown" ref={dropdownRef}>
                    <button
                        className={`model-dropdown-trigger ${!hasModels ? 'no-models' : ''}`}
                        onClick={() => hasModels && setIsDropdownOpen(prev => !prev)}
                        type="button"
                    >
                        {!hasModels && <AlertCircle size={16} className="no-models-icon" />}
                        <span className="model-dropdown-label">{currentModelName}</span>
                        {hasModels && <ChevronDown size={16} className={`model-dropdown-chevron ${isDropdownOpen ? 'open' : ''}`} />}
                    </button>

                    {isDropdownOpen && hasModels && (
                        <div className="model-dropdown-menu">
                            {models.map(m => (
                                <button
                                    key={m.id}
                                    className={`model-dropdown-item ${m.id === selectedModel ? 'active' : ''}`}
                                    onClick={() => handleSelectModel(m.id)}
                                    type="button"
                                >
                                    <span className="model-item-name">{m.id}</span>
                                    {m.id === selectedModel && <span className="model-item-check">✓</span>}
                                </button>
                            ))}
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
