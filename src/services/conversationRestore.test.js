import { describe, it, expect } from 'vitest';

import { messagesFromTurns } from './conversationRestore.js';

const SOURCES = [{ document_title: 'Устав НГУ', source_url: 'https://nsu.ru/ustav' }];

describe('messagesFromTurns', () => {
  it('restores a question and its answer', () => {
    const messages = messagesFromTurns([
      { kind: 'user', content: 'Вопрос?', created_at: '2026-07-23T10:00:00Z' },
      {
        kind: 'answer', content: 'Ответ.', created_at: '2026-07-23T10:00:01Z',
        model: 'qwen', request_id: 'run-1', sources: SOURCES, feedback: null,
      },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'Вопрос?' });
    expect(messages[1]).toMatchObject({
      role: 'assistant', content: 'Ответ.', completionId: 'run-1', sources: SOURCES,
    });
    // ChatArea reads `responseModelId || requestModelId` for the label under the
    // bubble — the same field the live streaming path finalises onto an assistant
    // message. A restored answer mapped onto a differently-named field (`model`)
    // left every restored answer with no model label at all.
    expect(messages[1].responseModelId).toBe('qwen');
    expect(messages[1].isArena).toBeFalsy();
  });

  it('carries a rating back in the shape the rating control reads', () => {
    // MessageFeedback reads `message.feedback.value` (and `.comment`), while the backend
    // returns `{rating, comment}`. Without the rename the comment comes back but no thumb is
    // selected — a restored rating that looks unrated and invites a duplicate.
    const [, answer] = messagesFromTurns([
      { kind: 'user', content: 'q', created_at: 'x' },
      {
        kind: 'answer', content: 'a', created_at: 'x', model: null, request_id: 'run-1',
        sources: [], feedback: { rating: 'up', comment: 'Полезно' },
      },
    ]);
    expect(answer.feedback).toEqual({ value: 'up', comment: 'Полезно' });
  });

  it('leaves an unrated answer without a feedback object', () => {
    const [, answer] = messagesFromTurns([
      { kind: 'user', content: 'q', created_at: 'x' },
      { kind: 'answer', content: 'a', created_at: 'x', model: null, request_id: 'r', sources: [], feedback: null },
    ]);
    expect(answer.feedback).toBeNull();
  });

  it('restores a voted arena comparison with both sides', () => {
    const [turn] = messagesFromTurns([
      {
        kind: 'arena', content: 'Ответ A', created_at: 'x', turn_index: 0, winner: 'b',
        sides: [
          { key: 'a', model: 'qwen', knowledge_base_id: 'kb1', content: 'Ответ A', sources: [] },
          { key: 'b', model: 'llama', knowledge_base_id: 'kb1', content: 'Ответ B', sources: SOURCES },
        ],
      },
    ]);

    expect(turn.isArena).toBe(true);
    expect(turn.arenaData.voted).toBe(true);
    expect(turn.arenaData.winner).toBe('b');
    expect(turn.arenaData.turnIndex).toBe(0);
    expect(turn.arenaData.a).toMatchObject({ model: 'qwen', kb: 'kb1', content: 'Ответ A' });
    expect(turn.arenaData.b).toMatchObject({ model: 'llama', kb: 'kb1', content: 'Ответ B' });
    expect(turn.arenaData.bubbleId).toBeTruthy();
  });

  it('restores an unvoted comparison as unvoted', () => {
    const [turn] = messagesFromTurns([
      {
        kind: 'arena', content: 'A', created_at: 'x', turn_index: 0, winner: null,
        sides: [
          { key: 'a', model: 'm1', knowledge_base_id: 'kb', content: 'A', sources: [] },
          { key: 'b', model: 'm2', knowledge_base_id: 'kb', content: 'B', sources: [] },
        ],
      },
    ]);
    expect(turn.arenaData.voted).toBe(false);
    expect(turn.arenaData.winner).toBeNull();
  });

  it('never leaves a restored message streaming', () => {
    const messages = messagesFromTurns([
      { kind: 'user', content: 'q', created_at: 'x' },
      { kind: 'answer', content: 'a', created_at: 'x', model: null, request_id: null, sources: [], feedback: null },
    ]);
    expect(messages.every((m) => !m.isStreaming)).toBe(true);
  });

  it('ignores a turn kind it does not understand rather than rendering it wrong', () => {
    expect(messagesFromTurns([{ kind: 'something-new', content: 'x', created_at: 'x' }])).toEqual([]);
  });

  it('tolerates a missing or empty turn list', () => {
    expect(messagesFromTurns(undefined)).toEqual([]);
    expect(messagesFromTurns([])).toEqual([]);
  });
});
