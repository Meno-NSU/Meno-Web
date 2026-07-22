import { useEffect, useState } from 'react';
import { X } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import './PrivacySettingsModal.css';

const DOC_LINKS = [
    { href: '/privacy', key: 'consentReadPrivacy' },
    { href: '/terms', key: 'consentReadTerms' },
    { href: '/consent', key: 'consentReadConsent' },
];

// «Данные и конфиденциальность». Presentational — App owns the async (fetch
// settings, PATCH, clear chats). Dismissible modal (X / Esc / backdrop). Server-side
// account/data deletion is Stage-4 and not here yet.
export default function PrivacySettingsModal({
    isOpen,
    onClose,
    improvementEnabled,
    onToggleImprovement,
    onClearHistory,
    onDeleteData,
}) {
    const { t } = useTranslation();
    const [confirmingClear, setConfirmingClear] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="privacy-settings-overlay"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="privacy-settings-card"
                role="dialog"
                aria-modal="true"
                aria-label={t('privacySettingsTitle')}
            >
                <div className="privacy-settings-header">
                    <h2 className="privacy-settings-title">{t('privacySettingsTitle')}</h2>
                    <button
                        className="btn-icon privacy-settings-close"
                        onClick={onClose}
                        title={t('authClose')}
                        aria-label={t('authClose')}
                        type="button"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="privacy-settings-body">
                    <label className="privacy-settings-row">
                        <span className="privacy-settings-row-text">
                            <span className="privacy-settings-row-label">{t('privacyImprovementLabel')}</span>
                            <span className="privacy-settings-row-hint">{t('privacyImprovementHint')}</span>
                        </span>
                        <input
                            type="checkbox"
                            className="privacy-settings-improvement-toggle"
                            checked={!!improvementEnabled}
                            onChange={() => onToggleImprovement(!improvementEnabled)}
                        />
                    </label>

                    <div className="privacy-settings-row">
                        <span className="privacy-settings-row-text">
                            <span className="privacy-settings-row-label">{t('privacyClearLabel')}</span>
                            <span className="privacy-settings-row-hint">{t('privacyClearHint')}</span>
                        </span>
                        {confirmingClear ? (
                            <span className="privacy-settings-clear-confirm-group">
                                <button
                                    type="button"
                                    className="privacy-settings-clear-confirm"
                                    onClick={() => { setConfirmingClear(false); onClearHistory(); }}
                                >
                                    {t('privacyClearConfirm')}
                                </button>
                                <button
                                    type="button"
                                    className="privacy-settings-clear-cancel"
                                    onClick={() => setConfirmingClear(false)}
                                >
                                    {t('privacyCancel')}
                                </button>
                            </span>
                        ) : (
                            <button
                                type="button"
                                className="privacy-settings-clear"
                                onClick={() => setConfirmingClear(true)}
                            >
                                {t('privacyClearButton')}
                            </button>
                        )}
                    </div>

                    <div className="privacy-settings-row">
                        <span className="privacy-settings-row-text">
                            <span className="privacy-settings-row-label">{t('privacyDeleteLabel')}</span>
                            <span className="privacy-settings-row-hint">{t('privacyDeleteHint')}</span>
                        </span>
                        {confirmingDelete ? (
                            <span className="privacy-settings-clear-confirm-group">
                                <button
                                    type="button"
                                    className="privacy-settings-delete-confirm"
                                    onClick={() => {
                                        setConfirmingDelete(false);
                                        onDeleteData();
                                    }}
                                >
                                    {t('privacyDeleteConfirm')}
                                </button>
                                <button
                                    type="button"
                                    className="privacy-settings-delete-cancel"
                                    onClick={() => setConfirmingDelete(false)}
                                >
                                    {t('privacyCancel')}
                                </button>
                            </span>
                        ) : (
                            <button
                                type="button"
                                className="privacy-settings-delete"
                                onClick={() => setConfirmingDelete(true)}
                            >
                                {t('privacyDeleteButton')}
                            </button>
                        )}
                    </div>
                </div>

                <div className="privacy-settings-docs">
                    {DOC_LINKS.map((l) => (
                        <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
                            {t(l.key)}
                        </a>
                    ))}
                </div>
            </div>
        </div>
    );
}
