import { useEffect } from 'react';
import { X, Swords } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import './ArenaIntroModal.css';

// One-time explainer shown the first time the user enables Arena mode (see
// services/arenaIntro.js for the seen-flag). Purely informational: every exit
// (Ok, X, Esc, backdrop) just closes it — the mode itself is already on.
export default function ArenaIntroModal({ onClose }) {
    const { t } = useTranslation();

    useEffect(() => {
        const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    return (
        <div
            className="arena-intro-overlay"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="arena-intro-card"
                role="dialog"
                aria-modal="true"
                aria-label={t('arenaIntroTitle')}
            >
                <button
                    type="button"
                    className="btn-icon arena-intro-close"
                    onClick={onClose}
                    aria-label={t('authClose')}
                >
                    <X size={18} />
                </button>
                <div className="arena-intro-icon" aria-hidden="true">
                    <Swords size={28} />
                </div>
                <h2 className="arena-intro-title">{t('arenaIntroTitle')}</h2>
                <p className="arena-intro-body">{t('arenaIntroBody')}</p>
                <button
                    type="button"
                    className="arena-intro-ok"
                    onClick={onClose}
                >
                    {t('arenaIntroOk')}
                </button>
            </div>
        </div>
    );
}
