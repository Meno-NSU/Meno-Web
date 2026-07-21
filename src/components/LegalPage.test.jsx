import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./LegalDocumentView.jsx', () => ({
    default: ({ kind }) => <div data-testid="legal-doc-view" data-kind={kind}>doc</div>,
}));

import LegalPage from './LegalPage.jsx';
import { translateOnce as tr } from '../i18n.js';

function renderPage(kind) {
    return render(
        <MemoryRouter>
            <LegalPage kind={kind} />
        </MemoryRouter>,
    );
}

describe('LegalPage', () => {
    it('renders the localized document title as the page heading', () => {
        renderPage('personal_data_consent');
        expect(screen.getByRole('heading', { name: tr('consentReadConsent') })).toBeTruthy();
    });

    it('embeds the shared document view for the kind', () => {
        renderPage('privacy_policy');
        expect(screen.getByTestId('legal-doc-view').getAttribute('data-kind')).toBe('privacy_policy');
    });

    it('links back to the app home', () => {
        const { container } = renderPage('terms_of_use');
        const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
        expect(hrefs).toContain('/');
    });
});
