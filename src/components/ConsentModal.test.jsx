import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import ConsentModal from './ConsentModal.jsx';

function renderModal(props = {}) {
    return render(<ConsentModal onContinue={vi.fn()} onDefer={vi.fn()} {...props} />);
}

describe('ConsentModal (consent gate)', () => {
    it('is a modal dialog', () => {
        const { container } = renderModal();
        const dialog = container.querySelector('[role="dialog"]');
        expect(dialog).not.toBeNull();
        expect(dialog.getAttribute('aria-modal')).toBe('true');
    });

    it('grants via the primary button: onContinue()', () => {
        const onContinue = vi.fn();
        const { container } = renderModal({ onContinue });
        fireEvent.click(container.querySelector('.consent-modal-continue'));
        expect(onContinue).toHaveBeenCalled();
    });

    it('defers via the secondary button: onDefer()', () => {
        const onDefer = vi.fn();
        const { container } = renderModal({ onDefer });
        fireEvent.click(container.querySelector('.consent-modal-defer'));
        expect(onDefer).toHaveBeenCalled();
    });

    it('places continue to the right of defer (continue is last in the actions row)', () => {
        const { container } = renderModal();
        const buttons = [...container.querySelector('.consent-modal-actions').querySelectorAll('button')];
        expect(buttons[0].classList.contains('consent-modal-defer')).toBe(true);
        expect(buttons[buttons.length - 1].classList.contains('consent-modal-continue')).toBe(true);
    });

    it('links to the consent and policy documents in new tabs', () => {
        const { container } = renderModal();
        expect(container.querySelector('a[href="/consent"]')).not.toBeNull();
        expect(container.querySelector('a[href="/privacy"]')).not.toBeNull();
        for (const a of container.querySelectorAll('a')) {
            expect(a.getAttribute('target')).toBe('_blank');
        }
    });

    describe('first prompt — blocking (not dismissible)', () => {
        it('has no close control and Escape does not defer', () => {
            const onDefer = vi.fn();
            const { container } = renderModal({ onDefer });
            expect(container.querySelector('.consent-modal-close')).toBeNull();
            fireEvent.keyDown(document, { key: 'Escape' });
            expect(onDefer).not.toHaveBeenCalled();
        });

        it('backdrop click does not defer', () => {
            const onDefer = vi.fn();
            const { container } = renderModal({ onDefer });
            fireEvent.mouseDown(container.querySelector('.consent-modal-overlay'));
            expect(onDefer).not.toHaveBeenCalled();
        });
    });

    describe('re-prompt — gentle (dismissible)', () => {
        it('closes via the X control as a defer', () => {
            const onDefer = vi.fn();
            const { container } = renderModal({ onDefer, dismissible: true });
            fireEvent.click(container.querySelector('.consent-modal-close'));
            expect(onDefer).toHaveBeenCalled();
        });

        it('defers on Escape', () => {
            const onDefer = vi.fn();
            renderModal({ onDefer, dismissible: true });
            fireEvent.keyDown(document, { key: 'Escape' });
            expect(onDefer).toHaveBeenCalled();
        });

        it('defers on backdrop click', () => {
            const onDefer = vi.fn();
            const { container } = renderModal({ onDefer, dismissible: true });
            fireEvent.mouseDown(container.querySelector('.consent-modal-overlay'));
            expect(onDefer).toHaveBeenCalled();
        });
    });
});
