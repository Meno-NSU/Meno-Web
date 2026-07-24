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

    it('has no nickname field (temporarily removed) and registers without one once consent is given', async () => {
        const register = vi.fn().mockResolvedValue({});
        const { container } = renderModal({ register });

        fireEvent.click(screen.getAllByRole('tab')[1]); // switch to register
        // Nickname input is temporarily removed — no text input on either tab.
        expect(container.querySelector('input[type="text"]')).toBeNull();

        fireEvent.change(container.querySelector('input[type="email"]'), {
            target: { value: 'demo@nsu.ru' },
        });
        fireEvent.change(container.querySelector('input[type="password"]'), {
            target: { value: 'secret123' },
        });
        fireEvent.click(screen.getByRole('checkbox')); // grant consent
        fireEvent.submit(container.querySelector('form'));

        await waitFor(() => expect(register).toHaveBeenCalledWith('demo@nsu.ru', 'secret123', null));
    });

    it('blocks registration until the consent box is checked', async () => {
        const register = vi.fn().mockResolvedValue({});
        const { container } = renderModal({ register });

        fireEvent.click(screen.getAllByRole('tab')[1]); // switch to register
        fireEvent.change(container.querySelector('input[type="email"]'), {
            target: { value: 'demo@nsu.ru' },
        });
        fireEvent.change(container.querySelector('input[type="password"]'), {
            target: { value: 'secret123' },
        });

        // Consent not given yet: the submit is disabled and submitting does nothing.
        expect(container.querySelector('.auth-submit').disabled).toBe(true);
        fireEvent.submit(container.querySelector('form'));
        expect(register).not.toHaveBeenCalled();

        // Checking the box enables submission.
        fireEvent.click(screen.getByRole('checkbox'));
        expect(container.querySelector('.auth-submit').disabled).toBe(false);
        fireEvent.submit(container.querySelector('form'));
        await waitFor(() => expect(register).toHaveBeenCalledWith('demo@nsu.ru', 'secret123', null));
    });

    it('drops a stale consent check when switching tabs and back', () => {
        const { container } = renderModal();
        fireEvent.click(screen.getAllByRole('tab')[1]); // register
        fireEvent.click(screen.getByRole('checkbox'));
        expect(screen.getByRole('checkbox').checked).toBe(true);

        fireEvent.click(screen.getAllByRole('tab')[0]); // back to login
        fireEvent.click(screen.getAllByRole('tab')[1]); // register again
        expect(screen.getByRole('checkbox').checked).toBe(false);
        expect(container.querySelector('.auth-submit').disabled).toBe(true);
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
