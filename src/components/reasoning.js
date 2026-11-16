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
export function deriveReasoningStatus({ summary, agentError, isStreaming, interrupted }) {
  if (interrupted) return 'stopped';
  if (agentError) return 'errored';
  if (summary != null) return 'done';
  if (!isStreaming) return 'done';
  return 'running';
}

// How a stage row shows once the answer is over. A stage still 'running' then
// will never get its "completed" event: after a stop or a failure it was cut off
// ('interrupted' — static, with a stop mark); after a normal finish it did end, the
// way the summary event marks still-running stages complete.
export function stageDisplayStatus(stageStatus, blockStatus) {
  if (stageStatus !== 'running' || blockStatus === 'running') return stageStatus;
  return blockStatus === 'done' ? 'complete' : 'interrupted';
}

// Whether the reasoning disclosure has anything to show: stages, model reasoning,
// or (while the request is out) the waiting phrase in its header.
export function hasReasoningBlock({ stages, reasoning, pending, isStreaming }) {
  return (stages?.length ?? 0) > 0 || !!(reasoning && reasoning.trim()) || !!(pending && isStreaming);
}

export function formatDuration(ms) {
  if (ms == null) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
