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
//   it is left) until the next click, Send or retrySave (which also brings back the choice that failed) retries
//   them; only a refusal (404: not this person's conversation) drops them, since retrying cannot help.
// - When the server has the final choice (nothing left to send), the control hears { type: 'saved' }: that is
//   when it says «sent» and thanks — never for a click that is still on its way.
// - forgetFeedback (sign-out, deleting a chat or one's data) drops what is queued and forgets the entries; it lets
//   the request already on its way finish (its outcome is ignored) and resolves when it has, so a deletion sent
//   after it cannot be overtaken by a write.

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

// What a control renders: a fresh object on every change (a forgotten entry included), so React never discards the
// render that moves a control onto a new entry just because the rating it shows is the same. `feedback` is the
// person's current choice (shown at once), `saved` what the server has, `saving` whether a save is running, and
// `unsent` whether sent comments still wait to go out.
const freshView = (entry) => {
    const live = !entry.forgotten;
    entry.view = {
        feedback: live ? entry.wanted : null,
        saved: live ? entry.saved : null,
        saving: live && entry.saving,
        unsent: live && entry.outbox.length > 0,
    };
};

const changed = (entry) => {
    freshView(entry);
    entry.watchers.forEach((watch) => watch());
};

// A failure nobody saw is shown when the answer's control is mounted again; a late «saved» is not (no thanks for
// something the person has long moved away from).
function emit(entry, event) {
    if (entry.listeners.size > 0) entry.listeners.forEach((listen) => listen(event));
    else if (event.type === 'failed') entry.unseen = event;
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
            inflight: null, // the request on its way, settled or not
            forgotten: false,
            kept: stored?.comment || null, // the last comment sent: outlives a cleared rating
            retry: undefined, // what was wanted when a save failed, for retrySave
            unseen: null,
            watchers: new Set(),
            listeners: new Set(),
        };
        freshView(entry);
        entries.set(key, entry);
    } else if (!sameFeedback(stored, entry.seen)) {
        entry.seen = stored;
        const idle = !entry.saving && entry.outbox.length === 0 && sameFeedback(entry.wanted, entry.saved);
        if (idle && !sameFeedback(stored, entry.saved)) {
            entry.saved = stored;
            entry.wanted = stored;
            if (stored?.comment) entry.kept = stored.comment;
            freshView(entry); // read by this very render; no one else needs telling
        }
    }
    return entry;
}

// For useSyncExternalStore: re-render when what is shown changes.
export function watchFeedback(entry, onChange) {
    entry.watchers.add(onChange);
    return () => entry.watchers.delete(onChange);
}

// Events for the mounted control: { type: 'saved', thank } once the server has the final choice — `thank` unless
// all that happened was taking a rating back — and { type: 'failed', error, what: 'rating' | 'comment' } when a
// save fails (delivered on mount if it failed unseen).
export function listenFeedback(entry, onEvent) {
    entry.listeners.add(onEvent);
    if (entry.unseen) {
        const event = entry.unseen;
        entry.unseen = null;
        onEvent(event);
    }
    return () => entry.listeners.delete(onEvent);
}

// One request, given up after SAVE_TIMEOUT_MS (a hung save would hold back every later click on the answer).
async function attempt(entry, send) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
    const request = send(controller.signal);
    entry.inflight = request;
    try {
        await request;
    } finally {
        clearTimeout(timer);
        if (entry.inflight === request) entry.inflight = null;
    }
}

async function pump(entry, io) {
    if (entry.saving || entry.forgotten) return; // a running loop picks up whatever is wanted by now
    entry.saving = true;
    changed(entry);
    let sentSomething = false;
    let deliveredComment = false;
    try {
        for (;;) {
            const fromOutbox = entry.outbox.length > 0;
            let target;
            if (fromOutbox) target = entry.outbox[0];
            else if (!sameFeedback(entry.wanted, entry.saved)) target = entry.wanted;
            else break;
            await attempt(entry, (signal) => (target ? io.submit(target, signal) : io.clear(signal)));
            if (entry.forgotten) return;
            sentSomething = true;
            entry.saved = target;
            if (fromOutbox) {
                entry.outbox.shift();
                deliveredComment = true;
                if (entry.outbox.length === 0) updateUnloadGuard();
            }
            io.confirm(target);
        }
        if (sentSomething) emit(entry, { type: 'saved', thank: Boolean(entry.saved) || deliveredComment });
    } catch (error) {
        if (entry.forgotten) return;
        const what = entry.outbox.length > 0 ? 'comment' : 'rating';
        if (error?.httpStatus === 404) {
            entry.outbox = [];
            entry.retry = undefined;
        } else {
            entry.retry = entry.wanted;
        }
        entry.wanted = entry.saved;
        updateUnloadGuard();
        emit(entry, { type: 'failed', error, what });
    } finally {
        entry.saving = false;
        if (!entry.forgotten) changed(entry);
    }
}

// A click on a thumb: the active one clears the rating, the other one sets it; the comment rides along, and after
// a clear the last comment sent comes back with the new rating.
export function clickThumb(entry, value, io) {
    entry.retry = undefined;
    const current = entry.wanted;
    entry.wanted = current?.value === value ? null : { value, comment: current?.comment ?? entry.kept };
    changed(entry);
    pump(entry, io);
}

// The person sends a comment on the current rating. Returns false when there is nothing new to send.
export function sendComment(entry, comment, io) {
    const current = entry.wanted;
    if (!current || !comment || comment === (current.comment || '')) return false;
    entry.retry = undefined;
    const item = { value: current.value, comment };
    entry.outbox.push(item);
    entry.wanted = item;
    entry.kept = comment;
    updateUnloadGuard();
    changed(entry);
    pump(entry, io);
    return true;
}

// «Повторить» after a failed save: bring back what was wanted when it failed and send it, comments queued first.
export function retrySave(entry, io) {
    if (entry.forgotten || entry.saving) return;
    if (entry.retry !== undefined) {
        entry.wanted = entry.retry;
        entry.retry = undefined;
    }
    changed(entry);
    pump(entry, io);
}

// Forget the answers of one chat, or of every chat: nothing queued is sent any more. Resolves once the requests
// already on their way have finished. A control still on screen is told, so it takes a fresh entry.
export function forgetFeedback(chatId = null) {
    const inflight = [];
    for (const [key, entry] of entries) {
        if (chatId !== null && !key.startsWith(`${chatId}|`)) continue;
        entry.forgotten = true;
        entry.outbox = [];
        if (entry.inflight) inflight.push(entry.inflight.catch(() => {}));
        entries.delete(key);
        changed(entry);
    }
    updateUnloadGuard();
    return Promise.all(inflight).then(() => undefined);
}

export function resetFeedbackSyncForTests() {
    void forgetFeedback();
}
