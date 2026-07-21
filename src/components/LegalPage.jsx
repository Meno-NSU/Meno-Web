import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Moon, Sun } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import { LEGAL_DOC_TITLE_KEYS } from '../services/consentGate.js';
import LegalDocumentView from './LegalDocumentView.jsx';
import './LegalPage.css';

// Standalone routed page for a legal document (/privacy·/consent·/terms). Public —
// no guest/model bootstrapping, just the shared document view with page chrome.
// App's theme effect doesn't run on these routes, so this applies the persisted
// theme itself (and offers a simple toggle).
export default function LegalPage({ kind }) {
    const { t } = useTranslation();
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const titleKey = LEGAL_DOC_TITLE_KEYS[kind];
    const title = titleKey ? t(titleKey) : '';

    return (
        <div className="legal-page">
            <header className="legal-page-header">
                <Link className="legal-page-home" to="/" aria-label="Менон">
                    <img src="/menon-logo.svg" alt="Менон" className="legal-page-logo" />
                </Link>
                <div className="legal-page-header-actions">
                    <Link className="legal-page-back" to="/">{t('legalBackToApp')}</Link>
                    <button
                        type="button"
                        className="btn-icon legal-page-theme"
                        onClick={() => setTheme((v) => (v === 'light' ? 'dark' : 'light'))}
                        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                    >
                        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                    </button>
                </div>
            </header>
            <main className="legal-page-main">
                <article className="legal-page-article">
                    <h1 className="legal-page-title">{title}</h1>
                    <LegalDocumentView key={kind} kind={kind} />
                </article>
            </main>
        </div>
    );
}
