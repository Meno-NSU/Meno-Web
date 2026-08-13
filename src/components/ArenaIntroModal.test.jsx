import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import ArenaIntroModal from './ArenaIntroModal.jsx';

describe('ArenaIntroModal', () => {
    it('is a dialog with the intro text and an Ok button', () => {
        const { container } = render(<ArenaIntroModal onClose={vi.fn()} />);
        const dialog = container.querySelector('[role="dialog"]');
        expect(dialog).not.toBeNull();
        expect(container.querySelector('.arena-intro-body').textContent.length).toBeGreaterThan(0);
        expect(container.querySelector('.arena-intro-ok')).not.toBeNull();
    });

    it('closes via the Ok button', () => {
        const onClose = vi.fn();
        const { container } = render(<ArenaIntroModal onClose={onClose} />);
        fireEvent.click(container.querySelector('.arena-intro-ok'));
        expect(onClose).toHaveBeenCalled();
    });

    it('closes via the X control', () => {
        const onClose = vi.fn();
        const { container } = render(<ArenaIntroModal onClose={onClose} />);
        fireEvent.click(container.querySelector('.arena-intro-close'));
        expect(onClose).toHaveBeenCalled();
    });

    it('closes on Escape', () => {
        const onClose = vi.fn();
        render(<ArenaIntroModal onClose={onClose} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('closes on backdrop click', () => {
        const onClose = vi.fn();
        const { container } = render(<ArenaIntroModal onClose={onClose} />);
        fireEvent.mouseDown(container.querySelector('.arena-intro-overlay'));
        expect(onClose).toHaveBeenCalled();
    });
});
