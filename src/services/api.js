import { apiLogger } from './logger';

// All API calls use relative URLs (e.g. /v1/models).
// In dev mode Vite proxies /v1/* to the backend.
// In production server.js proxies /v1/* to the backend.
const API_BASE_URL = '';

const generateRequestId = () => Math.random().toString(36).substring(2, 10);

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

    apiLogger.info(`--> [${requestId}] ${method} ${url}`, {
        headers: options.headers,
        bodyPreview: options.body ? (options.body.length > 200 ? options.body.substring(0, 200) + '...' : options.body) : undefined
    });

    try {
        // Here we track network errors. A TypeError implies CORS failure or server unreachable.
        const res = await fetch(url, options);
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
        return data.data || [];
    } catch (error) {
        apiLogger.error('Error fetching models in API client:', error);
        return []; // No fallback — let UI show "no models" state
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
        return [{ id: 'default-kb', name: 'Default Knowledge Base' }]; // Fallback
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

export async function sendChatMessage({
    messages,
    modelId,
    knowledgeBaseId,
    sessionId,
    stream = false,
    onEvent = null,
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

        const res = await fetchWithLogging(`${API_BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Pipeline-Stages': 'true',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            let errorData = await res.text();
            apiLogger.error(`sendChatMessage failed with HTTP ${res.status}`, { rawError: errorData });
            try {
                const parsed = JSON.parse(errorData);
                errorData = parsed.error?.message || errorData;
            } catch { /* ignore */ }
            throw new Error(errorData || 'Failed to send message');
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
            return { content, modelId: responseModelId };
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

        while (true) {
            const { done, value } = await reader.read();
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

        return {
            content: fullContent,
            modelId: responseModelId || modelId,
        };
    } catch (error) {
        apiLogger.error('Error in sendChatMessage:', error);
        throw error;
    }
}
