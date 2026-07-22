import { apiLogger } from './logger';
import { createWaitTimers, RESPONSE_TIMEOUT_MS, SLOW_WARNING_MS } from './chatWaitState.js';

// All API calls use relative URLs (e.g. /v1/models).
// In dev mode Vite proxies /v1/* to the backend.
// In production server.js proxies /v1/* to the backend.
const API_BASE_URL = '';

// --- Auth token (stored by authStore; read here so every request is authenticated) ---
export const AUTH_TOKEN_KEY = 'meno.authToken';

export function getAuthToken() {
    try {
        return localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setAuthToken(token) {
    try {
        if (token) {
            localStorage.setItem(AUTH_TOKEN_KEY, token);
        } else {
            localStorage.removeItem(AUTH_TOKEN_KEY);
        }
    } catch {
        /* localStorage unavailable (private mode etc.) — auth simply won't persist */
    }
}

// --- Guest token (anonymous browser identity; sent as X-Guest-Token when not signed in) ---
export const GUEST_TOKEN_KEY = 'meno.guestToken';

export function getGuestToken() {
    try {
        return localStorage.getItem(GUEST_TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setGuestToken(token) {
    try {
        if (token) {
            localStorage.setItem(GUEST_TOKEN_KEY, token);
        } else {
            localStorage.removeItem(GUEST_TOKEN_KEY);
        }
    } catch {
        /* localStorage unavailable — guest identity simply won't persist */
    }
}

// Mint a guest session once and cache its secret token locally. Idempotent: a
// no-op when a token already exists. Returns the token, or null on failure.
export async function ensureGuestSession() {
    const existing = getGuestToken();
    if (existing) return existing;
    try {
        const res = await fetch(`${API_BASE_URL}/v1/guest/session`, { method: 'POST' });
        if (!res.ok) return null;
        const data = await res.json();
        if (data?.guest_token) {
            setGuestToken(data.guest_token);
            return data.guest_token;
        }
        return null;
    } catch {
        return null;
    }
}

const generateRequestId = () => Math.random().toString(36).substring(2, 10);

// Parse a FastAPI-style error body ({"detail": ...} or {"error": {"message": ...}})
// into an Error carrying the human message and HTTP status.
async function buildError(res, fallback) {
    let message = fallback;
    try {
        const data = await res.json();
        message = data?.detail || data?.error?.message || fallback;
    } catch {
        /* non-JSON body */
    }
    const err = new Error(message);
    err.httpStatus = res.status;
    return err;
}

function splitSseBuffer(buffer) {
    const normalized = buffer.replace(/\r\n/g, '\n');
    const events = normalized.split('\n\n');
    return {
        completeEvents: events.slice(0, -1),
        remainder: events.at(-1) || '',
    };
}

function parseSseEventBlock(block) {
    const dataLines = [];
    let eventType = null;

    for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
        }
    }

    if (dataLines.length === 0) {
        return null;
    }

    const payload = dataLines.join('\n');
    if (payload === '[DONE]') {
        return { done: true };
    }

    try {
        return {
            done: false,
            eventType,
            data: JSON.parse(payload),
        };
    } catch (error) {
        apiLogger.warn('Ignoring malformed SSE payload', {
            error: error instanceof Error ? error.message : String(error),
            payloadPreview: payload.slice(0, 200),
        });
        return null;
    }
}

async function fetchWithLogging(url, options = {}) {
    const requestId = generateRequestId();
    const method = options.method || 'GET';
    const startTime = performance.now();

    // Signed-in requests carry the JWT; guests carry their X-Guest-Token. The
    // backend treats both as optional, and only one is ever needed at a time.
    const token = getAuthToken();
    const guestToken = getGuestToken();
    let authedOptions = options;
    if (token) {
        authedOptions = { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } };
    } else if (guestToken) {
        authedOptions = { ...options, headers: { ...(options.headers || {}), 'X-Guest-Token': guestToken } };
    }

    // Never log request bodies or headers: they can carry email, password,
    // message text, or the bearer token. Log only the safe request line.
    apiLogger.info(`--> [${requestId}] ${method} ${url}`);

    try {
        // Here we track network errors. A TypeError implies CORS failure or server unreachable.
        const res = await fetch(url, authedOptions);
        const duration = Math.round(performance.now() - startTime);

        if (!res.ok) {
            apiLogger.error(`<-- [${requestId}] ${method} ${url} - HTTP ${res.status} ${res.statusText} (${duration}ms)`);
            return res; // let caller handle bad responses
        }

        apiLogger.info(`<-- [${requestId}] ${method} ${url} - HTTP ${res.status} OK (${duration}ms)`);
        return res;
    } catch (error) {
        const duration = Math.round(performance.now() - startTime);
        apiLogger.error(`<-- [${requestId}] ${method} ${url} - NETWORK/FETCH ERROR (${duration}ms)`, error);

        // Detailed error breakdown
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
            apiLogger.error(`[${requestId}] This "Failed to fetch" usually indicates: 1) Backend is not running/unreachable, or 2) CORS error (missing Access-Control-Allow-Origin on backend).`);
        }

        throw error;
    }
}

export async function fetchModels() {
    apiLogger.debug('fetchModels called');
    try {
        const res = await fetchWithLogging(`${API_BASE_URL}/v1/models`);
        if (!res.ok) {
            const errorText = await res.text();
            apiLogger.error(`fetchModels failed with HTTP ${res.status}`, { response: errorText });
            throw new Error(`Failed to fetch models: HTTP ${res.status}`);
        }
        const data = await res.json();
        return {
            models: data.data || [],
            coreModelId: data.core_model_id ?? null,
        };
    } catch (error) {
        apiLogger.error('Error fetching models in API client:', error);
        return { models: [], coreModelId: null }; // No fallback — let UI show "no models" state
    }
}

export async function refreshModels() {
    apiLogger.debug('refreshModels called (force refresh)');
    try {
        const res = await fetchWithLogging(`${API_BASE_URL}/v1/models/refresh`, { method: 'POST' });
        if (!res.ok) {
            apiLogger.warn('refreshModels failed, falling back to fetchModels');
            return fetchModels();
        }
        const data = await res.json();
        return {
            models: data.data || [],
            coreModelId: data.core_model_id ?? null,
        };
    } catch (error) {
        apiLogger.error('Error in refreshModels:', error);
        return fetchModels();
    }
}

export async function fetchKnowledgeBases() {
    apiLogger.debug('fetchKnowledgeBases called');
    try {
        const res = await fetchWithLogging(`${API_BASE_URL}/v1/knowledge-bases`);
        if (!res.ok) {
            const errorText = await res.text();
            apiLogger.error(`fetchKnowledgeBases failed with HTTP ${res.status}`, { response: errorText });
            throw new Error(`Failed to fetch KBs: HTTP ${res.status}`);
        }
        const data = await res.json();
        return data.data || [];
    } catch (error) {
        apiLogger.error('Error fetching KBs in API client:', error);
        return []; // No fallback — let UI show actual state
    }
}

export async function clearChatHistory(chatId) {
    apiLogger.debug('clearChatHistory called', { chatId });
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/chat/completions/clear_history`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chat_id: chatId }),
    });

    if (!res.ok) {
        const errorText = await res.text();
        apiLogger.error(`clearChatHistory failed with HTTP ${res.status}`, { response: errorText });
        throw new Error(errorText || 'Failed to clear chat history');
    }

    return res.json();
}

// --- Auth (S3) ---

export async function register({ email, password, nickname }) {
    apiLogger.debug('register called', { email });
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, nickname: nickname || null }),
    });
    if (!res.ok) throw await buildError(res, 'Registration failed');
    return res.json(); // { token, user }
}

export async function login({ email, password }) {
    apiLogger.debug('login called', { email });
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw await buildError(res, 'Invalid email or password');
    return res.json(); // { token, user }
}

export async function fetchMe() {
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/auth/me`);
    if (!res.ok) throw await buildError(res, 'Not authenticated');
    return (await res.json()).user;
}

