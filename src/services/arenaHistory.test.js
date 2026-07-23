import { describe, it, expect } from 'vitest';
import {
  buildArenaHistories,
  arenaTurnIndex,
  nextArenaTurnIndex,
  projectArenaMessagesForContinuation,
} from './arenaHistory.js';

describe('buildArenaHistories', () => {
  it('returns empty histories for an empty chat', () => {
    const { historyA, historyB } = buildArenaHistories([]);
    expect(historyA).toEqual([]);
    expect(historyB).toEqual([]);
  });

  it('mirrors user turns into both branches', () => {
    const messages = [
      { role: 'user', content: 'q1' },
    ];
    const { historyA, historyB } = buildArenaHistories(messages);
    expect(historyA).toEqual([{ role: 'user', content: 'q1' }]);
    expect(historyB).toEqual([{ role: 'user', content: 'q1' }]);
  });

  it('merges branches after a winner vote', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        isArena: true,
        arenaData: {
          a: { model: 'm-a', content: 'A1' },
          b: { model: 'm-b', content: 'B1' },
          voted: true,
          winner: 'a',
        },
      },
    ];
    const { historyA, historyB } = buildArenaHistories(messages);
    expect(historyA).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'A1' },
    ]);
    expect(historyB).toEqual(historyA);
  });

  it('splits branches on tie', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        isArena: true,
        arenaData: {
          a: { model: 'm-a', content: 'A1' },
          b: { model: 'm-b', content: 'B1' },
          voted: true,
          winner: 'tie',
        },
      },
    ];
    const { historyA, historyB } = buildArenaHistories(messages);
    expect(historyA[1]).toEqual({ role: 'assistant', content: 'A1' });
    expect(historyB[1]).toEqual({ role: 'assistant', content: 'B1' });
  });

  it('splits branches on both_bad the same way as tie', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        isArena: true,
        arenaData: {
          a: { model: 'm-a', content: 'A1' },
          b: { model: 'm-b', content: 'B1' },
          voted: true,
          winner: 'both_bad',
        },
      },
    ];
    const { historyA, historyB } = buildArenaHistories(messages);
    expect(historyA[1].content).toBe('A1');
    expect(historyB[1].content).toBe('B1');
  });

  it('skips arena rounds that are still pending a vote', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        isArena: true,
        arenaData: {
          a: { model: 'm-a', content: 'A1' },
          b: { model: 'm-b', content: 'B1' },
          voted: false,
          winner: null,
        },
      },
    ];
    const { historyA, historyB } = buildArenaHistories(messages);
    expect(historyA).toEqual([{ role: 'user', content: 'q1' }]);
    expect(historyB).toEqual([{ role: 'user', content: 'q1' }]);
  });

  it('handles a chain of mixed votes: a → tie → b', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant', isArena: true,
        arenaData: { a: { content: 'A1' }, b: { content: 'B1' }, voted: true, winner: 'a' },
      },
      { role: 'user', content: 'q2' },
      {
        role: 'assistant', isArena: true,
        arenaData: { a: { content: 'A2' }, b: { content: 'B2' }, voted: true, winner: 'tie' },
      },
      { role: 'user', content: 'q3' },
      {
        role: 'assistant', isArena: true,
        arenaData: { a: { content: 'A3' }, b: { content: 'B3' }, voted: true, winner: 'b' },
      },
    ];
    const { historyA, historyB } = buildArenaHistories(messages);
    // After turn 1 (a wins): both = [q1, A1]
    // After turn 2 (tie): A=[q1, A1, q2, A2], B=[q1, A1, q2, B2]
    // After turn 3 (b wins): both = [q1, A1, q2, B2, q3, B3]
    expect(historyA).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'B2' },
      { role: 'user', content: 'q3' },
      { role: 'assistant', content: 'B3' },
    ]);
    expect(historyB).toEqual(historyA);
  });
});

