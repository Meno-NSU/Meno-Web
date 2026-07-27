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

    it('shows the history notice with links to the Terms and the Policy', () => {
        // History is stored for everyone as core service behaviour (not a consent), so the
        // user is informed of it here — with the two governing documents linked.
        const { container } = render(<ChatInput onSend={vi.fn()} onStop={vi.fn()} />);
        const notice = container.querySelector('.input-history-notice');
        expect(notice).not.toBeNull();
        const hrefs = [...notice.querySelectorAll('a')].map((a) => a.getAttribute('href'));
        expect(hrefs).toEqual(expect.arrayContaining(['/terms', '/privacy']));
    });
});
