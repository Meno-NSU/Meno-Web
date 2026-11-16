import { useCallback, useEffect, useRef, useState } from 'react';
import { THANKS_MS } from './FeedbackStatus.jsx';

// An answer that is sent once — an arena vote, the end-of-session survey — and what the person
// sees of it: idle → pending → sent (with the thanks for THANKS_MS) | failed (an error; `retry`
// re-sends the same answer). Success is shown only after the server confirmed it. (The 👍/👎
// and comments of an answer can change any time and sync in services/feedbackSync.js instead.)
//
// `run(write, { tag })` calls `write()` — an async function that posts and, once the post
// resolved, applies the result to the chat; `tag` names the control that sent it (it shows the
// pending state). While a write is in flight every other `run` is dropped — a ref, not state, so
// two clicks in the same tick cannot both get through — and so is every write after a confirmed
// one. A failure allows another try.
//
// A 404 means the conversation belongs to another profile (a chat started as a guest and voted
// on after signing in): retrying cannot help, so it gets `notYoursKey` and no retry.
const IDLE = { status: 'idle', tag: null, thanks: false, error: null };

export function useOneShotSend({ failedKey, notYoursKey }) {
    const [state, setState] = useState(IDLE);
    const busyRef = useRef(false);
    const doneRef = useRef(false);
    const lastRef = useRef(null);
    const timerRef = useRef(null);

    useEffect(() => () => clearTimeout(timerRef.current), []);

    const run = useCallback(async (write, { tag = null } = {}) => {
        if (busyRef.current || doneRef.current) return false;
        busyRef.current = true;
        lastRef.current = { write, tag };
        setState({ status: 'pending', tag, thanks: false, error: null });
        try {
            await write();
        } catch (e) {
            console.warn('Feedback not recorded:', e);
            busyRef.current = false;
            const notYours = e?.httpStatus === 404 && notYoursKey;
            setState({
                status: 'failed',
                tag,
                thanks: false,
                error: notYours ? { key: notYoursKey, canRetry: false } : { key: failedKey, canRetry: true },
            });
            return false;
        }
        busyRef.current = false;
        doneRef.current = true;
        setState({ status: 'sent', tag, thanks: true, error: null });
        timerRef.current = setTimeout(() => setState((s) => ({ ...s, thanks: false })), THANKS_MS);
        return true;
    }, [failedKey, notYoursKey]);

    const retry = useCallback(() => {
        const last = lastRef.current;
        return last ? run(last.write, { tag: last.tag }) : Promise.resolve(false);
    }, [run]);

    return { ...state, pending: state.status === 'pending', run, retry };
}
