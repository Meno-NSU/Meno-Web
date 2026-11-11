import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, fireEvent, screen, waitFor } from '@testing-library/react';
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

        fireEvent.click(screen.getByRole('button', { name: /good|хороший/i }));

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

        fireEvent.click(screen.getByRole('button', { name: /bad|плохой/i }));

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

        fireEvent.click(screen.getByRole('button', { name: /good|хороший/i }));

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
        fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });

        await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith({
            completionId: 'chatcmpl-1',
            sessionId: 'chat-1',
            value: 'up',
            comment: 'очень полезно',
        }));
        expect(setChats.lastResult[0].messages[1].feedback).toEqual({ value: 'up', comment: 'очень полезно' });
    });

    it('uses a 20 000 character multi-line textarea', () => {
        const message = { ...baseMessage, feedback: { value: 'up', comment: null } };
        const { container } = render(
            <MessageFeedback message={message} chatId="chat-1" setChats={makeSetChats(chatsWith(message))} />,
        );
        const input = container.querySelector('.feedback-comment-input');
        expect(input.tagName).toBe('TEXTAREA');
        expect(input.maxLength).toBe(20000);
        expect(container.querySelector('.feedback-comment-counter')).toBeNull();
        fireEvent.change(input, { target: { value: 'x'.repeat(18500) } });
        expect(container.querySelector('.feedback-comment-counter')).not.toBeNull();
    });

    it('does not submit on plain Enter', () => {
        const message = { ...baseMessage, feedback: { value: 'up', comment: null } };
        const { container } = render(
            <MessageFeedback message={message} chatId="chat-1" setChats={makeSetChats(chatsWith(message))} />,
        );
        const input = container.querySelector('.feedback-comment-input');
        fireEvent.change(input, { target: { value: 'line' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(submitFeedback).not.toHaveBeenCalled();
    });

    it('submits a long (5 000 char) comment whole via Ctrl+Enter', async () => {
        const message = { ...baseMessage, feedback: { value: 'down', comment: null } };
        const { container } = render(
            <MessageFeedback message={message} chatId="chat-1" setChats={makeSetChats(chatsWith(message))} />,
        );
        const long = 'абв\n'.repeat(1250).trim() + 'я'.repeat(1000);
        const input = container.querySelector('.feedback-comment-input');
        fireEvent.change(input, { target: { value: long } });
        fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
        await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith(
            expect.objectContaining({ comment: long.trim() }),
        ));
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

// Holds the chats in real state, so the component re-renders with what it patched, as in the app.
function Harness({ initial }) {
    const [chats, setChats] = useState(chatsWith(initial));
    return <MessageFeedback message={chats[0].messages[1]} chatId="chat-1" setChats={setChats} />;
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const good = () => screen.getByRole('button', { name: /good|хороший/i });
const bad = () => screen.getByRole('button', { name: /bad|плохой/i });

describe('MessageFeedback: the thumbs answer at once and only the final choice is saved', () => {
    it('lights the thumb at once and keeps both thumbs clickable while saving', () => {
        submitFeedback.mockReturnValueOnce(deferred().promise);
        render(<Harness initial={baseMessage} />);

        fireEvent.click(good());

        expect(good().getAttribute('aria-pressed')).toBe('true');
        expect(good().disabled).toBe(false);
        expect(bad().disabled).toBe(false);
    });

    it('sends only where rapid clicks end up, once the save in flight is done', async () => {
        const first = deferred();
        submitFeedback.mockReturnValueOnce(first.promise);
        render(<Harness initial={baseMessage} />);

        fireEvent.click(good()); // saving «up»…
        fireEvent.click(good()); // …then off, on again, and finally «down»
        fireEvent.click(good());
        fireEvent.click(bad());
        expect(submitFeedback).toHaveBeenCalledTimes(1);

        await act(async () => first.resolve({}));

        await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(2));
        expect(submitFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ value: 'down' }));
        expect(clearFeedback).not.toHaveBeenCalled();
        expect(bad().getAttribute('aria-pressed')).toBe('true');
    });

    it('sends nothing more when the clicks end where the saved rating is', async () => {
        const first = deferred();
        submitFeedback.mockReturnValueOnce(first.promise);
        render(<Harness initial={baseMessage} />);

        fireEvent.click(good());
        fireEvent.click(good());
        fireEvent.click(good());
        await act(async () => first.resolve({}));

        expect(submitFeedback).toHaveBeenCalledTimes(1);
        expect(clearFeedback).not.toHaveBeenCalled();
    });

    it('keeps what was written when the rating is cleared, and brings it back when rated again', async () => {
        render(<Harness initial={{ ...baseMessage, feedback: { value: 'down', comment: 'не тот год' } }} />);

        fireEvent.click(bad()); // off
        await waitFor(() => expect(clearFeedback).toHaveBeenCalledTimes(1));
        fireEvent.click(good());

        await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith({
            completionId: 'chatcmpl-1',
            sessionId: 'chat-1',
            value: 'up',
            comment: 'не тот год',
        }));
        expect(document.querySelector('.feedback-comment-input').value).toBe('не тот год');
        expect(document.querySelector('.feedback-comment-send').disabled).toBe(true);
    });

    it('puts the thumbs back and says so when the rating could not be saved', async () => {
        submitFeedback.mockRejectedValueOnce(Object.assign(new Error('Boom'), { httpStatus: 500 }));
        render(<Harness initial={baseMessage} />);

        fireEvent.click(good());

        expect(await screen.findByText(/не удалось сохранить/i)).toBeTruthy();
        expect(good().getAttribute('aria-pressed')).toBe('false');
    });

    it('keeps a comment that could not be sent in the field, to send again', async () => {
        submitFeedback.mockRejectedValueOnce(new Error('offline'));
        render(<Harness initial={{ ...baseMessage, feedback: { value: 'up', comment: null } }} />);
        const input = document.querySelector('.feedback-comment-input');

        fireEvent.change(input, { target: { value: 'очень полезно' } });
        fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });

        expect(await screen.findByText(/не удалось сохранить/i)).toBeTruthy();
        expect(input.value).toBe('очень полезно');
        expect(document.querySelector('.feedback-comment-send').disabled).toBe(false);
    });
});

