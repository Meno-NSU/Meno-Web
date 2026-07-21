import { X } from './icons.jsx';
import { useTranslation } from '../i18n.js';
import './ConsentBanner.css';

// Non-blocking improvement opt-in. Sits in the bottom corner (full-width bar on
// mobile) and never blocks the chat. The parent (App) controls when it renders.
// The two buttons record a consent choice; the X defers it (safe default OFF).
export default function ConsentBanner({ onDecide, onDismiss }) {
    const { t } = useTranslation();
    return (
        <section className="consent-banner" role="region" aria-label={t('consentBannerTitle')}>
            <button
                type="button"
                className="btn-icon consent-banner-close"
                onClick={onDismiss}
                title={t('consentBannerDismiss')}
                aria-label={t('consentBannerDismiss')}
            >
                <X size={16} />
            </button>
            <p className="consent-banner-text">
                {t('consentBannerText')}{' '}
                <a className="consent-banner-link" href="/privacy" target="_blank" rel="noopener noreferrer">
                    {t('consentBannerMore')}
                </a>
            </p>
            <div className="consent-banner-actions">
                <button type="button" className="consent-banner-allow" onClick={() => onDecide(true)}>
                    {t('consentBannerAllow')}
                </button>
                <button type="button" className="consent-banner-decline" onClick={() => onDecide(false)}>
                    {t('consentBannerDecline')}
                </button>
            </div>
        </section>
    );
}