describe('arenaTurnIndex', () => {
  it('is 0 for an empty chat', () => {
    expect(arenaTurnIndex([])).toBe(0);
  });

  it('counts voted arena rounds', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', isArena: true, arenaData: { voted: true, winner: 'a', a: { content: '' }, b: { content: '' } } },
      { role: 'user', content: 'q2' },
      { role: 'assistant', isArena: true, arenaData: { voted: true, winner: 'tie', a: { content: '' }, b: { content: '' } } },
    ];
    expect(arenaTurnIndex(messages)).toBe(2);
  });

  it('counts a still-pending arena round same as a voted one', () => {
    // The index identifies the round itself, not whether it has been voted on yet,
    // so a pending round still occupies a slot. (This test used to assert the
    // opposite — that pending rounds were skipped — which was the bug: it let the
    // next round's vote reuse an index already claimed by a comparison still
    // awaiting a vote.)
    const messages = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', isArena: true, arenaData: { voted: false, winner: null, a: { content: '' }, b: { content: '' } } },
    ];
    expect(arenaTurnIndex(messages)).toBe(1);
  });

  it('does not reuse an index when an earlier round went unvoted', () => {
    // The index identifies the round, and the backend stores one arena turn per
    // (session_id, turn_index). Counting votes instead of rounds made a skipped vote
    // collapse two different comparisons onto one stored turn.
    const messages = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', isArena: true, arenaData: { voted: false, winner: null, a: { content: '' }, b: { content: '' } } },
      { role: 'user', content: 'q2' },
    ];
    expect(arenaTurnIndex(messages)).toBe(1);
  });

  it('counts an ordinary assistant answer as no round at all', () => {
    const messages = [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a' },
    ];
    expect(arenaTurnIndex(messages)).toBe(0);
  });
});

describe('nextArenaTurnIndex', () => {
  it('is 0 for an empty chat (falls back to the count)', () => {
    expect(nextArenaTurnIndex([])).toBe(0);
  });

  it('falls back to the count when nothing carries a stored turnIndex (a chat never restored)', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', isArena: true, arenaData: { voted: true, winner: 'a', a: {}, b: {} } },
      { role: 'user', content: 'q2' },
      { role: 'assistant', isArena: true, arenaData: { voted: true, winner: 'tie', a: {}, b: {} } },
    ];
    expect(nextArenaTurnIndex(messages)).toBe(2);
  });

  it('is one more than the highest stored turnIndex, not the count, for a restored conversation with a gap', () => {
    // Round 1 failed on one side and was never posted: a restored conversation
    // holds only the comparisons that made it to the server, at indices 0 and 2.
    // Counting arena messages (2) would collide with the round already at index 2;
    // the next free index is 3.
    const messages = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', isArena: true, arenaData: { turnIndex: 0, voted: true, winner: 'a', a: {}, b: {} } },
      { role: 'user', content: 'q3' },
      { role: 'assistant', isArena: true, arenaData: { turnIndex: 2, voted: false, winner: null, a: {}, b: {} } },
    ];
    expect(nextArenaTurnIndex(messages)).toBe(3);
  });

  it('keeps using the highest stored index once a live-session round has been stamped with one', () => {
    // Continuing the SAME restored-with-a-gap conversation a second time: the
    // round just recorded (turnIndex 3) must count too, or the next one would
    // recompute 3 again and collide with what was just posted.
    const messages = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', isArena: true, arenaData: { turnIndex: 0, voted: true, winner: 'a', a: {}, b: {} } },
      { role: 'user', content: 'q3' },
      { role: 'assistant', isArena: true, arenaData: { turnIndex: 2, voted: false, winner: null, a: {}, b: {} } },
      { role: 'user', content: 'q4' },
      { role: 'assistant', isArena: true, arenaData: { turnIndex: 3, voted: false, winner: null, a: {}, b: {} } },
    ];
    expect(nextArenaTurnIndex(messages)).toBe(4);
  });

  it('finds the maximum regardless of array order', () => {
    const messages = [
      { role: 'assistant', isArena: true, arenaData: { turnIndex: 5, voted: true, winner: 'a', a: {}, b: {} } },
      { role: 'assistant', isArena: true, arenaData: { turnIndex: 1, voted: true, winner: 'b', a: {}, b: {} } },
    ];
    expect(nextArenaTurnIndex(messages)).toBe(6);
  });
});

