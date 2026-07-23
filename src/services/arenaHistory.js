// Derive the two branch histories (L and R) from a chat's flat messages
// array. Mirrors the lmarena-style design: user messages go to both branches;
// arena rounds merge to the winner on a/b, split on tie/both_bad; pending
// (unvoted) rounds are skipped defensively. Legacy non-arena assistant
// messages flow into both branches.
//
// When a winner (a or b) is voted after branches have diverged (e.g. after a
// tie), both histories converge: historyA is replaced with historyB when 'b'
// wins, and historyB is replaced with historyA when 'a' wins, so that the
// final histories are identical and reflect the chosen branch end-to-end.
export function buildArenaHistories(messages) {
    let historyA = [];
    let historyB = [];
    for (const msg of messages || []) {
        if (msg?.role === 'user') {
            const entry = { role: 'user', content: msg.content || '' };
            historyA.push(entry);
            historyB.push(entry);
            continue;
        }
        if (msg?.isArena) {
            const ad = msg.arenaData;
            if (!ad?.voted) continue;
            const contentA = ad.a?.content || '';
            const contentB = ad.b?.content || '';
            if (ad.winner === 'a') {
                // Merge: both branches follow A's path from this point forward.
                // If branches had diverged, align B to match A.
                historyA.push({ role: 'assistant', content: contentA });
                historyB = [...historyA];
            } else if (ad.winner === 'b') {
                // Merge: both branches follow B's path from this point forward.
                // If branches had diverged, align A to match B.
                historyB.push({ role: 'assistant', content: contentB });
                historyA = [...historyB];
            } else {
                // tie or both_bad: branches diverge
                historyA.push({ role: 'assistant', content: contentA });
                historyB.push({ role: 'assistant', content: contentB });
            }
            continue;
        }
        if (msg?.role === 'assistant') {
            const entry = { role: 'assistant', content: msg.content || '' };
            historyA.push(entry);
            historyB.push(entry);
        }
    }
    return { historyA, historyB };
}

export function arenaTurnIndex(messages) {
    // The ordinal of the next arena round in this chat — every comparison counts, voted or
    // not. The backend keys a stored arena turn on (session_id, turn_index), so counting only
    // voted rounds made a skipped vote hand the next comparison an index already in use.
    let count = 0;
    for (const msg of messages || []) {
        if (msg?.isArena) count++;
    }
    return count;
}

// Where the recorder (App.jsx, when a round finishes and is posted) decides which
// turn_index the NEW round gets. Counting arena messages (arenaTurnIndex) is only
// correct for a chat that has never been restored: a round where one side failed
// is kept in the local array but was never posted, so it consumes no server-side
// index, and a purely live session's count still lines up with "the next never-used
// index" because nothing is ever restored out of order.
//
// A conversation restored from the server breaks that: it holds only the
// comparisons that actually made it to the server (see conversationRestore.js),
// so a gap from an unposted round simply isn't there at all. Counting then
// undercounts — round 1 failing leaves turns stored at 0 and 2, a restored array
// of two arena messages, and arenaTurnIndex says "2", colliding with (and, per the
// backend's upsert-on-(conversation_id, turn_index), silently overwriting) the
// round already at index 2. One more than the highest turnIndex actually present
// is always free; falling back to the count is only needed when nothing in the
// chat carries a stored index yet (never restored, nothing recorded this session
// either).
export function nextArenaTurnIndex(messages) {
    let highest = -1;
    for (const msg of messages || []) {
        if (msg?.isArena && typeof msg.arenaData?.turnIndex === 'number') {
            highest = Math.max(highest, msg.arenaData.turnIndex);
        }
    }
    return highest >= 0 ? highest + 1 : arenaTurnIndex(messages);
}
