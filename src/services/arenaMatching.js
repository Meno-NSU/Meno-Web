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
            if (firstTokenReceived) throw err;
            if (err.code !== 'model_rate_limited' && err.code !== 'model_unreachable') throw err;
        }
    }
    throw new ArenaPoolExhaustedError();
}
