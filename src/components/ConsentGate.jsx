import { useState } from 'react';
import { useTranslation } from '../i18n.js';
import { LEGAL_DOC_TITLE_KEYS } from '../services/consentGate.js';
import LegalDocument from './LegalDocument.jsx';
import './ConsentGate.css';

const DOC_KINDS = ['personal_data_consent', 'privacy_policy', 'terms_of_use'];

// Blocking, non-dismissible consent panel shown before the user's first message
// (they may look around first — App only mounts this when a send is attempted
// without consent). Deliberately has no X / Esc / backdrop close: the only ways
// out are the two choices. Presentational — the parent owns the grant side
// effect (PATCH + resume) and the busy/error state; this owns only the reader.
export default function ConsentGate({ isOpen, onGrant, busy = false, error = null }) {
    const { t } = useTranslation();
    const [openDocKind, setOpenDocKind] = useState(null);

    if (!isOpen) return null;

    return (
        <div className="consent-gate-overlay">
            <div
                className="consent-gate-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="consent-gate-title"
            >
                <h2 id="consent-gate-title" className="consent-gate-title">{t('consentTitle')}</h2>
                <p className="consent-gate-body">{t('consentBody')}</p>

                <div className="consent-gate-docs">
                    <span className="consent-gate-docs-intro">{t('consentDocsIntro')}</span>
                    {DOC_KINDS.map((kind) => (
                        <button
                            key={kind}
                            type="button"
                            className="consent-gate-doc"
                            data-kind={kind}
                            onClick={() => setOpenDocKind(kind)}
                        >
                            {t(LEGAL_DOC_TITLE_KEYS[kind])}
                        </button>
                    ))}
                </div>

                {error && <p className="consent-gate-error" role="alert">{error}</p>}

                <div className="consent-gate-actions">
                    <button
                        type="button"
                        className="consent-gate-primary"
                        onClick={() => onGrant(true)}
                        disabled={busy}
                    >
                        {t('consentAllowImprovement')}
                    </button>
                    <button
                        type="button"
                        className="consent-gate-secondary"
                        onClick={() => onGrant(false)}
                        disabled={busy}
                    >
                        {t('consentServiceOnly')}
                    </button>
                </div>
            </div>

            {openDocKind && (
                <LegalDocument key={openDocKind} kind={openDocKind} onClose={() => setOpenDocKind(null)} />
            )}
        </div>
    );
}
