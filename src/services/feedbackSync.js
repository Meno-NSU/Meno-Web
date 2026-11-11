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
// - On a failure the screen goes back to what is saved and the unsent comments are dropped (the field keeps the text).

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
const emit = (entry, event) => entry.listeners.forEach((listen) => listen(event));

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
            kept: stored?.comment || null, // the last comment sent: outlives a cleared rating
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
export function watchFeedback(key, onChange) {
    const entry = entries.get(key);
    entry.watchers.add(onChange);
    return () => entry.watchers.delete(onChange);
}

// Events for the mounted instance: { type: 'sent' } once a sent comment is on the server,
// { type: 'failed', error, what: 'rating' | 'comment' } when a save fails.
export function listenFeedback(key, onEvent) {
    const entry = entries.get(key);
    entry.listeners.add(onEvent);
    return () => entry.listeners.delete(onEvent);
}

async function pump(entry, io) {
    if (entry.saving) return; // the running loop picks up whatever is wanted by now
    entry.saving = true;
    let target = null;
    let fromOutbox = false;
    try {
        for (;;) {
            fromOutbox = entry.outbox.length > 0;
            if (fromOutbox) target = entry.outbox[0];
            else if (!sameFeedback(entry.wanted, entry.saved)) target = entry.wanted;
            else break;
            if (target) await io.submit(target);
            else await io.clear();
            entry.saved = target;
            if (fromOutbox) entry.outbox.shift();
            io.confirm(target);
            if (fromOutbox && entry.outbox.length === 0) {
                updateUnloadGuard();
                emit(entry, { type: 'sent' });
            }
        }
    } catch (error) {
        const what = fromOutbox || (target?.comment && target.comment !== entry.saved?.comment) ? 'comment' : 'rating';
        entry.outbox = [];
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
export function clickThumb(key, value, io) {
    const entry = entries.get(key);
    const current = entry.wanted;
    entry.wanted = current?.value === value ? null : { value, comment: current?.comment ?? entry.kept };
    changed(entry);
    pump(entry, io);
}

// The person sends a comment on the current rating. Returns false when there is nothing new to send.
export function sendComment(key, comment, io) {
    const entry = entries.get(key);
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

export function resetFeedbackSyncForTests() {
    entries.clear();
    updateUnloadGuard();
}
