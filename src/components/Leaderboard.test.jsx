import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import Leaderboard from './Leaderboard.jsx';
import { fetchContributorLeaderboard } from '../services/api.js';

vi.mock('../services/api.js', () => ({
    fetchContributorLeaderboard: vi.fn(),
}));

beforeEach(() => {
    vi.clearAllMocks();
    // Arena tab fetches /v1/arena/leaderboard with the raw fetch API.
    globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
            data: [{ model: 'm1', knowledge_base: 'kb', elo: 1500, win_rate: 60, matches: 5 }],
        }),
    });
});

afterEach(() => {
    delete globalThis.fetch;
});

describe('Leaderboard tabs', () => {
    it('shows the arena table by default', async () => {
        render(<Leaderboard />);
        await waitFor(() => expect(screen.getByText('m1')).toBeTruthy());
        expect(fetchContributorLeaderboard).not.toHaveBeenCalled();
    });

    it('switches to contributors and renders the rows', async () => {
        fetchContributorLeaderboard.mockResolvedValue([
            { nickname: 'Alice', votes: 3, feedback: 2, questions: 5, total: 10 },
            { nickname: null, votes: 1, feedback: 0, questions: 0, total: 1 },
        ]);
        render(<Leaderboard />);
        await waitFor(() => expect(screen.getByText('m1')).toBeTruthy());

        fireEvent.click(screen.getByText(/contributors|участники/i));

        await waitFor(() => expect(screen.getByText('Alice')).toBeTruthy());
        expect(screen.getByText('10')).toBeTruthy();
        // null nickname falls back to the anonymous label
        expect(screen.getByText(/anonymous|аноним/i)).toBeTruthy();
    });

    it('shows the contributors empty state', async () => {
        fetchContributorLeaderboard.mockResolvedValue([]);
        render(<Leaderboard />);
        await waitFor(() => expect(screen.getByText('m1')).toBeTruthy());

        fireEvent.click(screen.getByText(/contributors|участники/i));

        await waitFor(() => expect(screen.getByText(/no contributors yet|участников пока нет/i)).toBeTruthy());
    });
});
