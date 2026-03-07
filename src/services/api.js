import { apiLogger } from './logger';

// All API calls use relative URLs (e.g. /v1/models).
// In dev mode Vite proxies /v1/* to the backend.
// In production server.js proxies /v1/* to the backend.
const API_BASE_URL = '';

const generateRequestId = () => Math.random().toString(36).substring(2, 10);

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

export async function sendChatMessage(messages, model, kb, stream = false, onChunk = null) {
    apiLogger.debug('sendChatMessage called', { model, kb, stream, messageCount: messages.length });
    try {
        const payload = {
            model: model,
            messages: messages,
            stream: stream,
            user: 'local-user' // Could be dynamic
        };

        const res = await fetchWithLogging(`${API_BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
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
            apiLogger.debug('sendChatMessage (non-stream) completed successfully');
            return data.choices?.[0]?.message?.content || '';
        }

        // Handle Streaming Response
        apiLogger.debug('sendChatMessage (stream) processing started');
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullContent = '';
        let chunkCount = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                apiLogger.debug('sendChatMessage (stream) completed', { chunkCount, totalLength: fullContent.length });
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.trim() === 'data: [DONE]') {
                    apiLogger.debug('sendChatMessage received data: [DONE]');
                    return fullContent;
                }
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.choices?.[0]?.delta?.content) {
                            const textChunk = data.choices[0].delta.content;
                            fullContent += textChunk;
                            chunkCount++;
                            if (onChunk) onChunk(textChunk, fullContent);
                        }
                    } catch {
                        // Ignore parsing errors for incomplete chunks
                    }
                }
            }
        }

        return fullContent;
    } catch (error) {
        apiLogger.error('Error in sendChatMessage:', error);
        throw error;
    }
}
