import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Sidebar from './Sidebar.jsx';

const baseProps = {
    isOpen: true,
    toggleSidebar: vi.fn(),
    chats: [],
    activeChatId: null,
    onSelectChat: vi.fn(),
    onNewChat: vi.fn(),
    onDeleteChat: vi.fn(),
    generatingChats: new Set(),
    currentView: 'chat',
    setCurrentView: vi.fn(),
    theme: 'light',
    toggleTheme: vi.fn(),
    isArenaMode: false,
    setIsArenaMode: vi.fn(),
    user: null,
    onOpenAuth: vi.fn(),
    onLogout: vi.fn(),
    onOpenSettings: vi.fn(),
};

describe('Sidebar guest notice', () => {
    it('tells a guest their chats live only in this browser', () => {
        render(<Sidebar {...baseProps} isAuthenticated={false} />);
        expect(screen.getByText(/только в этом браузере/i)).toBeTruthy();
    });

    it('does not show that notice to a signed-in user', () => {
        render(<Sidebar {...baseProps} isAuthenticated />);
        expect(screen.queryByText(/только в этом браузере/i)).toBeNull();
    });
});

describe('Sidebar history load failure', () => {
    it('shows a could-not-load message instead of the empty state when told the load failed', () => {
        render(<Sidebar {...baseProps} isAuthenticated historyLoadFailed />);
        expect(screen.getByText(/не удалось загрузить историю/i)).toBeTruthy();
        expect(screen.queryByText('Нет недавних чатов')).toBeNull();
    });

    it('still shows the ordinary empty state when the load did not fail', () => {
        render(<Sidebar {...baseProps} isAuthenticated historyLoadFailed={false} />);
        expect(screen.getByText('Нет недавних чатов')).toBeTruthy();
        expect(screen.queryByText(/не удалось загрузить историю/i)).toBeNull();
    });

    it('does not show the failure message once there are chats to list', () => {
        render(<Sidebar
            {...baseProps}
            isAuthenticated
            historyLoadFailed
            chats={[{ id: 'c1', title: 'Чат 1' }]}
        />);
        expect(screen.getByText('Чат 1')).toBeTruthy();
        expect(screen.queryByText(/не удалось загрузить историю/i)).toBeNull();
    });
});
