import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Leaderboard from './Leaderboard.jsx';

beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
            data: [{ model: 'm1', knowledge_base: 'kb', elo: 1500, win_rate: 60, matches: 5 }],
        }),
    });
});

afterEach(() => {
    delete globalThis.fetch;
});

describe('Leaderboard', () => {
    it('shows the arena table', async () => {
        render(<Leaderboard />);
        await waitFor(() => expect(screen.getByText('m1')).toBeTruthy());
        expect(globalThis.fetch).toHaveBeenCalledWith('/v1/arena/leaderboard');
    });

    it('renders the empty state when there are no battles', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ data: [] }) });
        render(<Leaderboard />);
        await waitFor(() => expect(screen.getByText(/no battles|битв пока не было/i)).toBeTruthy());
    });

    // The contributor board published nicknames and per-user activity to every visitor.
    // It was removed; nothing may reintroduce a per-user tab or endpoint here.
    it('has no contributors tab and never calls a per-user endpoint', async () => {
        render(<Leaderboard />);
        await waitFor(() => expect(screen.getByText('m1')).toBeTruthy());
        expect(screen.queryByText(/contributors|участники/i)).toBeNull();
        expect(screen.queryByRole('tablist')).toBeNull();
        for (const [url] of globalThis.fetch.mock.calls) {
            expect(url).not.toMatch(/\/v1\/leaderboard/);
        }
    });
});
