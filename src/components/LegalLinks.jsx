import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n.js';
import './LegalLinks.css';

// Compact legal links for the sidebar footer. Separators are drawn in CSS.
export default function LegalLinks() {
    const { t } = useTranslation();
    return (
        <nav className="legal-links" aria-label={t('legalLinksLabel')}>
            <Link className="legal-links-link" to="/privacy">{t('legalLinkPrivacy')}</Link>
            <Link className="legal-links-link" to="/terms">{t('legalLinkTerms')}</Link>
            <Link className="legal-links-link" to="/consent">{t('legalLinkConsent')}</Link>
        </nav>
    );
}