// The recorder (src/App.jsx, when the round is sent) and the voter
// (src/components/ChatArea.jsx, when the round is voted on) each derive their
// own slice of "the messages before this round" from the chat's flat message
// list, using two different algorithms, and each feed that slice to
// arenaTurnIndex. If the two algorithms ever disagree on where a round's
// boundary is, the stored turn and the vote end up at different turn_index
// values and the vote silently never finds its turn (or — worse, per the
// backend's ArenaTurn model — lands on the wrong one). Neither file exports a
// standalone function for its slice, so these helpers reproduce each
// algorithm verbatim rather than re-deriving it from arenaTurnIndex itself.
describe('recorder/voter turnIndex agreement', () => {
  // Mirrors src/App.jsx's handleSendMessage: messageHistory always ends on the
  // round's new user question — freshly appended for a normal send, or, on
  // retry, the tail surviving dropTrailingNotice (chatTurns.js's
  // isInterruptedAssistant explicitly excludes isArena messages, so retry
  // never drops an arena bubble and this invariant holds either way).
  // historyBefore — everything strictly before that question — is what
  // recordArenaTurn's turnIndex is computed over.
  function recorderHistoryBefore(messageHistoryEndingInQuestion) {
    return messageHistoryEndingInQuestion.slice(0, -1);
  }

  // Mirrors src/components/ChatArea.jsx's message-list render loop: for the
  // arena message at arenaIndex, scan backward for the nearest preceding
  // user-role message and slice up to (not including) it. This is
  // messagesBeforeRound, what handleVote's turnIndex is computed over.
  function voterMessagesBeforeRound(messages, arenaIndex) {
    let questionIndex = -1;
    for (let i = arenaIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        questionIndex = i;
        break;
      }
    }
    return questionIndex >= 0 ? messages.slice(0, questionIndex) : messages.slice(0, arenaIndex);
  }

  it.each([
    ['no prior history at all (first round in the chat)', []],
    ['one earlier round, voted', [
      { role: 'user', content: 'q1' },
      { role: 'assistant', isArena: true, arenaData: { voted: true, winner: 'a', a: { content: 'A1' }, b: { content: 'B1' } } },
    ]],
    ['one earlier round, still pending a vote', [
      { role: 'user', content: 'q1' },
      { role: 'assistant', isArena: true, arenaData: { voted: false, winner: null, a: { content: 'A1' }, b: { content: 'B1' } } },
    ]],
    ['a persisted half-failed round (one side never got a model)', [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant', isArena: true,
        arenaData: { voted: false, winner: null, a: { model: null, content: '' }, b: { model: 'm', content: 'B1' } },
      },
    ]],
    ['arena / plain / arena interleaving', [
      { role: 'user', content: 'q1' },
      { role: 'assistant', isArena: true, arenaData: { voted: true, winner: 'a', a: { content: 'A1' }, b: { content: 'B1' } } },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a plain, non-arena answer' },
      { role: 'user', content: 'q3' },
      { role: 'assistant', isArena: true, arenaData: { voted: false, winner: null, a: { content: 'A3' }, b: { content: 'B3' } } },
    ]],
    ['several prior rounds, mixed voted/unvoted/tie', [
      { role: 'user', content: 'q1' },
      { role: 'assistant', isArena: true, arenaData: { voted: true, winner: 'a', a: { content: 'A1' }, b: { content: 'B1' } } },
      { role: 'user', content: 'q2' },
      { role: 'assistant', isArena: true, arenaData: { voted: false, winner: null, a: { content: 'A2' }, b: { content: 'B2' } } },
      { role: 'user', content: 'q3' },
      { role: 'assistant', isArena: true, arenaData: { voted: true, winner: 'tie', a: { content: 'A3' }, b: { content: 'B3' } } },
    ]],
  ])('%s', (_label, priorMessages) => {
    // Recorder's view, at the moment the new round is sent: the new round's
    // question is the tail of messageHistory.
    const messageHistory = [...priorMessages, { role: 'user', content: 'the new question' }];
    const recorderIndex = arenaTurnIndex(recorderHistoryBefore(messageHistory));

    // Voter's view, once the round has landed in the chat and can be voted on:
    // the same messages, plus this round's own arena bubble appended right
    // after the question — exactly how chat.messages looks by the time
    // ChatArea.jsx renders it.
    const fullMessages = [
      ...messageHistory,
      { role: 'assistant', isArena: true, arenaData: { voted: false, winner: null, a: { content: '' }, b: { content: '' } } },
    ];
    const arenaIndex = fullMessages.length - 1;
    const voterIndex = arenaTurnIndex(voterMessagesBeforeRound(fullMessages, arenaIndex));

    expect(recorderIndex).toBe(voterIndex);
  });
});

