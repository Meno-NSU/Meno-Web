import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import SettingsBar from './SettingsBar.jsx';

function renderBar({
    currentView = 'chat',
    setCurrentView = vi.fn(),
    user = null,
    onOpenAuth = vi.fn(),
    onLogout = vi.fn(),
    models = [],
    onModelChange = vi.fn(),
} = {}) {
    return render(
        <SettingsBar
            theme="light"
            toggleTheme={() => {}}
            isSidebarOpen={true}
            models={models}
            selectedModel=""
            onModelChange={onModelChange}
            onDropdownOpen={() => {}}
            isArenaMode={false}
            setIsArenaMode={() => {}}
            currentView={currentView}
            setCurrentView={setCurrentView}
            coreModelId=""
            onOpenSidebar={() => {}}
            user={user}
            onOpenAuth={onOpenAuth}
            onLogout={onLogout}
        />,
    );
}

describe('SettingsBar leaderboard toggle', () => {
    it('opens the leaderboard from chat view', () => {
        const setCurrentView = vi.fn();
        renderBar({ currentView: 'chat', setCurrentView });
        const btn = screen.getByTitle(/leaderboard|таблиц/i);
        fireEvent.click(btn);
        expect(setCurrentView).toHaveBeenCalledWith('leaderboard');
    });

    it('closes the leaderboard when already open', () => {
        const setCurrentView = vi.fn();
        renderBar({ currentView: 'leaderboard', setCurrentView });
        const btn = screen.getByTitle(/leaderboard|таблиц/i);
        fireEvent.click(btn);
        expect(setCurrentView).toHaveBeenCalledWith('chat');
    });

    it('marks the trophy button active when leaderboard is open', () => {
        renderBar({ currentView: 'leaderboard' });
        const btn = screen.getByTitle(/leaderboard|таблиц/i);
        expect(btn.className).toMatch(/\bactive\b/);
    });
});

describe('SettingsBar auth controls', () => {
    it('shows the sign-in button for anonymous users and opens the auth modal', () => {
        const onOpenAuth = vi.fn();
        renderBar({ user: null, onOpenAuth });
        const btn = screen.getByTitle(/sign in|войти/i);
        fireEvent.click(btn);
        expect(onOpenAuth).toHaveBeenCalled();
    });

    it('shows the account chip with the nickname when signed in', () => {
        renderBar({ user: { id: 1, email: 'demo@nsu.ru', nickname: 'Demo' } });
        expect(screen.queryByTitle(/sign in|войти/i)).toBeNull();
        expect(screen.getByText('Demo')).toBeTruthy();
    });

    it('falls back to the email when the user has no nickname', () => {
        renderBar({ user: { id: 1, email: 'demo@nsu.ru', nickname: null } });
        expect(screen.getByText('demo@nsu.ru')).toBeTruthy();
    });

    it('logs out from the account menu', () => {
        const onLogout = vi.fn();
        renderBar({ user: { id: 1, email: 'demo@nsu.ru', nickname: 'Demo' }, onLogout });
        fireEvent.click(screen.getByText('Demo'));
        fireEvent.click(screen.getByText(/sign out|выйти/i));
        expect(onLogout).toHaveBeenCalled();
    });
});

describe('SettingsBar locked models', () => {
    const models = [
        { id: 'local-vllm', provider: 'vllm', display_name: 'Local vLLM' },
        { id: 'openrouter/demo', provider: 'openrouter', featured: true, display_name: 'OR Demo', requires_auth: true },
    ];

    function openDropdown(container) {
        fireEvent.click(container.querySelector('.model-dropdown-trigger'));
    }

    it('opens the auth modal instead of selecting a locked model', () => {
        const onOpenAuth = vi.fn();
        const onModelChange = vi.fn();
        const { container } = renderBar({ models, onOpenAuth, onModelChange });
        openDropdown(container);
        fireEvent.click(screen.getByText('OR Demo'));
        expect(onOpenAuth).toHaveBeenCalled();
        expect(onModelChange).not.toHaveBeenCalled();
    });

    it('still selects unlocked models normally', () => {
        const onOpenAuth = vi.fn();
        const onModelChange = vi.fn();
        const { container } = renderBar({ models, onOpenAuth, onModelChange });
        openDropdown(container);
        fireEvent.click(screen.getByText('Local vLLM'));
        expect(onModelChange).toHaveBeenCalledWith('local-vllm');
        expect(onOpenAuth).not.toHaveBeenCalled();
    });

    it('marks the locked item with a sign-in hint', () => {
        const { container } = renderBar({ models });
        openDropdown(container);
        const locked = screen.getByText('OR Demo').closest('button');
        expect(locked.className).toMatch(/\blocked\b/);
        expect(locked.title).toMatch(/sign in|войдите/i);
    });
});
