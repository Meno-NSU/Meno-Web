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
