import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, fireEvent, screen, waitFor } from '@testing-library/react';
import MessageFeedback from './MessageFeedback.jsx';
import { clearFeedback, submitFeedback } from '../services/api.js';
import { forgetFeedback, resetFeedbackSyncForTests } from '../services/feedbackSync.js';

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

const storedFeedback = (setChats) => setChats.lastResult?.[0].messages[1].feedback;

// Holds the chats in real state, so the component re-renders with what it stored, as in the app.
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
const commentInput = () => document.querySelector('.feedback-comment-input');
const send = (text) => {
    fireEvent.change(commentInput(), { target: { value: text } });
    fireEvent.keyDown(commentInput(), { key: 'Enter', ctrlKey: true });
};
const commentsSent = () => submitFeedback.mock.calls.map(([body]) => body.comment);

beforeEach(() => {
    vi.clearAllMocks();
    resetFeedbackSyncForTests();
});

describe('MessageFeedback', () => {
    it('submits a thumbs-up and stores it on the message once the server has it', async () => {
        const setChats = makeSetChats(chatsWith(baseMessage));
        render(<MessageFeedback message={baseMessage} chatId="chat-1" setChats={setChats} />);

        fireEvent.click(good());

        await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith({
            completionId: 'chatcmpl-1',
            sessionId: 'chat-1',
            value: 'up',
            comment: null,
            signal: expect.anything(),
        }));
        await waitFor(() => expect(storedFeedback(setChats)).toEqual({ value: 'up', comment: null }));
    });

    it('clears feedback when the active thumb is clicked again', async () => {
        const message = { ...baseMessage, feedback: { value: 'down', comment: null } };
        const setChats = makeSetChats(chatsWith(message));
        render(<MessageFeedback message={message} chatId="chat-1" setChats={setChats} />);

        fireEvent.click(bad());

        await waitFor(() => expect(clearFeedback).toHaveBeenCalledWith({
            completionId: 'chatcmpl-1',
            sessionId: 'chat-1',
            signal: expect.anything(),
        }));
        await waitFor(() => expect(storedFeedback(setChats)).toBeNull());
    });

    it('switches the thumb via a fresh submit (upsert)', async () => {
        const message = { ...baseMessage, feedback: { value: 'down', comment: 'meh' } };
        const setChats = makeSetChats(chatsWith(message));
        render(<MessageFeedback message={message} chatId="chat-1" setChats={setChats} />);

        fireEvent.click(good());

        await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith({
            completionId: 'chatcmpl-1',
            sessionId: 'chat-1',
            value: 'up',
            comment: 'meh',
            signal: expect.anything(),
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
        render(<MessageFeedback message={message} chatId="chat-1" setChats={setChats} />);

        send('очень полезно');

        await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith({
            completionId: 'chatcmpl-1',
            sessionId: 'chat-1',
            value: 'up',
            comment: 'очень полезно',
            signal: expect.anything(),
        }));
        await waitFor(() => expect(storedFeedback(setChats)).toEqual({ value: 'up', comment: 'очень полезно' }));
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
        const sendButton = container.querySelector('.feedback-comment-send');
        expect(sendButton.disabled).toBe(true);
    });
});

