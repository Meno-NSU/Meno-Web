import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useTranslation } from '../i18n.js';
import { getLegalDocument } from '../services/api.js';
import './LegalDocumentView.css';

// Fetches a published legal document by kind and renders its markdown (with the
// version line). Shared by the modal reader (LegalDocument) and the routed
// LegalPage, so there is exactly one document-rendering implementation. Callers
// pass a `key` per kind so a different document remounts fresh rather than
// resetting state synchronously in the effect.
export default function LegalDocumentView({ kind }) {
    const { t } = useTranslation();
    const [state, setState] = useState({ status: 'loading', doc: null });

    useEffect(() => {
        let cancelled = false;
        getLegalDocument(kind)
            .then((doc) => { if (!cancelled) setState({ status: 'ready', doc }); })
            .catch(() => { if (!cancelled) setState({ status: 'error', doc: null }); });
        return () => { cancelled = true; };
    }, [kind]);

    if (state.status === 'loading') {
        return <p className="legal-doc-loading">{t('legalLoading')}</p>;
    }
    if (state.status === 'error') {
        return <p className="legal-doc-error" role="alert">{t('legalLoadError')}</p>;
    }
    // The document carries its own version/date footer at the bottom (styled muted by
    // LegalDocumentView.css). remark-breaks honours the single newlines the documents are
    // authored with, so consecutive metadata lines no longer collapse into one paragraph.
    return (
        <div className="legal-doc-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{state.doc.content}</ReactMarkdown>
        </div>
    );
}
