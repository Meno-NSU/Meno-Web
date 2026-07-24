import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

vi.mock('../services/api.js', () => ({
    getLegalDocument: vi.fn(),
}));

import LegalDocumentView from './LegalDocumentView.jsx';
import { getLegalDocument } from '../services/api.js';

beforeEach(() => {
    vi.clearAllMocks();
});

const PENDING = () => new Promise(() => {}); // never resolves — stays in loading

describe('LegalDocumentView', () => {
    it('fetches the document by kind and renders its markdown content', async () => {
        getLegalDocument.mockResolvedValue({
            kind: 'personal_data_consent',
            version: '2.0',
            url: '/consent',
            sha256: 'x',
            effectiveAt: null,
            content: '# Заголовок\n\nТекст согласия.',
        });
        const { container } = render(<LegalDocumentView kind="personal_data_consent" />);
        expect(getLegalDocument).toHaveBeenCalledWith('personal_data_consent');
        await waitFor(() => {
            expect(container.querySelector('h1')?.textContent).toContain('Заголовок');
        });
        expect(container.textContent).toContain('Текст согласия.');
    });

    it('shows a loading state before the content arrives', () => {
        getLegalDocument.mockReturnValue(PENDING());
        const { container } = render(<LegalDocumentView kind="privacy_policy" />);
        expect(container.querySelector('.legal-doc-loading')).not.toBeNull();
    });

    it('shows an error state when the fetch fails', async () => {
        getLegalDocument.mockRejectedValue(new Error('nope'));
        const { container } = render(<LegalDocumentView kind="terms_of_use" />);
        await waitFor(() => expect(container.querySelector('.legal-doc-error')).not.toBeNull());
    });
});
