import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import AuthModal from './AuthModal.jsx';

function renderModal({
    isOpen = true,
    onClose = vi.fn(),
    login = vi.fn().mockResolvedValue({}),
    register = vi.fn().mockResolvedValue({}),
} = {}) {
    return render(<AuthModal isOpen={isOpen} onClose={onClose} login={login} register={register} />);
}

describe('AuthModal', () => {
    it('renders nothing when closed', () => {
        renderModal({ isOpen: false });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('submits the login form with the entered credentials', async () => {
        const login = vi.fn().mockResolvedValue({});
        const onClose = vi.fn();
        const { container } = renderModal({ login, onClose });

        fireEvent.change(container.querySelector('input[type="email"]'), {
            target: { value: ' demo@nsu.ru ' },
        });
        fireEvent.change(container.querySelector('input[type="password"]'), {
            target: { value: 'secret123' },
        });
        fireEvent.submit(container.querySelector('form'));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(login).toHaveBeenCalledWith('demo@nsu.ru', 'secret123');
    });

    it('shows the nickname field only on the register tab and submits it', async () => {
        const register = vi.fn().mockResolvedValue({});
        const { container } = renderModal({ register });

        expect(container.querySelector('input[type="text"]')).toBeNull();
        fireEvent.click(screen.getAllByRole('tab')[1]);

        fireEvent.change(container.querySelector('input[type="email"]'), {
            target: { value: 'demo@nsu.ru' },
        });
        fireEvent.change(container.querySelector('input[type="password"]'), {
            target: { value: 'secret123' },
        });
        fireEvent.change(container.querySelector('input[type="text"]'), {
            target: { value: 'Demo' },
        });
        fireEvent.submit(container.querySelector('form'));

        await waitFor(() => expect(register).toHaveBeenCalledWith('demo@nsu.ru', 'secret123', 'Demo'));
    });

    it('surfaces a backend error message and keeps the modal open', async () => {
        const login = vi.fn().mockRejectedValue(new Error('Invalid email or password.'));
        const onClose = vi.fn();
        const { container } = renderModal({ login, onClose });

        fireEvent.change(container.querySelector('input[type="email"]'), {
            target: { value: 'demo@nsu.ru' },
        });
        fireEvent.change(container.querySelector('input[type="password"]'), {
            target: { value: 'wrong' },
        });
        fireEvent.submit(container.querySelector('form'));

        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/invalid email/i));
        expect(onClose).not.toHaveBeenCalled();
    });

    it('closes on Escape', () => {
        const onClose = vi.fn();
        renderModal({ onClose });
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('shows a consent notice with document links only on the register tab', () => {
        const { container } = renderModal();
        expect(container.querySelector('.auth-consent-notice')).toBeNull();

        fireEvent.click(screen.getAllByRole('tab')[1]); // switch to register
        const notice = container.querySelector('.auth-consent-notice');
        expect(notice).not.toBeNull();
        const links = [...notice.querySelectorAll('a')];
        expect(links.map((a) => a.getAttribute('href'))).toEqual(
            expect.arrayContaining(['/terms', '/privacy']),
        );
        for (const a of links) {
            expect(a.getAttribute('target')).toBe('_blank');
        }
    });
});
