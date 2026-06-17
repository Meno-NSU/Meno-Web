// Pure view-model helpers for the unified reasoning disclosure.

// Split a raw assistant message into its final answer and its <think> reasoning.
// Handles closed <think>…</think> blocks and a single still-open trailing
// <think> (streaming). Returns trimmed answer text and concatenated reasoning.
export function extractReasoning(raw) {
  const text = raw || '';
  const thinkParts = [];

  const closed = /<think>([\s\S]*?)<\/think>/gi;
  let m;
  while ((m = closed.exec(text)) !== null) {
    if (m[1].trim()) thinkParts.push(m[1].trim());
  }

  let answer = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const openIdx = answer.indexOf('<think>');
  if (openIdx !== -1) {
    const tail = answer.slice(openIdx + '<think>'.length).trim();
    if (tail) thinkParts.push(tail);
    answer = answer.slice(0, openIdx);
  }

  return { answer: answer.trim(), think: thinkParts.join('\n\n').trim() };
}

// Terminal vs running state for the reasoning disclosure.
export function deriveReasoningStatus({ summary, agentError, isStreaming }) {
  if (agentError) return 'errored';
  if (summary != null) return 'done';
  if (!isStreaming) return 'done';
  return 'running';
}

export function formatDuration(ms) {
  if (ms == null) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
