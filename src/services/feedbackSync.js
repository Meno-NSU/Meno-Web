// Keeps each answer's 👍/👎 and comment in step with the server, for the page's lifetime.
//
// One entry per answer (chat id + completion id), outside React, so a MessageFeedback that remounts (chat switch,
// view change) joins the save already running instead of starting a second one from stale state.
//
// - A rating is the current opinion: thumb clicks only move `wanted`, and the server is brought to the last one by
//   one request at a time, so fast clicking sends only where it ends up.
// - A comment the person sends is never coalesced away: it waits in `outbox` and goes out with the rating it was
//   sent with, before the thumbs are settled. While one is unsent, leaving the page asks first.
// - Only what the server confirmed reaches `io.confirm` (the message's stored feedback, persisted for guests).
// - On a failure the thumbs go back to what is saved. Unsent comments stay queued (and the page still asks before
//   it is left) until the next click or Send retries them; only a refusal (404: not this person's conversation)
//   drops them, since retrying cannot help.
// - forgetFeedback (sign-out, deleting a chat or one's data) aborts what is in flight and forgets the entries, so
//   nothing queued is written after the person, or the conversation, is gone.

const SAVE_TIMEOUT_MS = 30000;

const entries = new Map();
let unloadGuarded = false;

export const sameFeedback = (a, b) => (
    a === b || (Boolean(a) && Boolean(b) && a.value === b.value && (a.comment ?? null) === (b.comment ?? null))
);

function warnBeforeUnload(event) {
    event.preventDefault();
    event.returnValue = '';
}

function updateUnloadGuard() {
    if (typeof window === 'undefined') return;
    const unsent = [...entries.values()].some((e) => e.outbox.length > 0);
    if (unsent && !unloadGuarded) window.addEventListener('beforeunload', warnBeforeUnload);
    if (!unsent && unloadGuarded) window.removeEventListener('beforeunload', warnBeforeUnload);
    unloadGuarded = unsent;
}

const changed = (entry) => entry.watchers.forEach((watch) => watch());

function emit(entry, event) {
    if (entry.listeners.size > 0) entry.listeners.forEach((listen) => listen(event));
    else entry.unseen = event; // shown when the answer's control is mounted again
}

// The entry for an answer, created from the stored feedback the first time it is asked for. A later change of the
// stored feedback that did not come from here (the conversation loaded again) is taken while nothing is being saved.
export function feedbackEntry(key, stored) {
    let entry = entries.get(key);
    if (!entry) {
        entry = {
            saved: stored,
            wanted: stored,
            seen: stored, // the stored feedback last passed in
            outbox: [],
            saving: false,
            controller: null,
            forgotten: false,
            kept: stored?.comment || null, // the last comment sent: outlives a cleared rating
            unseen: null,
            watchers: new Set(),
            listeners: new Set(),
        };
        entries.set(key, entry);
    } else if (!sameFeedback(stored, entry.seen)) {
        entry.seen = stored;
        const idle = !entry.saving && entry.outbox.length === 0 && sameFeedback(entry.wanted, entry.saved);
        if (idle && !sameFeedback(stored, entry.saved)) {
            entry.saved = stored;
            entry.wanted = stored;
            if (stored?.comment) entry.kept = stored.comment;
        }
    }
    return entry;
}

// For useSyncExternalStore: re-render when what is shown changes.
export function watchFeedback(entry, onChange) {
    entry.watchers.add(onChange);
    return () => entry.watchers.delete(onChange);
}

// Events for the mounted control: { type: 'sent' } once the sent comments are on the server,
// { type: 'failed', error, what: 'rating' | 'comment' } when a save fails (delivered on mount if it failed unseen).
export function listenFeedback(entry, onEvent) {
    entry.listeners.add(onEvent);
    if (entry.unseen) {
        const event = entry.unseen;
        entry.unseen = null;
        onEvent(event);
    }
    return () => entry.listeners.delete(onEvent);
}

async function attempt(entry, send) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
    entry.controller = controller;
    try {
        await send(controller.signal);
    } finally {
        clearTimeout(timer);
        entry.controller = null;
    }
}

async function pump(entry, io) {
    if (entry.saving || entry.forgotten) return; // a running loop picks up whatever is wanted by now
    entry.saving = true;
    try {
        for (;;) {
            const fromOutbox = entry.outbox.length > 0;
            let target;
            if (fromOutbox) target = entry.outbox[0];
            else if (!sameFeedback(entry.wanted, entry.saved)) target = entry.wanted;
            else break;
            await attempt(entry, (signal) => (target ? io.submit(target, signal) : io.clear(signal)));
            if (entry.forgotten) return;
            entry.saved = target;
            if (fromOutbox) entry.outbox.shift();
            io.confirm(target);
            if (fromOutbox && entry.outbox.length === 0) {
                updateUnloadGuard();
                emit(entry, { type: 'sent' });
            }
        }
    } catch (error) {
        if (entry.forgotten) return;
        const what = entry.outbox.length > 0 ? 'comment' : 'rating';
        if (error?.httpStatus === 404) entry.outbox = [];
        entry.wanted = entry.saved;
        updateUnloadGuard();
        changed(entry);
        emit(entry, { type: 'failed', error, what });
    } finally {
        entry.saving = false;
    }
}

// A click on a thumb: the active one clears the rating, the other one sets it; the comment rides along, and after
// a clear the last comment sent comes back with the new rating.
export function clickThumb(entry, value, io) {
    const current = entry.wanted;
    entry.wanted = current?.value === value ? null : { value, comment: current?.comment ?? entry.kept };
    changed(entry);
    pump(entry, io);
}

// The person sends a comment on the current rating. Returns false when there is nothing new to send.
export function sendComment(entry, comment, io) {
    const current = entry.wanted;
    if (!current || !comment || comment === (current.comment || '')) return false;
    const item = { value: current.value, comment };
    entry.outbox.push(item);
    entry.wanted = item;
    entry.kept = comment;
    updateUnloadGuard();
    changed(entry);
    pump(entry, io);
    return true;
}

// Abort and forget the answers of one chat, or of every chat: nothing queued is sent any more.
export function forgetFeedback(chatId = null) {
    for (const [key, entry] of entries) {
        if (chatId !== null && !key.startsWith(`${chatId}|`)) continue;
        entry.forgotten = true;
        entry.outbox = [];
        entry.controller?.abort();
        entries.delete(key);
    }
    updateUnloadGuard();
}

export function resetFeedbackSyncForTests() {
    forgetFeedback();
}
