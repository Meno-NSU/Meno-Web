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

    it('names rows by version and model, built-ins localized', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ data: [
            { model: 'gemma-4-12B-it', knowledge_base: 'nsu-kb', stand_id: 'menon-1.0', stand_name: 'Менон 1.0', stand_version: null, llm_name: 'Gemma 4 12B', elo: 1500, win_rate: 50, matches: 3 },
            { model: 'meno-lite@ragu', knowledge_base: 'nsu-ragu', stand_id: 'ragu', stand_name: 'RAGU', stand_version: 'v1', llm_name: 'meno-lite', elo: 1400, win_rate: 40, matches: 3 },
        ] }) });
        render(<Leaderboard />);
        await waitFor(() => expect(screen.getByText('Менон 1.0 · Gemma 4 12B')).toBeTruthy());
        expect(screen.getByText('RAGU · meno-lite')).toBeTruthy();
        expect(screen.queryByText('nsu-ragu')).toBeNull();
        expect(screen.queryByText('v1')).toBeNull();
    });

    it('shows the version text when a stand has rows of several versions', async () => {
        const row = (v) => ({ model: 'x', stand_id: 'ragu', stand_name: 'RAGU', stand_version: v, llm_name: 'meno-lite', elo: 1, win_rate: 1, matches: 1 });
        globalThis.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ data: [row('v1'), row('v2')] }) });
        render(<Leaderboard />);
        await waitFor(() => expect(screen.getByText('v1')).toBeTruthy());
        expect(screen.getByText('v2')).toBeTruthy();
    });

    it('falls back to row.model for rows without the stand fields', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ data: [
            { model: 'old-model', knowledge_base: 'old-kb', elo: 1500, win_rate: 50, matches: 2 },
        ] }) });
        render(<Leaderboard />);
        await waitFor(() => expect(screen.getByText('old-model')).toBeTruthy());
        expect(screen.queryByText('old-kb')).toBeNull();
    });
});