describe('MessageFeedback: the thumbs answer at once and only the final choice is saved', () => {
    it('lights the thumb at once and keeps both thumbs clickable while saving', () => {
        submitFeedback.mockReturnValueOnce(deferred().promise);
        render(<Harness initial={baseMessage} />);

        fireEvent.click(good());

        expect(good().getAttribute('aria-pressed')).toBe('true');
        expect(good().disabled).toBe(false);
        expect(bad().disabled).toBe(false);
    });

    it('stores on the message only what the server confirmed', async () => {
        const first = deferred();
        submitFeedback.mockReturnValueOnce(first.promise);
        const setChats = makeSetChats(chatsWith(baseMessage));
        render(<MessageFeedback message={baseMessage} chatId="chat-1" setChats={setChats} />);

        fireEvent.click(good());
        expect(setChats).not.toHaveBeenCalled(); // a reload now would not show a rating the server never got

        await act(async () => first.resolve({}));
        expect(storedFeedback(setChats)).toEqual({ value: 'up', comment: null });
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

    it('sends every comment the person sent, even while a save is in flight', async () => {
        const first = deferred();
        submitFeedback.mockReturnValueOnce(first.promise);
        render(<Harness initial={{ ...baseMessage, feedback: { value: 'up', comment: null } }} />);

        fireEvent.click(bad()); // in flight
        send('A');
        send('A, and more');
        await act(async () => first.resolve({}));

        await waitFor(() => expect(commentsSent()).toEqual([null, 'A', 'A, and more']));
        expect(submitFeedback.mock.calls.map(([body]) => body.value)).toEqual(['down', 'down', 'down']);
    });

    it('sends a comment even if the rating is cleared before it went out, and brings it back on rating again', async () => {
        const first = deferred();
        submitFeedback.mockReturnValueOnce(first.promise);
        render(<Harness initial={{ ...baseMessage, feedback: { value: 'up', comment: null } }} />);

        fireEvent.click(bad()); // in flight
        send('A');
        fireEvent.click(bad()); // off, before «A» went out
        await act(async () => first.resolve({}));
        await waitFor(() => expect(clearFeedback).toHaveBeenCalledTimes(1));
        expect(commentsSent()).toEqual([null, 'A']);

        fireEvent.click(good());
        await waitFor(() => expect(submitFeedback).toHaveBeenLastCalledWith(
            expect.objectContaining({ value: 'up', comment: 'A' }),
        ));
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
            signal: expect.anything(),
        }));
        expect(commentInput().value).toBe('не тот год');
        expect(document.querySelector('.feedback-comment-send').disabled).toBe(true);
    });

    it('puts the thumbs back and says so when the rating could not be saved', async () => {
        submitFeedback.mockRejectedValueOnce(Object.assign(new Error('Boom'), { httpStatus: 500 }));
        render(<Harness initial={baseMessage} />);

        fireEvent.click(good());

        expect(await screen.findByText(/не удалось сохранить оценку/i)).toBeTruthy();
        expect(good().getAttribute('aria-pressed')).toBe('false');
    });

    it('keeps a comment that could not be sent in the field, and says it was the comment', async () => {
        submitFeedback.mockRejectedValueOnce(new Error('offline'));
        render(<Harness initial={{ ...baseMessage, feedback: { value: 'up', comment: null } }} />);

        send('очень полезно');

        expect(await screen.findByText(/не удалось отправить комментарий/i)).toBeTruthy();
        expect(commentInput().value).toBe('очень полезно');
        expect(document.querySelector('.feedback-comment-send').disabled).toBe(false);
    });

    it('asks before the page is left while a comment is still on its way', async () => {
        const first = deferred();
        submitFeedback.mockReturnValueOnce(first.promise);
        render(<Harness initial={{ ...baseMessage, feedback: { value: 'up', comment: null } }} />);
        const leave = () => {
            const event = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(event);
            return event.defaultPrevented;
        };

        expect(leave()).toBe(false);
        send('важное');
        expect(leave()).toBe(true);
        await act(async () => first.resolve({}));
        expect(leave()).toBe(false);
    });
});

// The chats live above the control, as in the app, so they survive it being hidden and shown again (a chat switch).
function Switcher({ initial, shown }) {
    const [chats, setChats] = useState(() => chatsWith(initial));
    return shown ? <MessageFeedback message={chats[0].messages[1]} chatId="chat-1" setChats={setChats} /> : null;
}

function switchAwayAndBack(initial) {
    const view = render(<Switcher initial={initial} shown />);
    return {
        away: () => view.rerender(<Switcher initial={initial} shown={false} />),
        back: () => view.rerender(<Switcher initial={initial} shown />),
    };
}

describe('MessageFeedback after a remount (chat switch) while saving', () => {
    it('joins the save already running instead of starting a second one', async () => {
        const first = deferred();
        submitFeedback.mockReturnValueOnce(first.promise);
        const view = switchAwayAndBack(baseMessage);
        fireEvent.click(good()); // in flight
        view.away();
        view.back();

        expect(good().getAttribute('aria-pressed')).toBe('true'); // what was chosen, not the stored nothing
        fireEvent.click(good()); // off
        expect(clearFeedback).not.toHaveBeenCalled(); // waits for the save in flight

        await act(async () => first.resolve({}));
        await waitFor(() => expect(clearFeedback).toHaveBeenCalledTimes(1));
        expect(submitFeedback).toHaveBeenCalledTimes(1);
        expect(good().getAttribute('aria-pressed')).toBe('false');
    });

    it('tells the mounted instance when the save started before the switch fails', async () => {
        const first = deferred();
        submitFeedback.mockReturnValueOnce(first.promise);
        const view = switchAwayAndBack(baseMessage);
        fireEvent.click(good());
        view.away();
        view.back();

        await act(async () => first.reject(Object.assign(new Error('Boom'), { httpStatus: 502 })));

        expect(await screen.findByText(/не удалось сохранить оценку/i)).toBeTruthy();
        expect(good().getAttribute('aria-pressed')).toBe('false');
    });

    it('shows a failure that happened while the answer was not on screen once it is back', async () => {
        const first = deferred();
        submitFeedback.mockReturnValueOnce(first.promise);
        const view = switchAwayAndBack(baseMessage);
        fireEvent.click(good());
        view.away();
        await act(async () => first.reject(Object.assign(new Error('Boom'), { httpStatus: 502 })));
        view.back();

        expect(await screen.findByText(/не удалось сохранить оценку/i)).toBeTruthy();
        expect(good().getAttribute('aria-pressed')).toBe('false');
    });

    it('brings a cleared comment back on rating again after the switch', async () => {
        const view = switchAwayAndBack({ ...baseMessage, feedback: { value: 'down', comment: 'не тот год' } });
        fireEvent.click(bad()); // off
        await waitFor(() => expect(clearFeedback).toHaveBeenCalledTimes(1));
        view.away();
        view.back();

        fireEvent.click(good());

        await waitFor(() => expect(submitFeedback).toHaveBeenLastCalledWith(
            expect.objectContaining({ value: 'up', comment: 'не тот год' }),
        ));
        expect(commentInput().value).toBe('не тот год');
    });
});

