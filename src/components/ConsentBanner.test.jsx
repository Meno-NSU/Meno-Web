import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import ConsentBanner from './ConsentBanner.jsx';

function renderBanner(props = {}) {
    return render(<ConsentBanner onDecide={vi.fn()} onDismiss={vi.fn()} {...props} />);
}

describe('ConsentBanner (non-blocking improvement opt-in)', () => {
    it('is a non-modal region, not a blocking dialog', () => {
        const { container } = renderBanner();
        expect(container.querySelector('[aria-modal="true"]')).toBeNull();
        expect(container.querySelector('[role="region"]')).not.toBeNull();
    });

    it('opts in via the primary button: onDecide(true)', () => {
        const onDecide = vi.fn();
        const { container } = renderBanner({ onDecide });
        fireEvent.click(container.querySelector('.consent-banner-allow'));
        expect(onDecide).toHaveBeenCalledWith(true);
    });

    it('declines via the secondary button: onDecide(false)', () => {
        const onDecide = vi.fn();
        const { container } = renderBanner({ onDecide });
        fireEvent.click(container.querySelector('.consent-banner-decline'));
        expect(onDecide).toHaveBeenCalledWith(false);
    });

    it('dismisses via the close control: onDismiss()', () => {
        const onDismiss = vi.fn();
        const { container } = renderBanner({ onDismiss });
        fireEvent.click(container.querySelector('.consent-banner-close'));
        expect(onDismiss).toHaveBeenCalled();
    });

    it('links to the privacy policy in a new tab', () => {
        const { container } = renderBanner();
        const link = container.querySelector('a[href="/privacy"]');
        expect(link).not.toBeNull();
        expect(link.getAttribute('target')).toBe('_blank');
    });
});
