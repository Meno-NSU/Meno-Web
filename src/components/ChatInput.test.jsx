import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import ChatInput from './ChatInput.jsx';

describe('ChatInput footer', () => {
    it('does not show the "by sending you accept" consent notice (it lives in the documents now)', () => {
        const { container } = render(<ChatInput onSend={vi.fn()} onStop={vi.fn()} />);
        expect(container.querySelector('.input-consent-notice')).toBeNull();
    });

    it('still shows the model disclaimer', () => {
        const { container } = render(<ChatInput onSend={vi.fn()} onStop={vi.fn()} />);
        expect(container.querySelector('.input-disclaimer')).not.toBeNull();
    });
});
