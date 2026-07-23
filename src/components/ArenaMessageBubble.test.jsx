// Regression tests for the arena vote-spam bug.
//
// Before this fix, the bubble's `voted` flag never got set to `true` after a
// successful POST because the setChats updater matched messages by reference
// (`m === message`) and the optimistic update had already replaced the
// reference. With `voted` stuck on `false`, the vote buttons stayed visible
// and every click sent a fresh POST that landed in the leaderboard.
//
// The fix: tag each arena bubble with a stable `bubbleId` at creation, and
// match by id in setChats. Plus a synchronous `submittedRef` guard so even
// rapid double-clicks within one render cycle can only fire one POST.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react';
import { ArenaMessageBubble } from './ChatArea.jsx';

function makeBubble({ bubbleId = 'bubble-1' } = {}) {
    return {
        role: 'assistant',
        isArena: true,
        arenaData: {
            bubbleId,
            a: { model: 'm-a', kb: 'kb-1', content: 'A text' },
            b: { model: 'm-b', kb: 'kb-1', content: 'B text' },
            voted: false,
            winner: null,
        },
    };
}

function makeChats(bubble) {
    return [
        {
            id: 'chat-1',
            messages: [{ role: 'user', content: 'q' }, bubble],
        },
    ];
}

describe('ArenaMessageBubble vote handling', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('marks the bubble voted=true after a successful POST (regression: stale-ref bug)', async () => {
        const bubble = makeBubble();
        let chats = makeChats(bubble);
        const setChats = vi.fn((updater) => { chats = updater(chats); });
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);

        render(
            <ArenaMessageBubble
                message={bubble}
                chatId="chat-1"
                setChats={setChats}
                isGenerating={false}
                question="q"
                messagesBeforeRound={[]}
            />,
        );

        const leftBtn = screen.getByText(/Левый|Left/i);
        await act(async () => {
            fireEvent.click(leftBtn);
        });

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        // Both setChats calls should have run: the optimistic namesRevealed
        // update AND the success voted update. Critically, the FINAL chat
        // state must show voted=true — proving the bubble id match worked.
        const finalBubble = chats[0].messages[1];
        expect(finalBubble.arenaData.voted).toBe(true);
        expect(finalBubble.arenaData.winner).toBe('a');
        expect(finalBubble.arenaData.namesRevealed).toBe(true);
    });

    it('keeps voted=false on POST failure so user can retry', async () => {
        const bubble = makeBubble();
        let chats = makeChats(bubble);
        const setChats = vi.fn((updater) => { chats = updater(chats); });
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
        vi.stubGlobal('fetch', fetchMock);

        render(
            <ArenaMessageBubble
                message={bubble}
                chatId="chat-1"
                setChats={setChats}
                isGenerating={false}
                question="q"
                messagesBeforeRound={[]}
            />,
        );

        const leftBtn = screen.getByText(/Левый|Left/i);
        await act(async () => {
            fireEvent.click(leftBtn);
        });

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        const finalBubble = chats[0].messages[1];
        expect(finalBubble.arenaData.voted).toBe(false);  // retry possible
        expect(finalBubble.arenaData.namesRevealed).toBe(true);  // names stay revealed
    });

    it('refuses to vote on a legacy bubble with no bubbleId', async () => {
        const bubble = makeBubble();
        delete bubble.arenaData.bubbleId;
        const setChats = vi.fn();
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        render(
            <ArenaMessageBubble
                message={bubble}
                chatId="chat-1"
                setChats={setChats}
                isGenerating={false}
                question="q"
                messagesBeforeRound={[]}
            />,
        );

        const leftBtn = screen.getByText(/Левый|Left/i);
        await act(async () => {
            fireEvent.click(leftBtn);
        });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Arena vote refused'),
        );
    });

    it('votes on the index the turn was stored under, not a recomputed one', async () => {
        // Simulates a chat restored from the server: round 1 failed and was
        // never posted, so this comparison — the third round — was stored
        // under index 2. A restored message array only ever holds the
        // comparisons that exist, so recomputing over it (arenaTurnIndex on
        // an empty messagesBeforeRound) would wrongly say 0.
        const bubble = {
            role: 'assistant',
            isArena: true,
            arenaData: {
                bubbleId: 'bubble-restored',
                turnIndex: 2,
                voted: false,
                winner: null,
                a: { model: 'qwen', kb: 'kb1', content: 'A' },
                b: { model: 'llama', kb: 'kb1', content: 'B' },
            },
        };
        const setChats = vi.fn();
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);

        render(
            <ArenaMessageBubble
                message={bubble}
                chatId="chat-1"
                setChats={setChats}
                isGenerating={false}
                question="q"
                messagesBeforeRound={[]}
            />,
        );

        const leftBtn = screen.getByText(/Левый|Left/i);
        await act(async () => {
            fireEvent.click(leftBtn);
        });

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        const [, options] = fetchMock.mock.calls[0];
        expect(JSON.parse(options.body)).toMatchObject({ turn_index: 2 });
    });

    it('falls back to the recomputed index for a comparison made in this session', async () => {
        // No stored turnIndex — this comparison was never restored, it was
        // just created live in this session — so the index must come from
        // counting arena rounds in messagesBeforeRound (one prior round here).
        const bubble = {
            role: 'assistant',
            isArena: true,
            arenaData: {
                bubbleId: 'bubble-fresh',
                voted: false,
                winner: null,
                a: { model: 'qwen', kb: 'kb1', content: 'A' },
                b: { model: 'llama', kb: 'kb1', content: 'B' },
            },
        };
        const before = [
            { role: 'user', content: 'q1' },
            { role: 'assistant', isArena: true, arenaData: { voted: true, winner: 'a', a: {}, b: {} } },
            { role: 'user', content: 'q2' },
        ];
        const setChats = vi.fn();
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);

        render(
            <ArenaMessageBubble
                message={bubble}
                chatId="chat-1"
                setChats={setChats}
                isGenerating={false}
                question="q"
                messagesBeforeRound={before}
            />,
        );

        const leftBtn = screen.getByText(/Левый|Left/i);
        await act(async () => {
            fireEvent.click(leftBtn);
        });

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        const [, options] = fetchMock.mock.calls[0];
        expect(JSON.parse(options.body)).toMatchObject({ turn_index: 1 });
    });
});