describe('MessageFeedback: a comment that could not go out is not lost', () => {
    const boom = () => Object.assign(new Error('Boom'), { httpStatus: 500 });
    const leave = () => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
    };

    it('keeps a comment queued behind a failed rating, says so, and sends it on the next Send', async () => {
        const first = deferred();
        submitFeedback.mockReturnValueOnce(first.promise);
        render(<Harness initial={{ ...baseMessage, feedback: { value: 'up', comment: null } }} />);

        fireEvent.click(bad()); // in flight, will fail
        send('A');
        await act(async () => first.reject(boom()));

        expect(await screen.findByText(/не удалось отправить комментарий/i)).toBeTruthy();
        expect(leave()).toBe(true); // still unsent: leaving asks first
        expect(commentInput().value).toBe('A');

        fireEvent.click(document.querySelector('.feedback-comment-send'));
        await waitFor(() => expect(submitFeedback).toHaveBeenLastCalledWith(
            expect.objectContaining({ value: 'up', comment: 'A' }),
        ));
        expect(commentsSent()).toContain('A');
        await waitFor(() => expect(leave()).toBe(false));
    });

    it('keeps every queued comment when the first of them fails, and sends them all on the next click', async () => {
        const first = deferred();
        submitFeedback.mockReturnValueOnce(first.promise);
        render(<Harness initial={{ ...baseMessage, feedback: { value: 'up', comment: null } }} />);

        send('A'); // in flight, will fail
        send('B');
        await act(async () => first.reject(boom()));
        expect(await screen.findByText(/не удалось отправить комментарий/i)).toBeTruthy();

        fireEvent.click(good()); // off: the queued comments go out first
        await waitFor(() => expect(clearFeedback).toHaveBeenCalledTimes(1));
        expect(commentsSent()).toEqual(['A', 'A', 'B']);
    });

    it('calls a failed re-rating after a clear a rating failure, not a comment one', async () => {
        render(<Harness initial={{ ...baseMessage, feedback: { value: 'down', comment: 'X' } }} />);
        fireEvent.click(bad()); // off
        await waitFor(() => expect(clearFeedback).toHaveBeenCalledTimes(1));

        submitFeedback.mockRejectedValueOnce(boom());
        fireEvent.click(good()); // carries «X» back, fails

        expect(await screen.findByText(/не удалось сохранить оценку/i)).toBeTruthy();
        expect(screen.queryByText(/не удалось отправить комментарий/i)).toBeNull();
    });

    it('drops a comment the server refuses for good (not this person\'s conversation)', async () => {
        submitFeedback.mockRejectedValueOnce(Object.assign(new Error('Not found'), { httpStatus: 404 }));
        render(<Harness initial={{ ...baseMessage, feedback: { value: 'up', comment: null } }} />);

        send('A');

        expect(await screen.findByText(/принадлежит другому профилю/i)).toBeTruthy();
        expect(leave()).toBe(false);
    });
});

describe('MessageFeedback: forgetting (sign-out, deleting a chat or one\'s data)', () => {
    const untilAborted = ({ signal }) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });

    it('aborts what is in flight and sends nothing queued for the chat', async () => {
        submitFeedback.mockImplementationOnce(untilAborted);
        const setChats = makeSetChats(chatsWith({ ...baseMessage, feedback: { value: 'up', comment: null } }));
        render(
            <MessageFeedback
                message={{ ...baseMessage, feedback: { value: 'up', comment: null } }}
                chatId="chat-1"
                setChats={setChats}
            />,
        );

        fireEvent.click(bad()); // in flight
        send('A'); // queued
        await act(async () => forgetFeedback('chat-1'));

        expect(submitFeedback).toHaveBeenCalledTimes(1);
        expect(setChats).not.toHaveBeenCalled(); // nothing is stored for the forgotten chat
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('leaves the answers of other chats alone', async () => {
        const first = deferred();
        submitFeedback.mockReturnValueOnce(first.promise);
        render(<Harness initial={baseMessage} />);

        fireEvent.click(good());
        forgetFeedback('another-chat');
        await act(async () => first.resolve({}));

        expect(good().getAttribute('aria-pressed')).toBe('true');
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
        render(<Harness initial={baseMessage} />);

        fireEvent.click(good());
        expect(await screen.findByText(/принадлежит другому профилю/i)).toBeTruthy();

        fireEvent.click(bad());
        await waitFor(() => expect(screen.queryByText(/принадлежит другому профилю/i)).toBeNull());
    });
});
