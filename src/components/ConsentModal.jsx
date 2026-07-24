import { useEffect } from 'react';
import { X } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import './ConsentModal.css';

// Consent gate. «Продолжить» grants the improvement/analysis opt-in
// (MENO_IMPROVEMENT) — the chat itself is always stored so the user can return to
// it. «Не сейчас» defers: nothing is granted and the gate re-asks later.
//
// First appearance is blocking (dismissible=false): the only exits are the two
// buttons. Later re-prompts pass dismissible=true so X / Esc / backdrop quietly
// defer again — gentler than nagging with a hard wall every time.
export default function ConsentModal({ onContinue, onDefer, dismissible = false }) {
    const { t } = useTranslation();

    useEffect(() => {
        if (!dismissible) return undefined;
        const onKeyDown = (e) => { if (e.key === 'Escape') onDefer(); };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [dismissible, onDefer]);

    return (
        <div
            className="consent-modal-overlay"
            onMouseDown={dismissible ? (e) => { if (e.target === e.currentTarget) onDefer(); } : undefined}
        >
            <div
                className="consent-modal-card"
                role="dialog"
                aria-modal="true"
                aria-label={t('consentModalTitle')}
            >
                {dismissible && (
                    <button
                        type="button"
                        className="btn-icon consent-modal-close"
                        onClick={onDefer}
                        title={t('authClose')}
                        aria-label={t('authClose')}
                    >
                        <X size={18} />
                    </button>
                )}
                <h2 className="consent-modal-title">{t('consentModalTitle')}</h2>
                <p className="consent-modal-grant">
                    {t('consentModalGrantPrefix')}
                    <a href="/consent" target="_blank" rel="noopener noreferrer">
                        {t('consentModalConsentLink')}
                    </a>
                    {t('consentModalGrantSuffix')}
                </p>
                <p className="consent-modal-docs">
                    <a href="/privacy" target="_blank" rel="noopener noreferrer">
                        {t('consentModalPolicyLink')}
                    </a>
                </p>
                <div className="consent-modal-actions">
                    <button
                        type="button"
                        className="consent-modal-defer"
                        onClick={onDefer}
                    >
                        {t('consentModalDefer')}
                    </button>
                    <button
                        type="button"
                        className="consent-modal-continue"
                        onClick={onContinue}
                    >
                        {t('consentModalContinue')}
                    </button>
                </div>
            </div>
        </div>
    );
}
