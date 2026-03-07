import { Moon, Sun } from 'lucide-react';
import { useTranslation } from '../i18n.js';
import './SettingsBar.css';

export default function SettingsBar({ theme, toggleTheme, isSidebarOpen, models, selectedModel, onModelChange }) {
    const { t, lang, setLanguage } = useTranslation();

    const handleLangToggle = () => {
        setLanguage(lang === 'ru' ? 'en' : 'ru');
    };

    return (
        <header className="settings-bar">
            {/* Spacer to align content nicely when sidebar is collapsed */}
            <div className={`settings-spacer ${!isSidebarOpen ? 'spaced' : ''}`}></div>

            <div className="settings-controls">
                <div className="control-group">
                    <label htmlFor="model-select" className="control-label">{t('model')}</label>
                    <div className="select-wrapper">
                        <select
                            id="model-select"
                            className="select-input"
                            value={selectedModel}
                            onChange={(e) => onModelChange(e.target.value)}
                        >
                            {models.map(m => (
                                <option key={m.id} value={m.id}>{m.id}</option>
                            ))}
                        </select>
                        <div className="select-arrow"></div>
                    </div>
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
