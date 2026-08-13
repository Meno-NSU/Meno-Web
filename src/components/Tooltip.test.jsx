import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import Tooltip from './Tooltip.jsx';

describe('Tooltip', () => {
    it('renders the wrapped control and the hint bubble', () => {
        const { container } = render(
            <Tooltip text="Explains the action">
                <button type="button">Act</button>
            </Tooltip>,
        );
        expect(container.querySelector('button')).not.toBeNull();
        const bubble = container.querySelector('.tooltip-bubble');
        expect(bubble).not.toBeNull();
        expect(bubble.textContent).toBe('Explains the action');
        // Cosmetic duplicate of the control's own label — hidden from screen readers.
        expect(bubble.getAttribute('aria-hidden')).toBe('true');
    });

    it('renders children untouched when there is no text', () => {
        const { container } = render(
            <Tooltip text="">
                <button type="button">Act</button>
            </Tooltip>,
        );
        expect(container.querySelector('.tooltip-wrap')).toBeNull();
        expect(container.querySelector('button')).not.toBeNull();
    });
});
