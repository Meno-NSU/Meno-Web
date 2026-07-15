// Turn-list helpers shared by the send/retry paths. Pure — unit-tested like
// chatWaitState.js.

// A non-arena assistant turn that ended without a real answer: a stop, an error,
// or a legacy persisted agentError message. Retry regenerates such a turn, so it
// is dropped from the tail before re-sending (see dropTrailingNotice).
//
// These turns are otherwise KEPT in the outgoing history: their error text lives
// in `notice`, not `content`, so nothing stale leaks, and keeping the assistant
// slot preserves the strict user/assistant alternation the backend's
// dialogue-history parser requires. Stripping them would create consecutive user
// turns, which the backend rejects (ValueError → 500).
export function isInterruptedAssistant(message) {
  return (
    message?.role === 'assistant' &&
    !message.isArena &&
    !!(message.notice || message.agentError || message.interrupted)
  );
}

// Retry re-runs the last turn: drop a trailing interrupted assistant so the list
// ends on the user question it belongs to. No-op otherwise.
export function dropTrailingNotice(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  return isInterruptedAssistant(last) ? messages.slice(0, -1) : messages;
}
