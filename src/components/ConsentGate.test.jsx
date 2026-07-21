import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';

// Keep this a focused unit — the reader is exercised in LegalDocument.test.jsx.
vi.mock('./LegalDocument.jsx', () => ({
    default: ({ kind, onClose }) => (
        <div data-testid="legal-doc" data-kind={kind}>
            <button className="mock-doc-close" onClick={onClose} type="button">close</button>
        </div>
    ),
}));

import ConsentGate from './ConsentGate.jsx';
import { translateOnce as tr } from '../i18n.js';

function renderGate(props = {}) {
    return render(<ConsentGate isOpen onGrant={vi.fn()} {...props} />);
}

describe('ConsentGate', () => {
    it('renders nothing when closed', () => {
        const { container } = render(<ConsentGate isOpen={false} onGrant={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('is a modal dialog', () => {
        renderGate();
        expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    });

    it('grants improvement from the primary choice: onGrant(true)', () => {
        const onGrant = vi.fn();
        const { container } = renderGate({ onGrant });
        fireEvent.click(container.querySelector('.consent-gate-primary'));
        expect(onGrant).toHaveBeenCalledWith(true);
    });

    it('grants service only from the secondary choice: onGrant(false)', () => {
        const onGrant = vi.fn();
        const { container } = renderGate({ onGrant });
        fireEvent.click(container.querySelector('.consent-gate-secondary'));
        expect(onGrant).toHaveBeenCalledWith(false);
    });

    it('is not dismissible: Escape neither closes it nor grants', () => {
        const onGrant = vi.fn();
        renderGate({ onGrant });
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(onGrant).not.toHaveBeenCalled();
    });

    it('is not dismissible: clicking the backdrop does not close it', () => {
        const { container } = renderGate();
        fireEvent.mouseDown(container.querySelector('.consent-gate-overlay'));
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('disables both action buttons while busy', () => {
        const { container } = renderGate({ busy: true });
        expect(container.querySelector('.consent-gate-primary').disabled).toBe(true);
        expect(container.querySelector('.consent-gate-secondary').disabled).toBe(true);
    });

    it('shows a retryable error message', () => {
        const { container } = renderGate({ error: 'boom' });
        const alert = container.querySelector('[role="alert"]');
        expect(alert).not.toBeNull();
        expect(alert.textContent).toContain('boom');
    });

    it('opens the consent document in the reader when its link is clicked', () => {
        const { container } = renderGate();
        expect(screen.queryByTestId('legal-doc')).toBeNull();
        fireEvent.click(container.querySelector('.consent-gate-doc[data-kind="personal_data_consent"]'));
        expect(screen.getByTestId('legal-doc').getAttribute('data-kind')).toBe('personal_data_consent');
    });

    it('closes the reader again', () => {
        const { container } = renderGate();
        fireEvent.click(container.querySelector('.consent-gate-doc[data-kind="privacy_policy"]'));
        fireEvent.click(screen.getByTestId('legal-doc').querySelector('.mock-doc-close'));
        expect(screen.queryByTestId('legal-doc')).toBeNull();
    });

    it('has real localized copy for its title and actions', () => {
        for (const key of ['consentTitle', 'consentBody', 'consentAllowImprovement', 'consentServiceOnly']) {
            expect(tr(key)).not.toBe(key);
        }
    });
});
