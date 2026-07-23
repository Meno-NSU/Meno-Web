import { useEffect, useState } from 'react';
import { X, ArrowCircleLeft, ChevronRight, ExternalLink } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import './SettingsModal.css';

const DOC_LINKS = [
    { href: '/privacy', key: 'consentReadPrivacy' },
    { href: '/terms', key: 'consentReadTerms' },
    { href: '/consent', key: 'consentReadConsent' },
];

// «Настройки» — a single modal with two views:
//   menu → an «О сервисе» section: the data-privacy controls entry + the three
//          published documents (documents open in a new tab).
//   data → the data-privacy controls (improvement opt-in, clear local history,
//          erase server data), reached from the menu, with a «← Назад» back button.
// Presentational: App owns the async (fetch settings, PATCH, clear, delete).
export default function SettingsModal({
    isOpen,
    onClose,
    improvementEnabled,
    onToggleImprovement,
    isAuthenticated = false,
    onClearHistory,
    onDeleteServerHistory,
    onDeleteData,
}) {
    const { t } = useTranslation();
    const [view, setView] = useState('menu');
    const [confirmingClear, setConfirmingClear] = useState(false);
    const [confirmingServerHistory, setConfirmingServerHistory] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    // Every (re)open starts on the menu with no confirmations pending. Adjusting
    // state during render on a prop change is the React-recommended pattern — no
    // set-state-in-effect round-trip.
    const [wasOpen, setWasOpen] = useState(isOpen);
    if (isOpen !== wasOpen) {
        setWasOpen(isOpen);
        if (isOpen) {
            setView('menu');
            setConfirmingClear(false);
            setConfirmingServerHistory(false);
            setConfirmingDelete(false);
        }
    }

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const onData = view === 'data';

    return (
        <div
            className="settings-overlay"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="settings-card"
                role="dialog"
                aria-modal="true"
                aria-label={t('settingsTitle')}
            >
                <div className="settings-header">
                    {onData ? (
                        <button
                            type="button"
                            className="btn-icon settings-back"
                            onClick={() => setView('menu')}
                            title={t('settingsBack')}
                            aria-label={t('settingsBack')}
                        >
                            <ArrowCircleLeft size={20} />
                        </button>
                    ) : (
                        <span className="settings-header-spacer" aria-hidden="true" />
                    )}
                    <h2 className="settings-title">{onData ? t('privacySettingsEntry') : t('settingsTitle')}</h2>
                    <button
                        type="button"
                        className="btn-icon settings-close"
                        onClick={onClose}
                        title={t('authClose')}
                        aria-label={t('authClose')}
                    >
                        <X size={20} />
                    </button>
                </div>

                {onData ? (
                    <div className="settings-body">
                        <label className="settings-row">
                            <span className="settings-row-text">
                                <span className="settings-row-label">{t('privacyImprovementLabel')}</span>
                                <span className="settings-row-hint">{t('privacyImprovementHint')}</span>
                            </span>
                            <input
                                type="checkbox"
                                className="settings-improvement-toggle"
                                checked={!!improvementEnabled}
                                onChange={() => onToggleImprovement(!improvementEnabled)}
                            />
                        </label>

                        {/* Clears only `chats`, the localStorage-backed guest list — never
                            the signed-in account's server history. While signed in that
                            list is hidden (not deleted; see chatsForIdentity) and the
                            sidebar renders serverChats instead, so this control would
                            silently wipe it while APPEARING to do nothing. Offered only
                            as a guest, where the effect is exactly what's on screen. */}
                        {!isAuthenticated && (
                            <div className="settings-row">
                                <span className="settings-row-text">
                                    <span className="settings-row-label">{t('privacyClearLabel')}</span>
                                    <span className="settings-row-hint">{t('privacyClearHint')}</span>
                                </span>
                                {confirmingClear ? (
                                    <span className="settings-confirm-group">
                                        <button
                                            type="button"
                                            className="settings-clear-confirm"
                                            onClick={() => { setConfirmingClear(false); onClearHistory(); }}
                                        >
                                            {t('privacyClearConfirm')}
                                        </button>
                                        <button
                                            type="button"
                                            className="settings-clear-cancel"
                                            onClick={() => setConfirmingClear(false)}
                                        >
                                            {t('privacyCancel')}
                                        </button>
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        className="settings-clear"
                                        onClick={() => setConfirmingClear(true)}
                                    >
                                        {t('privacyClearButton')}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Erasing the server-side history without giving up the account —
                            the middle step between clearing this browser and deleting
                            everything, which the legal package requires as its own action. */}
                        <div className="settings-row">
                            <span className="settings-row-text">
                                <span className="settings-row-label">{t('privacyServerHistoryLabel')}</span>
                                <span className="settings-row-hint">{t('privacyServerHistoryHint')}</span>
                            </span>
                            {confirmingServerHistory ? (
                                <span className="settings-confirm-group">
                                    <button
                                        type="button"
                                        className="settings-history-confirm"
                                        onClick={() => { setConfirmingServerHistory(false); onDeleteServerHistory(); }}
                                    >
                                        {t('privacyServerHistoryConfirm')}
                                    </button>
                                    <button
                                        type="button"
                                        className="settings-history-cancel"
                                        onClick={() => setConfirmingServerHistory(false)}
                                    >
                                        {t('privacyCancel')}
                                    </button>
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    className="settings-history"
                                    onClick={() => setConfirmingServerHistory(true)}
                                >
                                    {t('privacyServerHistoryButton')}
                                </button>
                            )}
                        </div>

                        <div className="settings-row">
                            <span className="settings-row-text">
                                <span className="settings-row-label">{t('privacyDeleteLabel')}</span>
                                <span className="settings-row-hint">{t('privacyDeleteHint')}</span>
                            </span>
                            {confirmingDelete ? (
                                <span className="settings-confirm-group">
                                    <button
                                        type="button"
                                        className="settings-delete-confirm"
                                        onClick={() => { setConfirmingDelete(false); onDeleteData(); }}
                                    >
                                        {t('privacyDeleteConfirm')}
                                    </button>
                                    <button
                                        type="button"
                                        className="settings-delete-cancel"
                                        onClick={() => setConfirmingDelete(false)}
                                    >
                                        {t('privacyCancel')}
                                    </button>
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    className="settings-delete"
                                    onClick={() => setConfirmingDelete(true)}
                                >
                                    {t('privacyDeleteButton')}
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="settings-body">
                        <div className="settings-section-label">{t('settingsAboutSection')}</div>
                        <button
                            type="button"
                            className="settings-row-nav settings-data-row"
                            onClick={() => setView('data')}
                        >
                            <span className="settings-row-label">{t('privacySettingsEntry')}</span>
                            <ChevronRight size={18} />
                        </button>
                        {DOC_LINKS.map((l) => (
                            <a
                                key={l.href}
                                className="settings-row-nav settings-doc-link"
                                href={l.href}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <span className="settings-row-label">{t(l.key)}</span>
                                <ExternalLink size={16} />
                            </a>
                        ))}
                        {/* Stands in for a cookie banner: the service sets no cookies at all,
                            so what needs disclosing is the browser's local storage. */}
                        <p className="settings-storage-note">{t('settingsStorageNote')}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
