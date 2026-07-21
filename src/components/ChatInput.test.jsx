import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import ChatInput from './ChatInput.jsx';

describe('ChatInput consent notice', () => {
    it('shows a privacy-policy notice link in the footer', () => {
        const { container } = render(<ChatInput onSend={vi.fn()} onStop={vi.fn()} />);
        const link = container.querySelector('.input-consent-notice a[href="/privacy"]');
        expect(link).not.toBeNull();
        expect(link.getAttribute('target')).toBe('_blank');
    });
});
