import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./LegalDocumentView.jsx', () => ({
    default: ({ kind }) => <div data-testid="legal-doc-view" data-kind={kind}>doc</div>,
}));

import LegalPage from './LegalPage.jsx';

function renderPage(kind) {
    return render(
        <MemoryRouter>
            <LegalPage kind={kind} />
        </MemoryRouter>,
    );
}

describe('LegalPage', () => {
    it('renders no chrome title of its own — the document supplies its own H1', () => {
        // Deduplicated: the page used to render a short localized title above the document,
        // which then repeated its own full formal H1. The document's H1 is now the only heading.
        const { container } = renderPage('personal_data_consent');
        expect(container.querySelector('.legal-page-title')).toBeNull();
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
