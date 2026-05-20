import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import SettingsBar from './SettingsBar.jsx';

function renderBar({ currentView = 'chat', setCurrentView = vi.fn() } = {}) {
    return render(
        <SettingsBar
            theme="light"
            toggleTheme={() => {}}
            isSidebarOpen={true}
            models={[]}
            selectedModel=""
            onModelChange={() => {}}
            onDropdownOpen={() => {}}
            isArenaMode={false}
            setIsArenaMode={() => {}}
            currentView={currentView}
            setCurrentView={setCurrentView}
            coreModelId=""
            onOpenSidebar={() => {}}
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
