import { useEffect } from 'react';
import { X } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import { LEGAL_DOC_TITLE_KEYS } from '../services/consentGate.js';
import LegalDocumentView from './LegalDocumentView.jsx';
import './LegalDocument.css';

// Modal reader for a legal document: a dismissible overlay (X / Esc / backdrop)
// wrapping the shared LegalDocumentView. Used by the consent gate; the routed
// LegalPage embeds the same view without this chrome.
export default function LegalDocument({ kind, onClose }) {
    const { t } = useTranslation();

    useEffect(() => {
        const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const titleKey = LEGAL_DOC_TITLE_KEYS[kind];
    const title = titleKey ? t(titleKey) : '';

    return (
        <div
            className="legal-doc-overlay"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="legal-doc-card" role="dialog" aria-modal="true" aria-label={title}>
                <div className="legal-doc-header">
                    <h2 className="legal-doc-title">{title}</h2>
                    <button
                        className="btn-icon legal-doc-close"
                        onClick={onClose}
                        title={t('legalClose')}
                        aria-label={t('legalClose')}
                        type="button"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="legal-doc-body">
                    <LegalDocumentView key={kind} kind={kind} />
                </div>
            </div>
        </div>
    );
}