export async function updateNickname(nickname) {
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
    });
    if (!res.ok) throw await buildError(res, 'Failed to update nickname');
    return (await res.json()).user;
}

// --- Privacy & legal (Stage 2b) ---

function mapPrivacySettings(data) {
    return {
        serviceAndHistory: !!data.service_and_history,
        menoImprovement: !!data.meno_improvement,
    };
}

function mapLegalDocument(doc) {
    const mapped = {
        kind: doc.kind,
        version: doc.version,
        url: doc.url,
        sha256: doc.sha256,
        effectiveAt: doc.effective_at ?? null,
    };
    // The list endpoint omits content; the single-document endpoint includes it.
    if (doc.content !== undefined) {
        mapped.content = doc.content;
    }
    return mapped;
}

// Current consent state for the subject the request authenticates as (JWT or
// X-Guest-Token, injected by fetchWithLogging). A subject with no consent
// events reads back { serviceAndHistory: false, menoImprovement: false }.
export async function getPrivacySettings() {
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/privacy/settings`);
    if (!res.ok) throw await buildError(res, 'Failed to read privacy settings');
    return mapPrivacySettings(await res.json());
}

// Record a consent change. `documentVersion` must match the current consent
// document (409 otherwise); `serviceAndHistory:false` is refused by the backend
// (400 — revoking requires deletion). Returns the new state.
export async function patchPrivacySettings({ documentVersion, serviceAndHistory, menoImprovement, source }) {
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/privacy/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            document_version: documentVersion,
            service_and_history: serviceAndHistory,
            meno_improvement: menoImprovement,
            source,
        }),
    });
    if (!res.ok) throw await buildError(res, 'Failed to update privacy settings');
    return mapPrivacySettings(await res.json());
}

// Right to erasure: delete all of the caller's data (and, for a registered user, the
// account). After this the JWT / guest token no longer resolves — the caller resets
// local state and mints a fresh guest identity.
export async function deleteMyData() {
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/privacy/data`, { method: 'DELETE' });
    if (!res.ok) throw await buildError(res, 'Failed to delete data');
    return res.json();
}

