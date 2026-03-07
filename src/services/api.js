const API_BASE_URL = localStorage.getItem('API_BASE_URL') || import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:9006';

export async function fetchModels() {
    try {
        const res = await fetch(`${API_BASE_URL}/v1/models`);
        if (!res.ok) throw new Error('Failed to fetch models');
        const data = await res.json();
        return data.data || [];
    } catch (error) {
        console.error('Error fetching models:', error);
        return [{ id: 'menon-1', name: 'menon-1' }]; // Fallback
    }
}

export async function fetchKnowledgeBases() {
    try {
        const res = await fetch(`${API_BASE_URL}/v1/knowledge-bases`);
        if (!res.ok) throw new Error('Failed to fetch KBs');
        const data = await res.json();
        return data.data || [];
    } catch (error) {
        console.error('Error fetching KBs:', error);
        return [{ id: 'default-kb', name: 'Default Knowledge Base' }]; // Fallback
    }
}

export async function sendChatMessage(messages, model, kb, stream = false, onChunk = null) {
    try {
        const payload = {
            model: model,
            messages: messages,
            stream: stream,
            user: 'local-user' // Could be dynamic
        };

        const res = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            let errorData = await res.text();
            try {
                const parsed = JSON.parse(errorData);
                errorData = parsed.error?.message || errorData;
            } catch { /* ignore */ }
            throw new Error(errorData || 'Failed to send message');
        }

        if (!stream) {
            const data = await res.json();
            return data.choices?.[0]?.message?.content || '';
        }

        // Handle Streaming Response
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullContent = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.trim() === 'data: [DONE]') return fullContent;
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.choices?.[0]?.delta?.content) {
                            const textChunk = data.choices[0].delta.content;
                            fullContent += textChunk;
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
        console.error('Error sending message:', error);
        throw error;
    }
}
