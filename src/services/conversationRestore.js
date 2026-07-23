// Turns a conversation fetched from the server back into the message array ChatArea renders.
// The backend publishes these shapes in OpenAPI as UserTurn | AnswerTurn | ArenaTurn,
// discriminated on `kind`.
//
// Pure on purpose: no fetching, no state. What cannot come back — reasoning blocks, streaming
// state, per-chat model selection, locally renamed titles — is listed in the design doc; a
// restored message is simply a finished one.

function newBubbleId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `bubble-${Math.random().toString(36).slice(2, 10)}`;
}

function sideFrom(sides, key) {
    const side = (sides || []).find((s) => s?.key === key) || {};
    return {
        model: side.model ?? null,
        kb: side.knowledge_base_id ?? null,
        content: side.content || '',
        sources: side.sources || [],
        isStreaming: false,
    };
}

export function messagesFromTurns(turns) {
    const messages = [];
    for (const turn of turns || []) {
        if (turn?.kind === 'user') {
            messages.push({ role: 'user', content: turn.content || '' });
            continue;
        }
        if (turn?.kind === 'answer') {
            messages.push({
                role: 'assistant',
                content: turn.content || '',
                // Named to match what the LIVE streaming path finalises onto an assistant
                // message (App.jsx's 'model' event / result.modelId handling) — ChatArea
                // reads `responseModelId || requestModelId` to render the label under the
                // bubble. A restored turn has no separate "requested vs. answered" model
                // (there is only ever the one on record), so only this field is set.
                responseModelId: turn.model ?? null,
                // The backend's request_id is what the feedback endpoints key on, and what
                // this client has always called completionId.
                completionId: turn.request_id ?? null,
                sources: turn.sources || [],
                // The backend calls it `rating`; MessageFeedback reads `value`. Renaming here
                // means the restored control initialises itself with no wiring at all — it
                // already reads `message.feedback`.
                feedback: turn.feedback
                    ? { value: turn.feedback.rating, comment: turn.feedback.comment ?? null }
                    : null,
                isStreaming: false,
            });
            continue;
        }
        if (turn?.kind === 'arena') {
            messages.push({
                role: 'assistant',
                isArena: true,
                arenaData: {
                    // Only ever identifies a message object within one session, so a fresh one
                    // is correct on restore.
                    bubbleId: newBubbleId(),
                    a: sideFrom(turn.sides, 'a'),
                    b: sideFrom(turn.sides, 'b'),
                    // The index this comparison was stored under. Rounds that were never
                    // stored leave gaps, so recomputing it over a restored conversation can
                    // name a different comparison — the vote must use this value.
                    turnIndex: turn.turn_index ?? null,
                    voted: turn.winner !== null && turn.winner !== undefined,
                    namesRevealed: turn.winner !== null && turn.winner !== undefined,
                    winner: turn.winner ?? null,
                },
                isStreaming: false,
            });
            continue;
        }
        // An unrecognised kind is dropped rather than guessed at: rendering a turn wrong is
        // worse than omitting it, and a newer backend may add kinds this client predates.
    }
    return messages;
}
