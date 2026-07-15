// Turn-list helpers shared by the send/retry paths. Pure — unit-tested like
// chatWaitState.js.

// A non-arena assistant turn that ended without a real answer: a stop, an error,
// or a legacy persisted agentError message. These must not be sent back to the
// model as context (that leaks stale error text and, when retried mid-history,
// produces a request ending in an assistant turn — the "every request errors"
// cascade).
export function isInterruptedAssistant(message) {
  return (
    message?.role === 'assistant' &&
    !message.isArena &&
    !!(message.notice || message.agentError || message.interrupted)
  );
}

// The message list to send upstream: user turns and clean answers only.
export function buildOutgoingHistory(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter((m) => !isInterruptedAssistant(m));
}

// Retry re-runs the last turn: drop a trailing interrupted assistant so the list
// ends on the user question it belongs to. No-op otherwise.
export function dropTrailingNotice(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  return isInterruptedAssistant(last) ? messages.slice(0, -1) : messages;
}
