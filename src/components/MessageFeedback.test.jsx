import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import MessageFeedback from './MessageFeedback.jsx';
import { clearFeedback, submitFeedback } from '../services/api.js';

vi.mock('../services/api.js', () => ({
    submitFeedback: vi.fn().mockResolvedValue({}),
    clearFeedback: vi.fn().mockResolvedValue({}),
}));

function makeSetChats(chats) {
    // Captures the functional update the component applies so tests can
    // assert on the patched chat state.
    const setChats = vi.fn((updater) => {
        setChats.lastResult = updater(chats);
    });
    return setChats;
}

const baseMessage = {
    role: 'assistant',
    content: 'answer',
    completionId: 'chatcmpl-1',
};

function chatsWith(message) {
    return [{ id: 'chat-1', messages: [{ role: 'user', content: 'q' }, message] }];
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('MessageFeedback', () => {
    it('submits a thumbs-up and patches the message optimistically', async () => {
        const setChats = makeSetChats(chatsWith(baseMessage));
        render(<MessageFeedback message={baseMessage} chatId="chat-1" setChats={setChats} />);

        fireEvent.click(screen.getByTitle(/good|хороший/i));

        await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith({
            completionId: 'chatcmpl-1',
            sessionId: 'chat-1',
            value: 'up',
            comment: null,
        }));
        const patched = setChats.lastResult[0].messages[1];
        expect(patched.feedback).toEqual({ value: 'up', comment: null });
    });

    it('clears feedback when the active thumb is clicked again', async () => {
        const message = { ...baseMessage, feedback: { value: 'down', comment: null } };
        const setChats = makeSetChats(chatsWith(message));
        render(<MessageFeedback message={message} chatId="chat-1" setChats={setChats} />);

        fireEvent.click(screen.getByTitle(/bad|плохой/i));

        await waitFor(() => expect(clearFeedback).toHaveBeenCalledWith({
            completionId: 'chatcmpl-1',
            sessionId: 'chat-1',
        }));
        expect(setChats.lastResult[0].messages[1].feedback).toBeNull();
    });

    it('switches the thumb via a fresh submit (upsert)', async () => {
        const message = { ...baseMessage, feedback: { value: 'down', comment: 'meh' } };
        const setChats = makeSetChats(chatsWith(message));
        render(<MessageFeedback message={message} chatId="chat-1" setChats={setChats} />);

        fireEvent.click(screen.getByTitle(/good|хороший/i));

        await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith({
            completionId: 'chatcmpl-1',
            sessionId: 'chat-1',
            value: 'up',
            comment: 'meh',
        }));
        expect(clearFeedback).not.toHaveBeenCalled();
    });

    it('shows the comment input only once a thumb is chosen and sends the comment', async () => {
        const noFeedback = render(
            <MessageFeedback message={baseMessage} chatId="chat-1" setChats={makeSetChats(chatsWith(baseMessage))} />,
        );
        expect(noFeedback.container.querySelector('.feedback-comment-input')).toBeNull();
        noFeedback.unmount();

        const message = { ...baseMessage, feedback: { value: 'up', comment: null } };
        const setChats = makeSetChats(chatsWith(message));
        const { container } = render(<MessageFeedback message={message} chatId="chat-1" setChats={setChats} />);

        const input = container.querySelector('.feedback-comment-input');
        fireEvent.change(input, { target: { value: 'очень полезно' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith({
            completionId: 'chatcmpl-1',
            sessionId: 'chat-1',
            value: 'up',
            comment: 'очень полезно',
        }));
        expect(setChats.lastResult[0].messages[1].feedback).toEqual({ value: 'up', comment: 'очень полезно' });
    });

    it('does not re-send an unchanged comment', () => {
        const message = { ...baseMessage, feedback: { value: 'up', comment: 'same' } };
        const { container } = render(
            <MessageFeedback message={message} chatId="chat-1" setChats={makeSetChats(chatsWith(message))} />,
        );
        const send = container.querySelector('.feedback-comment-send');
        expect(send.disabled).toBe(true);
    });
});

describe('MessageFeedback ownership refusal (404)', () => {
    // The backend answers 404 (rather than a generic failure) when the caller does not
    // own the conversation — the realistic trigger is a chat started as a guest and rated
    // after signing in. buildError (src/services/api.js) attaches the HTTP status as
    // `httpStatus` on the thrown Error, which is what this mock reproduces.
    it('explains a 404 instead of showing a generic failure', async () => {
        submitFeedback.mockRejectedValueOnce(Object.assign(new Error('Not found'), { httpStatus: 404 }));
        const setChats = makeSetChats(chatsWith(baseMessage));
        render(<MessageFeedback message={baseMessage} chatId="chat-1" setChats={setChats} />);

        fireEvent.click(screen.getByTitle(/good|хороший/i));

        expect(await screen.findByText(/принадлежит другому профилю/i)).toBeTruthy();
        // The refused rating was never applied — no optimistic patch happened.
        expect(setChats.lastResult).toBeUndefined();
    });

    it('leaves a non-404 failure exactly as before (no ownership message)', async () => {
        submitFeedback.mockRejectedValueOnce(Object.assign(new Error('Boom'), { httpStatus: 500 }));
        const setChats = makeSetChats(chatsWith(baseMessage));
        const { container } = render(<MessageFeedback message={baseMessage} chatId="chat-1" setChats={setChats} />);

        fireEvent.click(screen.getByTitle(/good|хороший/i));

        await waitFor(() => expect(submitFeedback).toHaveBeenCalled());
        expect(container.querySelector('.feedback-error')).toBeNull();
    });

    it('clears the ownership notice on a fresh attempt', async () => {
        submitFeedback.mockRejectedValueOnce(Object.assign(new Error('Not found'), { httpStatus: 404 }));
        const setChats = makeSetChats(chatsWith(baseMessage));
        render(<MessageFeedback message={baseMessage} chatId="chat-1" setChats={setChats} />);

        fireEvent.click(screen.getByTitle(/good|хороший/i));
        expect(await screen.findByText(/принадлежит другому профилю/i)).toBeTruthy();

        fireEvent.click(screen.getByTitle(/bad|плохой/i));
        await waitFor(() => expect(screen.queryByText(/принадлежит другому профилю/i)).toBeNull());
    });
});