describe('MessageFeedback ownership refusal (404)', () => {
    // The backend answers 404 (rather than a generic failure) when the caller does not
    // own the conversation — the realistic trigger is a chat started as a guest and rated
    // after signing in. buildError (src/services/api.js) attaches the HTTP status as
    // `httpStatus` on the thrown Error, which is what this mock reproduces.
    it('explains a 404 instead of showing a generic failure', async () => {
        submitFeedback.mockRejectedValueOnce(Object.assign(new Error('Not found'), { httpStatus: 404 }));
        render(<Harness initial={baseMessage} />);

        fireEvent.click(good());

        expect(await screen.findByText(/принадлежит другому профилю/i)).toBeTruthy();
        expect(screen.queryByText(/не удалось сохранить/i)).toBeNull();
        // The refused rating does not stay lit.
        expect(good().getAttribute('aria-pressed')).toBe('false');
    });

    it('clears the ownership notice on a fresh attempt', async () => {
        submitFeedback.mockRejectedValueOnce(Object.assign(new Error('Not found'), { httpStatus: 404 }));
        const setChats = makeSetChats(chatsWith(baseMessage));
        render(<MessageFeedback message={baseMessage} chatId="chat-1" setChats={setChats} />);

        fireEvent.click(screen.getByRole('button', { name: /good|хороший/i }));
        expect(await screen.findByText(/принадлежит другому профилю/i)).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /bad|плохой/i }));
        await waitFor(() => expect(screen.queryByText(/принадлежит другому профилю/i)).toBeNull());
    });
});
