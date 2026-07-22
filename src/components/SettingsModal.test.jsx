import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import SettingsModal from './SettingsModal.jsx';

function renderModal(props = {}) {
    return render(
        <SettingsModal
            isOpen
            onClose={vi.fn()}
            improvementEnabled={false}
            onToggleImprovement={vi.fn()}
            onClearHistory={vi.fn()}
            onDeleteData={vi.fn()}
            {...props}
        />,
    );
}

// Navigate from the «О сервисе» menu into the data-controls sub-view.
function openData(container) {
    fireEvent.click(container.querySelector('.settings-data-row'));
}

describe('SettingsModal', () => {
    it('renders nothing when closed', () => {
        const { container } = renderModal({ isOpen: false });
        expect(container.firstChild).toBeNull();
    });

    it('is a modal dialog', () => {
        const { container } = renderModal();
        expect(container.querySelector('[role="dialog"]').getAttribute('aria-modal')).toBe('true');
    });

    describe('menu view («О сервисе»)', () => {
        it('shows the «О сервисе» section with the data-controls entry and three document links', () => {
            const { container } = renderModal();
            expect(container.querySelector('.settings-section-label')).not.toBeNull();
            expect(container.querySelector('.settings-data-row')).not.toBeNull();
            const hrefs = [...container.querySelectorAll('.settings-doc-link')].map((a) => a.getAttribute('href'));
            expect(hrefs).toEqual(expect.arrayContaining(['/privacy', '/terms', '/consent']));
        });

        it('opens the documents in a new tab', () => {
            const { container } = renderModal();
            for (const a of container.querySelectorAll('.settings-doc-link')) {
                expect(a.getAttribute('target')).toBe('_blank');
            }
        });

        it('has no back control on the menu view', () => {
            const { container } = renderModal();
            expect(container.querySelector('.settings-back')).toBeNull();
        });
    });

    describe('data sub-view («Данные и конфиденциальность»)', () => {
        it('opens when the data-controls entry is clicked', () => {
            const { container } = renderModal();
            expect(container.querySelector('.settings-improvement-toggle')).toBeNull();
            openData(container);
            expect(container.querySelector('.settings-improvement-toggle')).not.toBeNull();
        });

        it('reflects the current improvement state on the toggle', () => {
            const { container } = renderModal({ improvementEnabled: true });
            openData(container);
            expect(container.querySelector('.settings-improvement-toggle').checked).toBe(true);
        });

        it('toggles improvement to the negated value', () => {
            const onToggleImprovement = vi.fn();
            const { container } = renderModal({ improvementEnabled: false, onToggleImprovement });
            openData(container);
            fireEvent.click(container.querySelector('.settings-improvement-toggle'));
            expect(onToggleImprovement).toHaveBeenCalledWith(true);
        });

        it('clears local history only after an inline confirm', () => {
            const onClearHistory = vi.fn();
            const { container } = renderModal({ onClearHistory });
            openData(container);
            fireEvent.click(container.querySelector('.settings-clear'));
            expect(onClearHistory).not.toHaveBeenCalled();
            fireEvent.click(container.querySelector('.settings-clear-confirm'));
            expect(onClearHistory).toHaveBeenCalled();
        });

        it('deletes all data only after an inline confirm', () => {
            const onDeleteData = vi.fn();
            const { container } = renderModal({ onDeleteData });
            openData(container);
            fireEvent.click(container.querySelector('.settings-delete'));
            expect(onDeleteData).not.toHaveBeenCalled();
            fireEvent.click(container.querySelector('.settings-delete-confirm'));
            expect(onDeleteData).toHaveBeenCalled();
        });

        it('returns to the menu via the back control', () => {
            const { container } = renderModal();
            openData(container);
            expect(container.querySelector('.settings-section-label')).toBeNull();
            fireEvent.click(container.querySelector('.settings-back'));
            expect(container.querySelector('.settings-section-label')).not.toBeNull();
        });
    });

    describe('closing', () => {
        it('closes via the X button', () => {
            const onClose = vi.fn();
            const { container } = renderModal({ onClose });
            fireEvent.click(container.querySelector('.settings-close'));
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
            fireEvent.mouseDown(container.querySelector('.settings-overlay'));
            expect(onClose).toHaveBeenCalled();
        });

        it('reopens on the menu view even if closed from the data sub-view', () => {
            const onClose = vi.fn();
            const { container, rerender } = renderModal({ onClose });
            openData(container);
            rerender(
                <SettingsModal
                    isOpen={false}
                    onClose={onClose}
                    improvementEnabled={false}
                    onToggleImprovement={vi.fn()}
                    onClearHistory={vi.fn()}
                    onDeleteData={vi.fn()}
                />,
            );
            rerender(
                <SettingsModal
                    isOpen
                    onClose={onClose}
                    improvementEnabled={false}
                    onToggleImprovement={vi.fn()}
                    onClearHistory={vi.fn()}
                    onDeleteData={vi.fn()}
                />,
            );
            expect(container.querySelector('.settings-section-label')).not.toBeNull();
        });
    });
});
