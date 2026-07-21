import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import PrivacySettingsModal from './PrivacySettingsModal.jsx';

function renderModal(props = {}) {
    return render(
        <PrivacySettingsModal
            isOpen
            onClose={vi.fn()}
            improvementEnabled={false}
            onToggleImprovement={vi.fn()}
            onClearHistory={vi.fn()}
            {...props}
        />,
    );
}

describe('PrivacySettingsModal', () => {
    it('renders nothing when closed', () => {
        const { container } = renderModal({ isOpen: false });
        expect(container.firstChild).toBeNull();
    });

    it('is a modal dialog', () => {
        renderModal();
        expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    });

    it('reflects the current improvement state on the toggle', () => {
        const { container } = renderModal({ improvementEnabled: true });
        expect(container.querySelector('.privacy-settings-improvement-toggle').checked).toBe(true);
    });

    it('toggles improvement to the negated value', () => {
        const onToggleImprovement = vi.fn();
        const { container } = renderModal({ improvementEnabled: false, onToggleImprovement });
        fireEvent.click(container.querySelector('.privacy-settings-improvement-toggle'));
        expect(onToggleImprovement).toHaveBeenCalledWith(true);
    });

    it('clears local history only after an inline confirm', () => {
        const onClearHistory = vi.fn();
        const { container } = renderModal({ onClearHistory });
        fireEvent.click(container.querySelector('.privacy-settings-clear'));
        expect(onClearHistory).not.toHaveBeenCalled();
        fireEvent.click(container.querySelector('.privacy-settings-clear-confirm'));
        expect(onClearHistory).toHaveBeenCalled();
    });

    it('cancels the clear confirmation without clearing', () => {
        const onClearHistory = vi.fn();
        const { container } = renderModal({ onClearHistory });
        fireEvent.click(container.querySelector('.privacy-settings-clear'));
        fireEvent.click(container.querySelector('.privacy-settings-clear-cancel'));
        expect(onClearHistory).not.toHaveBeenCalled();
        expect(container.querySelector('.privacy-settings-clear')).not.toBeNull();
    });

    it('has the three document links in new tabs', () => {
        const { container } = renderModal();
        const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
        expect(hrefs).toEqual(expect.arrayContaining(['/privacy', '/terms', '/consent']));
        for (const a of container.querySelectorAll('a')) {
            expect(a.getAttribute('target')).toBe('_blank');
        }
    });

    it('closes via the X button', () => {
        const onClose = vi.fn();
        const { container } = renderModal({ onClose });
        fireEvent.click(container.querySelector('.privacy-settings-close'));
        expect(onClose).toHaveBeenCalled();
    });

    it('closes on Escape', () => {
        const onClose = vi.fn();
        renderModal({ onClose });
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('closes on backdrop click', () => {
        const onClose = vi.fn();
        const { container } = renderModal({ onClose });
        fireEvent.mouseDown(container.querySelector('.privacy-settings-overlay'));
        expect(onClose).toHaveBeenCalled();
    });
});
