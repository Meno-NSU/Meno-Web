import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';

// The document body (fetch + markdown) is covered by LegalDocumentView.test.jsx.
// Here we only test the modal chrome: dialog + dismissal.
vi.mock('./LegalDocumentView.jsx', () => ({
    default: ({ kind }) => <div data-testid="legal-doc-view" data-kind={kind}>doc</div>,
}));

import LegalDocument from './LegalDocument.jsx';

describe('LegalDocument (modal reader)', () => {
    it('renders a dialog embedding the document view for the kind', () => {
        render(<LegalDocument kind="personal_data_consent" onClose={vi.fn()} />);
        expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
        expect(screen.getByTestId('legal-doc-view').getAttribute('data-kind')).toBe('personal_data_consent');
    });

    it('closes via the close button', () => {
        const onClose = vi.fn();
        const { container } = render(<LegalDocument kind="terms_of_use" onClose={onClose} />);
        fireEvent.click(container.querySelector('.legal-doc-close'));
        expect(onClose).toHaveBeenCalled();
    });

    it('closes on Escape', () => {
        const onClose = vi.fn();
        render(<LegalDocument kind="terms_of_use" onClose={onClose} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('closes when the backdrop is clicked', () => {
        const onClose = vi.fn();
        const { container } = render(<LegalDocument kind="terms_of_use" onClose={onClose} />);
        fireEvent.mouseDown(container.querySelector('.legal-doc-overlay'));
        expect(onClose).toHaveBeenCalled();
    });
});