// A single published legal document (with markdown `content`). `kind` is the
// backend key: personal_data_consent | privacy_policy | terms_of_use.
export async function getLegalDocument(kind) {
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/legal/documents/${encodeURIComponent(kind)}`);
    if (!res.ok) throw await buildError(res, 'Failed to load document');
    return mapLegalDocument(await res.json());
}

// Metadata for all legal documents (no content) — used to read the current
// consent-document version for the consent PATCH without hardcoding it.
export async function getLegalDocuments() {
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/legal/documents`);
    if (!res.ok) throw await buildError(res, 'Failed to load documents');
    const data = await res.json();
    return (data.documents || []).map(mapLegalDocument);
}

// --- Feedback (S2) ---

export async function submitFeedback({ completionId, sessionId, value, comment = null }) {
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completion_id: completionId, session_id: sessionId, value, comment }),
    });
    if (!res.ok) throw await buildError(res, 'Failed to submit feedback');
    return res.json();
}

export async function clearFeedback({ completionId, sessionId }) {
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/feedback/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completion_id: completionId, session_id: sessionId }),
    });
    if (!res.ok) throw await buildError(res, 'Failed to clear feedback');
    return res.json();
}

export async function submitSurvey({ sessionId, answer }) {
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/feedback/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, answer }),
    });
    if (!res.ok) throw await buildError(res, 'Failed to submit survey');
    return res.json();
}

// Arena votes go through the API client so the Bearer token rides along —
// signed-in votes are attributed to the user (and count on the contributors
// leaderboard). A raw fetch here silently dropped the attribution.
export async function submitArenaVote(payload) {
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/arena/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw await buildError(res, `Vote POST ${res.status}`);
}

// --- Contributor leaderboard (S3b) ---

