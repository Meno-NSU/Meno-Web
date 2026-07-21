import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import { getLegalDocument } from '../services/api.js';
import { LEGAL_DOC_TITLE_KEYS } from '../services/consentGate.js';
import './LegalDocument.css';

// Reusable reader for a published legal document: fetches the markdown by `kind`
// and renders it in a dismissible overlay (X / Esc / backdrop close). Used by the
// consent gate now and by the routed /privacy·/consent·/terms pages later.
export default function LegalDocument({ kind, onClose }) {
    const { t } = useTranslation();
    const [state, setState] = useState({ status: 'loading', doc: null });

    // Fetch once per mount. Callers pass a `key` per kind so a different document
    // remounts fresh (back to the initial loading state) rather than resetting
    // state synchronously in the effect.
    useEffect(() => {
        let cancelled = false;
        getLegalDocument(kind)
            .then((doc) => { if (!cancelled) setState({ status: 'ready', doc }); })
            .catch(() => { if (!cancelled) setState({ status: 'error', doc: null }); });
        return () => { cancelled = true; };
    }, [kind]);

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
                    {state.status === 'loading' && (
                        <p className="legal-doc-loading">{t('legalLoading')}</p>
                    )}
                    {state.status === 'error' && (
                        <p className="legal-doc-error" role="alert">{t('legalLoadError')}</p>
                    )}
                    {state.status === 'ready' && state.doc && (
                        <>
                            <p className="legal-doc-meta">{t('legalVersionLabel')} {state.doc.version}</p>
                            <div className="legal-doc-markdown">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {state.doc.content}
                                </ReactMarkdown>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
