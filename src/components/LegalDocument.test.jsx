import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/api.js', () => ({
    getLegalDocument: vi.fn(),
}));

import LegalDocument from './LegalDocument.jsx';
import { getLegalDocument } from '../services/api.js';

beforeEach(() => {
    vi.clearAllMocks();
});

const PENDING = () => new Promise(() => {}); // never resolves — stays in loading

describe('LegalDocument', () => {
    it('fetches the document by kind and renders its markdown content', async () => {
        getLegalDocument.mockResolvedValue({
            kind: 'personal_data_consent',
            version: '1.0',
            url: '/consent',
            sha256: 'x',
            effectiveAt: null,
            content: '# Заголовок\n\nТекст согласия.',
        });
        const { container } = render(<LegalDocument kind="personal_data_consent" onClose={vi.fn()} />);
        expect(getLegalDocument).toHaveBeenCalledWith('personal_data_consent');
        await waitFor(() => {
            expect(container.querySelector('h1')?.textContent).toContain('Заголовок');
        });
        expect(container.textContent).toContain('Текст согласия.');
    });

    it('shows a loading state before the content arrives', async () => {
        getLegalDocument.mockReturnValue(PENDING());
        const { container } = render(<LegalDocument kind="privacy_policy" onClose={vi.fn()} />);
        expect(container.querySelector('.legal-doc-loading')).not.toBeNull();
    });

    it('shows an error state when the fetch fails', async () => {
        getLegalDocument.mockRejectedValue(new Error('nope'));
        const { container } = render(<LegalDocument kind="terms_of_use" onClose={vi.fn()} />);
        await waitFor(() => expect(container.querySelector('.legal-doc-error')).not.toBeNull());
    });

    it('closes via the close button', async () => {
        getLegalDocument.mockReturnValue(PENDING());
        const onClose = vi.fn();
        const { container } = render(<LegalDocument kind="terms_of_use" onClose={onClose} />);
        fireEvent.click(container.querySelector('.legal-doc-close'));
        expect(onClose).toHaveBeenCalled();
    });

    it('closes on Escape', () => {
        getLegalDocument.mockReturnValue(PENDING());
        const onClose = vi.fn();
        render(<LegalDocument kind="terms_of_use" onClose={onClose} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('closes when the backdrop is clicked', () => {
        getLegalDocument.mockReturnValue(PENDING());
        const onClose = vi.fn();
        const { container } = render(<LegalDocument kind="terms_of_use" onClose={onClose} />);
        fireEvent.mouseDown(container.querySelector('.legal-doc-overlay'));
        expect(onClose).toHaveBeenCalled();
    });
});
