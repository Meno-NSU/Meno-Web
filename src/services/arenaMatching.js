// Some OpenRouter ids point to a meta-router that resolves to a random
// underlying model per request. Those can't honestly appear on the arena —
// we'd be rating an opaque routing layer, and the same id could collide
// against itself on both sides. They're still fine for regular chat;
// just keep them out of the arena pool.
const ARENA_BLOCKED_IDS = new Set([
    'openrouter/free',
    'openrouter/auto',
]);

export function buildArenaPool(models) {
    // Any model that the backend reports as available — vLLM or OpenRouter —
    // is eligible for arena, except for known meta-router ids (see
    // ARENA_BLOCKED_IDS). We previously required OR models to be `featured`,
    // but with an empty OPENROUTER_FEATURED_MODELS env (the default) zero
    // OR models pass that check, so arena ended up with only 1 vLLM in
    // the pool and showed "no available models" forever.
    return (models || []).filter(
        (m) => (m.status?.state ?? 'available') === 'available'
            && !ARENA_BLOCKED_IDS.has(m.id)
    );
}

// vLLM models are local, fast, free to run, and the ones we ship — bias the
// random pick towards them. OpenRouter free models are still in the pool but
// surface less often, so most rounds compare two locals or one local vs one
// remote. Tweak via these constants if the mix feels off.
export const POOL_WEIGHT_VLLM = 3;
export const POOL_WEIGHT_OPENROUTER = 1;

function modelWeight(model) {
    return model?.provider === 'vllm' ? POOL_WEIGHT_VLLM : POOL_WEIGHT_OPENROUTER;
}

export function pickRandomFromPool(pool, exclude) {
    const candidates = pool.filter(m => !exclude.has(m.id));
    if (candidates.length === 0) return null;
    const weights = candidates.map(modelWeight);
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
        r -= weights[i];
        if (r < 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
}

// Pick two distinct candidates from the pool, weighted towards vLLM. Used by
// App.jsx to fix the arena pair up front so both sides never start on the
// same model. If the pool has fewer than 2 candidates after applying
// `exclude`, returns null — the caller is expected to handle this with the
// existing "not enough available models" path.
export function pickArenaPair(pool, exclude = new Set()) {
    const first = pickRandomFromPool(pool, exclude);
    if (!first) return null;
    const excludeForSecond = new Set(exclude);
    excludeForSecond.add(first.id);
    const second = pickRandomFromPool(pool, excludeForSecond);
    if (!second) return null;
    return { a: first, b: second };
}

export class ArenaPoolExhaustedError extends Error {
    constructor() { super('Arena pool exhausted'); this.name = 'ArenaPoolExhaustedError'; }
}

export async function runArenaSideWithSubstitution({
    pool, exclude, kbId, messages, sessionId, sendChat, onEvent,
    initialCandidate = null,
    onSubstitution = null,
}) {
    // 5 attempts (was 3) so we don't bail out of the round just because two
    // OR models happened to be rate-limited / silent / down at the same time.
    // With a weighted pool of ~28 models the substitute branch will normally
    // find a working one within the first 2 tries; the extra budget is for
    // edge cases (open-router fleet wobble, vLLM endpoint blip, etc).
    const MAX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        // First attempt prefers the pre-picked candidate (so App.jsx can
        // guarantee the two sides start on disjoint models). On retry, or
        // if the pre-pick is already in the exclude set (substitution
        // already burned it), fall back to a fresh weighted pick.
        let candidate;
        if (attempt === 0 && initialCandidate && !exclude.has(initialCandidate.id)) {
            candidate = initialCandidate;
        } else {
            candidate = pickRandomFromPool(pool, exclude);
        }
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
            // A clean 200 with zero content (or only whitespace) doesn't
            // count as an answer — keep substituting. Without this check
            // the side ends up votable on a blank bubble, or the user has
            // to retype to retry.
            const text = (result?.content || '').trim();
            if (!text) {
                exclude.add(candidate.id);
                if (firstTokenReceived) throw new Error('Model emitted partial content then went silent');
                if (onSubstitution) onSubstitution(candidate.id, 'blank');
                continue;
            }
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
            if (onSubstitution) onSubstitution(candidate.id, err?.code || 'error');
        }
    }
    throw new ArenaPoolExhaustedError();
}
