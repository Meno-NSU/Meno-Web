export function buildArenaPool(models) {
    // Any model that the backend reports as available — vLLM or OpenRouter —
    // is eligible for arena. We previously required OR models to be
    // `featured`, but with an empty OPENROUTER_FEATURED_MODELS env (the
    // default) zero OR models pass that check, so arena ended up with
    // only 1 vLLM in the pool and showed "no available models" forever.
    return (models || []).filter(
        (m) => (m.status?.state ?? 'available') === 'available'
    );
}

export function pickRandomFromPool(pool, exclude) {
    const candidates = pool.filter(m => !exclude.has(m.id));
    if (candidates.length === 0) return null;
    const idx = Math.floor(Math.random() * candidates.length);
    return candidates[idx];
}

export class ArenaPoolExhaustedError extends Error {
    constructor() { super('Arena pool exhausted'); this.name = 'ArenaPoolExhaustedError'; }
}

export async function runArenaSideWithSubstitution({
    pool, exclude, kbId, messages, sessionId, sendChat, onEvent,
}) {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const candidate = pickRandomFromPool(pool, exclude);
        if (!candidate) throw new ArenaPoolExhaustedError();
        let firstTokenReceived = false;
        try {
            const result = await sendChat({
                modelId: candidate.id, knowledgeBaseId: kbId, messages, sessionId, stream: true,
                onEvent: (event) => {
                    if (event.type === 'content') firstTokenReceived = true;
                    onEvent(event);
                },
            });
            return { model: candidate, result };
        } catch (err) {
            exclude.add(candidate.id);
            // Once partial output is on screen, do NOT substitute — the user
            // is already seeing tokens from this model. Substituting now
            // would replace a partial answer mid-render and look broken.
            if (firstTokenReceived) throw err;
            // Otherwise: substitute on ANY pre-stream failure (rate-limited,
            // unreachable, invalid_upstream_request from e.g. JAX rejecting
            // `seed`, transient_timeout, even internal_error). A single bad
            // model in a 28-model pool used to kill the whole round; arena
            // is only meaningful with two complete answers.
        }
    }
    throw new ArenaPoolExhaustedError();
}