export async function fetchContributorLeaderboard() {
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/leaderboard`);
    if (!res.ok) throw await buildError(res, 'Failed to fetch leaderboard');
    return (await res.json()).data || [];
}

// First-token timeout: if the backend hasn't produced the FIRST content
// chunk within this many ms we assume the upstream is stuck and abort.
// Once streaming has started we don't enforce the cap further — long
// answers are fine, mid-stream silence is the symptom we're worried about.
export const CHAT_FIRST_TOKEN_TIMEOUT_MS = RESPONSE_TIMEOUT_MS; // 120s hard abort
export const CHAT_SLOW_WARNING_MS = SLOW_WARNING_MS; // 40s soft notice

export class ChatTimeoutError extends Error {
    constructor(modelId) {
        super(`Chat timeout after ${CHAT_FIRST_TOKEN_TIMEOUT_MS}ms (model=${modelId || 'unknown'})`);
        this.name = 'ChatTimeoutError';
        this.code = 'chat_timeout';
    }
}

export class ChatAbortedError extends Error {
    constructor(modelId) {
        super(`Chat aborted by user (model=${modelId || 'unknown'})`);
        this.name = 'ChatAbortedError';
        this.code = 'user_stopped';
    }
}

// Classify an abort of the streaming request. The internal aborter fires from
// exactly two sources: the 120s timeout (timeoutFired) or the external signal
// (the user's "Stop waiting"). A non-abort error passes through untouched.
export function abortErrorFor({ timeoutFired, error, modelId }) {
    if (timeoutFired) return new ChatTimeoutError(modelId);
    if (error?.name === 'AbortError') return new ChatAbortedError(modelId);
    return error;
}

export async function sendChatMessage({
    messages,
    modelId,
    knowledgeBaseId,
    sessionId,
    stream = false,
    onEvent = null,
    signal = null,
}) {
    apiLogger.debug('sendChatMessage called', {
        modelId,
        knowledgeBaseId,
        sessionId,
        stream,
        messageCount: messages.length,
    });
    try {
        const payload = {
            model: modelId,
            messages,
            stream,
            user: sessionId,
            knowledge_base_id: knowledgeBaseId,
        };

        // Wrap the fetch in a timeout that aborts if the FIRST content
        // chunk hasn't appeared in CHAT_FIRST_TOKEN_TIMEOUT_MS. Cleared
        // below the moment we see a content event in the SSE loop.
        const localAborter = new AbortController();
        const externalAbortHandler = () => localAborter.abort(signal?.reason);
        if (signal) {
            if (signal.aborted) localAborter.abort(signal.reason);
            else signal.addEventListener('abort', externalAbortHandler, { once: true });
        }
        let timeoutFired = false;
        // Two-stage wait: a soft "slow" notice at 40s, then a hard abort at 120s.
        const waitTimers = createWaitTimers({
            onSlowWarning: () => onEvent && onEvent({ type: 'slow_warning' }),
            onTimeout: () => {
                timeoutFired = true;
                localAborter.abort();
            },
        });
        const firstTokenTimer = waitTimers; // keep the name used by the clears below

        let res;
        try {
            res = await fetchWithLogging(`${API_BASE_URL}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Pipeline-Stages': 'true',
                },
                body: JSON.stringify(payload),
                signal: localAborter.signal,
            });
        } catch (err) {
            firstTokenTimer.clear();
            if (signal) signal.removeEventListener('abort', externalAbortHandler);
            if (timeoutFired || err?.name === 'AbortError') {
                throw abortErrorFor({ timeoutFired, error: err, modelId });
            }
            throw err;
        }

        if (!res.ok) {
            let errorData = await res.text();
            let parsed = null;
            try { parsed = JSON.parse(errorData); } catch { /* ignore */ }
            apiLogger.error(`sendChatMessage failed with HTTP ${res.status}`, { rawError: errorData });
            const err = new Error(parsed?.error?.message || errorData || 'Failed to send message');
            err.code = parsed?.error?.code;
            err.until = parsed?.error?.until;
            err.retryAfterSec = parsed?.error?.retry_after_sec;
            err.activeRequests = parsed?.error?.active_requests;
            err.limit = parsed?.error?.limit;
            err.httpStatus = res.status;
            throw err;
        }

        if (!stream) {
            const data = await res.json();
            const responseModelId = data.model || modelId;
            const content = data.choices?.[0]?.message?.content || '';

            if (onEvent && responseModelId) {
                onEvent({ type: 'model', modelId: responseModelId, raw: data });
            }
            if (onEvent && content) {
                onEvent({
                    type: 'content',
                    textChunk: content,
                    fullContent: content,
                    modelId: responseModelId,
                    raw: data,
                });
            }

            apiLogger.debug('sendChatMessage (non-stream) completed successfully');
            // `completionId` is the OpenAI response id — feedback is attached to it.
            return { content, modelId: responseModelId, completionId: data.id ?? null };
        }

        // Handle Streaming Response
        apiLogger.debug('sendChatMessage (stream) processing started');
        if (!res.body) {
            throw new Error('Streaming response body is missing');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullContent = '';
        let chunkCount = 0;
        let responseModelId = null;
        let completionId = null;
        let rawBuffer = '';
        let streamFinished = false;

        const handleParsedEvent = (eventBlock) => {
            const parsedEvent = parseSseEventBlock(eventBlock);
            if (!parsedEvent) {
                return false;
            }
            if (parsedEvent.done) {
                apiLogger.debug('sendChatMessage received data: [DONE]');
                return true;
            }

            const data = parsedEvent.data;

            // The OpenAI response id (same across all chunks) — captured for feedback.
            if (data?.id && !completionId) {
                completionId = data.id;
            }

            // Handle named SSE event types (pipeline stages)
            if (parsedEvent.eventType === 'stage' && onEvent) {
                onEvent({
                    type: 'stage',
                    stage: data.stage,
                    status: data.status,
                    durationMs: data.duration_ms ?? null,
                    detail: data.detail ?? null,
                });
                return false;
            }

            if (parsedEvent.eventType === 'thinking' && onEvent) {
                onEvent({
                    type: 'thinking',
                    content: data.content,
                });
                return false;
            }

            if (parsedEvent.eventType === 'summary' && onEvent) {
                onEvent({
                    type: 'summary',
                    totalMs: data.total_ms,
                    stages: data.stages,
                });
                return false;
            }

            if (parsedEvent.eventType === 'sources' && onEvent) {
                onEvent({
                    type: 'sources',
                    sources: data.sources || [],
                });
                return false;
            }

            // Default: OpenAI-compatible content/model events
            if (data?.error?.message) {
                throw new Error(data.error.message);
            }

            const parsedModelId = typeof data?.model === 'string' && data.model.trim()
                ? data.model.trim()
                : null;
            if (parsedModelId && parsedModelId !== responseModelId) {
                responseModelId = parsedModelId;
                if (onEvent) {
                    onEvent({ type: 'model', modelId: responseModelId, raw: data });
                }
            }

            const textChunk = data.choices?.[0]?.delta?.content;
            if (typeof textChunk === 'string' && textChunk.length > 0) {
                fullContent += textChunk;
                chunkCount += 1;
                // First real content chunk arrived — cancel the wait timers
                // so a long answer isn't aborted (and no late slow-warning).
                firstTokenTimer.clear();
                if (onEvent) {
                    onEvent({
                        type: 'content',
                        textChunk,
                        fullContent,
                        modelId: responseModelId || modelId,
                        raw: data,
                    });
                }
            }

            return false;
        };

        let readError = null;
        while (true) {
            let readResult;
            try {
                readResult = await reader.read();
            } catch (err) {
                readError = err;
                break;
            }
            const { done, value } = readResult;
            rawBuffer += decoder.decode(value || new Uint8Array(), { stream: !done });

            const { completeEvents, remainder } = splitSseBuffer(rawBuffer);
            rawBuffer = remainder;

            for (const eventBlock of completeEvents) {
                if (handleParsedEvent(eventBlock)) {
                    streamFinished = true;
                    break;
                }
            }

            if (streamFinished) {
                break;
            }

            if (done) {
                const trailingEvent = rawBuffer.trim();
                if (trailingEvent) {
                    handleParsedEvent(trailingEvent);
                }
                apiLogger.debug('sendChatMessage (stream) completed', {
                    chunkCount,
                    totalLength: fullContent.length,
                });
                break;
            }
        }

        // Either the loop finished cleanly or `reader.read()` threw. Clear
        // the timers either way; convert an abort into our typed error.
        firstTokenTimer.clear();
        if (signal) signal.removeEventListener('abort', externalAbortHandler);
        if (readError) {
            if (timeoutFired || readError?.name === 'AbortError') {
                throw abortErrorFor({ timeoutFired, error: readError, modelId });
            }
            throw readError;
        }

        return {
            content: fullContent,
            modelId: responseModelId || modelId,
            completionId,
        };
    } catch (error) {
        apiLogger.error('Error in sendChatMessage:', error);
        throw error;
    }
}

// Best-effort load snapshot for the overload UX. Never throws — on any failure
// it returns zeros so the caller just omits the load figure.
export async function fetchServiceStatus() {
    try {
        const res = await fetch(`${API_BASE_URL}/v1/status`);
        if (!res.ok) return { active: 0, limit: null };
        const data = await res.json();
        return { active: data.active_requests ?? 0, limit: data.limit ?? null };
    } catch {
        return { active: 0, limit: null };
    }
}