// The normal (non-arena) send path forwards a chat's flat message array to the
// backend as the request body verbatim (src/App.jsx's handleSendMessage,
// non-arena branch). The backend's ChatMessage schema requires `content` on
// every message; an arena message — live or restored — has none at the top
// level (its answer lives in arenaData, per side), so sending it unprojected
// 422s the whole request. This is the single-linear-continuation analogue of
// buildArenaHistories: ONE assistant turn per arena round instead of two
// branches.
describe('projectArenaMessagesForContinuation', () => {
  it('returns an empty array for an empty chat', () => {
    expect(projectArenaMessagesForContinuation([])).toEqual([]);
  });

  it('passes a plain user/assistant history through unchanged', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1', completionId: 'c1' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
    ];
    const result = projectArenaMessagesForContinuation(messages);
    expect(result).toEqual(messages);
    expect(result.every((m) => typeof m.content === 'string')).toBe(true);
  });

  it('collapses a voted "a" round to one assistant turn carrying A\'s content', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant', isArena: true,
        arenaData: { a: { content: 'A1' }, b: { content: 'B1' }, voted: true, winner: 'a' },
      },
    ];
    const result = projectArenaMessagesForContinuation(messages);
    expect(result).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'A1' },
    ]);
  });

  it('collapses a voted "b" round to one assistant turn carrying B\'s content', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant', isArena: true,
        arenaData: { a: { content: 'A1' }, b: { content: 'B1' }, voted: true, winner: 'b' },
      },
    ];
    const result = projectArenaMessagesForContinuation(messages);
    expect(result).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'B1' },
    ]);
  });

  it('drops an unvoted round entirely, matching buildArenaHistories', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant', isArena: true,
        arenaData: { a: { content: 'A1' }, b: { content: 'B1' }, voted: false, winner: null },
      },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
    ];
    const result = projectArenaMessagesForContinuation(messages);
    expect(result).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
    ]);
  });

  it('does not crash on an unvoted round that is not the last message', () => {
    // voteIsPending (App.jsx) only gates the composer when the unvoted round
    // is the LAST message; a restored chat can hold one earlier in the
    // history (e.g. a round abandoned mid-vote on another device), and this
    // must handle it rather than throw.
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant', isArena: true,
        arenaData: { a: { content: 'A1' }, b: { content: 'B1' }, voted: false, winner: null },
      },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'q3' },
    ];
    expect(() => projectArenaMessagesForContinuation(messages)).not.toThrow();
    const result = projectArenaMessagesForContinuation(messages);
    expect(result.every((m) => typeof m.content === 'string')).toBe(true);
  });

  // No single "winner" answer exists for a tie or a both_bad vote —
  // buildArenaHistories diverges into two branches there, which a single
  // linear continuation cannot do; a choice has to be made. Falls back to
  // side A's content: the same fallback the backend itself uses for the
  // arena row's generic top-level `content` column (RAG-Core's
  // ArenaTurn.content: "mirrored from the stored row's NOT NULL `content`
  // column ... a generic consumer that doesn't special-case 'arena' turns
  // still gets a sensible string here"). Matching that existing precedent
  // beats inventing a second, different convention for the same situation.
  it('falls back to side A\'s content on a tie, mirroring the backend\'s own fallback', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant', isArena: true,
        arenaData: { a: { content: 'A1' }, b: { content: 'B1' }, voted: true, winner: 'tie' },
      },
    ];
    const result = projectArenaMessagesForContinuation(messages);
    expect(result).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'A1' },
    ]);
  });

  it('falls back to side A\'s content on both_bad, same as tie', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant', isArena: true,
        arenaData: { a: { content: 'A1' }, b: { content: 'B1' }, voted: true, winner: 'both_bad' },
      },
    ];
    const result = projectArenaMessagesForContinuation(messages);
    expect(result).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'A1' },
    ]);
  });

  it('never emits a message without a content string, over a mixed history', () => {
    const messages = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'plain answer' },
      { role: 'user', content: 'q2' },
      {
        role: 'assistant', isArena: true,
        arenaData: { a: { content: 'A2' }, b: { content: 'B2' }, voted: true, winner: 'a' },
      },
      { role: 'user', content: 'q3' },
      {
        role: 'assistant', isArena: true,
        arenaData: { a: { content: 'A3' }, b: { content: 'B3' }, voted: false, winner: null },
      },
      { role: 'user', content: 'q4' },
      {
        role: 'assistant', isArena: true,
        arenaData: { a: { content: 'A4' }, b: { content: 'B4' }, voted: true, winner: 'tie' },
      },
      { role: 'user', content: 'q5' },
    ];
    const result = projectArenaMessagesForContinuation(messages);
    expect(result.every((m) => typeof m.content === 'string')).toBe(true);
  });
});
