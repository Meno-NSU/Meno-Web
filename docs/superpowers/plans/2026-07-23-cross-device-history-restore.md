# Cross-Device History Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signing in on a second device shows the same conversations with the same content — questions, answers, shown sources, model labels, ratings, and arena comparisons with the chosen side.

**Architecture:** The backend contract is already merged and published in OpenAPI (`UserTurn | AnswerTurn | ArenaTurn`). This adds the three things missing on this side: a correct `turn_index`, the two arena write calls that make the backend's arena fix live, and a pure mapper turning `turns[]` into the message array `ChatArea` already renders — loaded from the server on sign-in, per conversation, with no localStorage cache for account chats.

**Tech Stack:** React 19, Vite, vitest + Testing Library, plain `fetch` through `src/services/api.js`.

**Spec:** `docs/superpowers/specs/2026-07-23-cross-device-history-restore-design.md`

---

## Orientation

**Commands.** `npm test` runs vitest once; `npm test -- src/services/arenaHistory.test.js` runs one
file. `npm run lint` must be clean before every commit.

**The i18n parity guard.** `src/i18n.js` holds a `translations` object with `ru` and `en`, and
`src/i18n.test.js` fails if the two key sets differ. Every user-visible string added here must be
added to BOTH.

**Auth header.** `fetchWithLogging` in `src/services/api.js` attaches `X-Auth-Token` for a
signed-in user, `X-Guest-Token` otherwise. Never `Authorization` — the public edge gates the site
with HTTP Basic Auth on that header, and setting it triggers a 401 prompt storm. Every new call
must go through the existing helpers, not raw `fetch`.

**Backend behaviour that is new and will surprise you.** `/v1/feedback`, `/v1/feedback/clear`,
`/v1/feedback/survey` and `/v1/arena/vote` now answer **404** when the caller does not own the
conversation. The realistic trigger is a chat started as a guest and then rated after signing in.
Task 8 handles it; until then, expect it.

**Chat shape.** `chats` in `App.jsx` is `{id, title, messages, updatedAt, runtimeConfig}`; `id` is
a `crypto.randomUUID()` reused as the backend `session_id`. A message is
`{role, content, sources?, completionId?, isArena?, arenaData?, isStreaming?}`, and an arena
message's `arenaData` is `{bubbleId, a, b, voted, winner}` where each side is
`{model, kb, content, ...}`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/services/arenaHistory.js` | `arenaTurnIndex` counts rounds, not votes | 1 |
| `src/services/api.js` | `arena` flag on chat; `recordArenaTurn`; `fetchConversations`; `fetchConversation` | 2, 3, 5 |
| `src/services/arenaMatching.js` | forward the `arena` flag to `sendChat` | 2 |
| `src/App.jsx` | post the finished comparison; load the server list; lazy-load a conversation | 3, 6 |
| `src/services/conversationRestore.js` | **new** — pure `turns[] → messages[]` mapper | 4 |
| `src/store/chatStore.js` | keep guest chats out of the signed-in list | 6 |
| `src/components/Sidebar.jsx` | the guest notice | 7 |
| `src/i18n.js` | new strings, ru and en | 7 |

---

# Phase 1 — a correct `turn_index`

## Task 1: `arenaTurnIndex` counts rounds, not votes

**Files:**
- Modify: `src/services/arenaHistory.js:52-58`
- Modify: `src/services/arenaHistory.test.js`

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('arenaTurnIndex', ...)` block in
`src/services/arenaHistory.test.js`:

```js
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
```

Then read the rest of that `describe` block. If an existing test asserts that unvoted rounds are
skipped, it encodes the bug — update it to the new meaning and say so in your report. Do not
delete it.

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -- src/services/arenaHistory.test.js
```

Expected: FAIL — `expected 0 to be 1`.

- [ ] **Step 3: Count every arena round**

In `src/services/arenaHistory.js`, replace `arenaTurnIndex`:

```js
export function arenaTurnIndex(messages) {
    // The ordinal of the next arena round in this chat — every comparison counts, voted or
    // not. The backend keys a stored arena turn on (session_id, turn_index), so counting only
    // voted rounds made a skipped vote hand the next comparison an index already in use.
    let count = 0;
    for (const msg of messages || []) {
        if (msg?.isArena) count++;
    }
    return count;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npm test -- src/services/arenaHistory.test.js
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/services/arenaHistory.js src/services/arenaHistory.test.js
git commit -m "fix(arena): turn_index is the round's ordinal, not the vote count"
```

---

# Phase 2 — the arena write path

## Task 2: Mark arena chat requests

**Files:**
- Modify: `src/services/api.js` (`sendChatMessage`)
- Modify: `src/services/arenaMatching.js` (`runArenaSideWithSubstitution`)
- Modify: `src/App.jsx` (the `runArenaSideWithSubstitution` call)
- Modify: `src/services/api.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/services/api.test.js`:

```js
describe('arena chat requests', () => {
    it('marks the request so the backend does not persist each side separately', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: 'c1', choices: [{ message: { content: 'a' } }], sources: [] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await sendChatMessage({ messages: [], modelId: 'm', knowledgeBaseId: 'kb', sessionId: 's', arena: true });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.arena).toBe(true);
    });

    it('omits the flag for an ordinary chat request', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: 'c1', choices: [{ message: { content: 'a' } }], sources: [] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await sendChatMessage({ messages: [], modelId: 'm', knowledgeBaseId: 'kb', sessionId: 's' });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.arena).toBeUndefined();
    });
});
```

Add `sendChatMessage` to that file's import list.

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -- src/services/api.test.js
```

Expected: FAIL — `expected undefined to be true`.

- [ ] **Step 3: Send the flag**

In `src/services/api.js`, add `arena = false,` to `sendChatMessage`'s destructured parameters
(after `stream = false,`), and build the payload so the key is present only when set:

```js
        const payload = {
            model: modelId,
            messages,
            stream,
            user: sessionId,
            knowledge_base_id: knowledgeBaseId,
            // Both arena sides share one session_id. Without this the backend persists each
            // side separately, writing the question twice and two assistant rows in a racing
            // order — history that breaks the strict user/assistant alternation it requires.
            // The finished comparison is posted once to /v1/arena/turn instead.
            ...(arena ? { arena: true } : {}),
        };
```

- [ ] **Step 4: Forward it from the arena runner**

In `src/services/arenaMatching.js`, add `arena = false,` to `runArenaSideWithSubstitution`'s
destructured parameters, and pass it in the `sendChat({...})` call:

```js
            const result = await sendChat({
                modelId: candidate.id, knowledgeBaseId: kbId, messages, sessionId, stream: true,
                arena,
                onEvent: (event) => {
                    if (event.type === 'content') firstTokenReceived = true;
                    onEvent(event);
                },
            });
```

In `src/App.jsx`, add `arena: true,` to the `runArenaSideWithSubstitution({...})` call, next to
`sendChat: sendChatMessage,`.

- [ ] **Step 5: Run and check**

```bash
npm test -- src/services/api.test.js src/services/arenaMatching.test.js
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/services/api.js src/services/arenaMatching.js src/App.jsx src/services/api.test.js
git commit -m "feat(arena): mark arena chat requests so the backend stores one turn"
```

---

## Task 3: Post the finished comparison

**Files:**
- Modify: `src/services/api.js` (new `recordArenaTurn`)
- Modify: `src/App.jsx` (call it when both sides finish)
- Modify: `src/services/api.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/services/api.test.js`:

```js
describe('recordArenaTurn', () => {
    it('posts the finished comparison with both sides', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
        vi.stubGlobal('fetch', fetchMock);

        await recordArenaTurn({
            sessionId: 'c1',
            question: 'Вопрос?',
            turnIndex: 0,
            sides: [
                { key: 'a', model: 'qwen', knowledgeBaseId: 'kb1', content: 'A', sources: [] },
                { key: 'b', model: 'llama', knowledgeBaseId: 'kb1', content: 'B', sources: [] },
            ],
        });

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toContain('/v1/arena/turn');
        const body = JSON.parse(options.body);
        expect(body.session_id).toBe('c1');
        expect(body.turn_index).toBe(0);
        expect(body.sides.map((s) => s.key)).toEqual(['a', 'b']);
        expect(body.sides[0].knowledge_base_id).toBe('kb1');
    });
});
```

Add `recordArenaTurn` to the import list.

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -- src/services/api.test.js
```

Expected: FAIL — `recordArenaTurn is not a function`.

- [ ] **Step 3: Add the call**

In `src/services/api.js`, immediately after `submitArenaVote`, built the same way it is:

```js
// Posted once when both arena sides have finished, not when the user votes — so an unvoted
// comparison is stored too. The vote endpoint later sets the winner on this turn.
export async function recordArenaTurn({ sessionId, question, turnIndex, sides }) {
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/arena/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            session_id: sessionId,
            question,
            turn_index: turnIndex,
            sides: sides.map((side) => ({
                key: side.key,
                model: side.model,
                knowledge_base_id: side.knowledgeBaseId,
                content: side.content,
                sources: side.sources || [],
            })),
        }),
    });
    if (!res.ok) throw await buildError(res, `Arena turn POST ${res.status}`);
}
```

`API_BASE_URL`, `fetchWithLogging` and `buildError` all already exist in this file.

- [ ] **Step 4: Call it when both sides finish**

In `src/App.jsx`, find where both arena sides have resolved and the bubble stops streaming — the
same place that already has both sides' models and content. Post the turn there:

```js
        // Store the comparison itself. Best-effort: the answer is already on screen, and a
        // failure here must never surface as a chat error. It is also a no-op server-side
        // without the history consent.
        try {
          await recordArenaTurn({
            sessionId: requestConfig.sessionId,
            question: questionText,
            turnIndex: arenaTurnIndex(messagesBeforeRound),
            sides: [
              { key: 'a', model: sideA.model, knowledgeBaseId: kbId, content: sideA.content, sources: sideA.sources || [] },
              { key: 'b', model: sideB.model, knowledgeBaseId: kbId, content: sideB.content, sources: sideB.sources || [] },
            ],
          });
        } catch (error) {
          console.error('Failed to record the arena turn:', error);
        }
```

`arenaTurnIndex` must be computed over the messages **before** this round, the same slice
`ChatArea` passes to the vote call — otherwise the stored turn and the vote disagree and the
winner never lands. Import `arenaTurnIndex` from `./services/arenaHistory.js` (App.jsx already
imports `buildArenaHistories` from there).

- [ ] **Step 5: Run and check**

```bash
npm test
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/services/api.js src/App.jsx src/services/api.test.js
git commit -m "feat(arena): record the finished comparison as one stored turn"
```

---

# Phase 3 — restore

## Task 4: The `turns[] → messages[]` mapper

**Files:**
- Create: `src/services/conversationRestore.js`
- Create: `src/services/conversationRestore.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/services/conversationRestore.test.js`:

```js
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
      role: 'assistant', content: 'Ответ.', model: 'qwen', completionId: 'run-1', sources: SOURCES,
    });
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
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -- src/services/conversationRestore.test.js
```

Expected: FAIL — cannot resolve `./conversationRestore.js`.

- [ ] **Step 3: Write the mapper**

Create `src/services/conversationRestore.js`:

```js
// Turns a conversation fetched from the server back into the message array ChatArea renders.
// The backend publishes these shapes in OpenAPI as UserTurn | AnswerTurn | ArenaTurn,
// discriminated on `kind`.
//
// Pure on purpose: no fetching, no state. What cannot come back — reasoning blocks, streaming
// state, per-chat model selection, locally renamed titles — is listed in the design doc; a
// restored message is simply a finished one.

function newBubbleId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `bubble-${Math.random().toString(36).slice(2, 10)}`;
}

function sideFrom(sides, key) {
    const side = (sides || []).find((s) => s?.key === key) || {};
    return {
        model: side.model ?? null,
        kb: side.knowledge_base_id ?? null,
        content: side.content || '',
        sources: side.sources || [],
        isStreaming: false,
    };
}

export function messagesFromTurns(turns) {
    const messages = [];
    for (const turn of turns || []) {
        if (turn?.kind === 'user') {
            messages.push({ role: 'user', content: turn.content || '' });
            continue;
        }
        if (turn?.kind === 'answer') {
            messages.push({
                role: 'assistant',
                content: turn.content || '',
                model: turn.model ?? null,
                // The backend's request_id is what the feedback endpoints key on, and what
                // this client has always called completionId.
                completionId: turn.request_id ?? null,
                sources: turn.sources || [],
                // The backend calls it `rating`; MessageFeedback reads `value`. Renaming here
                // means the restored control initialises itself with no wiring at all — it
                // already reads `message.feedback`.
                feedback: turn.feedback
                    ? { value: turn.feedback.rating, comment: turn.feedback.comment ?? null }
                    : null,
                isStreaming: false,
            });
            continue;
        }
        if (turn?.kind === 'arena') {
            messages.push({
                role: 'assistant',
                isArena: true,
                arenaData: {
                    // Only ever identifies a message object within one session, so a fresh one
                    // is correct on restore.
                    bubbleId: newBubbleId(),
                    a: sideFrom(turn.sides, 'a'),
                    b: sideFrom(turn.sides, 'b'),
                    turnIndex: turn.turn_index ?? null,
                    voted: turn.winner !== null && turn.winner !== undefined,
                    namesRevealed: turn.winner !== null && turn.winner !== undefined,
                    winner: turn.winner ?? null,
                },
                isStreaming: false,
            });
            continue;
        }
        // An unrecognised kind is dropped rather than guessed at: rendering a turn wrong is
        // worse than omitting it, and a newer backend may add kinds this client predates.
    }
    return messages;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npm test -- src/services/conversationRestore.test.js
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/services/conversationRestore.js src/services/conversationRestore.test.js
git commit -m "feat(history): map a fetched conversation back into messages"
```

---

## Task 5: Fetch conversations from the server

**Files:**
- Modify: `src/services/api.js`
- Modify: `src/services/api.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/services/api.test.js`:

```js
describe('conversation history', () => {
    it('lists the caller\'s conversations', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ conversations: [{ id: 'c1', updated_at: 'z', preview: 'Вопрос?' }] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const list = await fetchConversations();

        expect(fetchMock.mock.calls[0][0]).toContain('/v1/conversations');
        expect(list).toEqual([{ id: 'c1', updated_at: 'z', preview: 'Вопрос?' }]);
    });

    it('returns an empty list rather than throwing when there is no history', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
        expect(await fetchConversations()).toEqual([]);
    });

    it('fetches one conversation', async () => {
        const body = { id: 'c1', survey: null, turns: [{ kind: 'user', content: 'q', created_at: 'x' }] };
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
        vi.stubGlobal('fetch', fetchMock);

        const got = await fetchConversation('c1');

        expect(fetchMock.mock.calls[0][0]).toContain('/v1/conversations/c1');
        expect(got).toEqual(body);
    });
});
```

Add `fetchConversations` and `fetchConversation` to the import list.

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -- src/services/api.test.js
```

Expected: FAIL — `fetchConversations is not a function`.

- [ ] **Step 3: Add both calls**

In `src/services/api.js`, next to `clearChatHistory`, following the shape of the GET helpers
already in that file (read `fetchKnowledgeBases` first and match it — same base URL constant,
same `fetchWithLogging`, same non-ok handling):

```js
export async function fetchConversations() {
    // The caller's conversations, newest first. Identity comes from the auth header, so a guest
    // and a signed-in user see different lists from the same call.
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/conversations`);
    if (!res || !res.ok) return [];
    const data = await res.json();
    return data?.conversations || [];
}

export async function fetchConversation(conversationId) {
    // Full renderable state for one conversation: turns, per-answer feedback, survey answer.
    // Returns null when it is gone or belongs to somebody else — the backend answers 404 for
    // both, deliberately, so the caller cannot tell them apart.
    const res = await fetchWithLogging(`${API_BASE_URL}/v1/conversations/${encodeURIComponent(conversationId)}`);
    if (!res || !res.ok) return null;
    return res.json();
}
```

`fetchWithLogging` returns the response even when it is not ok, and returns `null` on a network
error — hence both guards. Note the deliberate difference from `fetchKnowledgeBases`, which
swallows everything into `[]`: a single conversation returns `null` so the caller can tell
"empty" from "gone".

- [ ] **Step 4: Run and check**

```bash
npm test -- src/services/api.test.js
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/services/api.js src/services/api.test.js
git commit -m "feat(history): fetch the conversation list and one conversation"
```

---

## Task 6: Show the server's history when signed in

**Files:**
- Modify: `src/store/chatStore.js`
- Modify: `src/App.jsx`
- Modify: `src/store/chatStore.test.js`

Read `App.jsx`'s chat effects before starting: `chats` is seeded from `loadChats()` and written
back by a `saveChats(chats)` effect on every change. That effect must stop writing account chats
to localStorage, or signing in would persist another person's history into this browser.

- [ ] **Step 1: Write the failing test**

Append to `src/store/chatStore.test.js`:

```js
describe('chatsForIdentity', () => {
  it('gives a signed-in user only the server list, never the local one', () => {
    const local = [{ id: 'local-1', title: 'Гостевой чат', messages: [], updatedAt: 1 }];
    const server = [{ id: 'srv-1', title: 'Вопрос?', messages: [], updatedAt: 2 }];
    expect(chatsForIdentity({ isAuthenticated: true, localChats: local, serverChats: server })).toEqual(server);
  });

  it('gives a guest the local list', () => {
    const local = [{ id: 'local-1', title: 'Гостевой чат', messages: [], updatedAt: 1 }];
    expect(chatsForIdentity({ isAuthenticated: false, localChats: local, serverChats: [] })).toEqual(local);
  });

  it('hides guest chats while signed in without destroying them', () => {
    const local = [{ id: 'local-1', title: 'Гостевой чат', messages: [], updatedAt: 1 }];
    const whileSignedIn = chatsForIdentity({ isAuthenticated: true, localChats: local, serverChats: [] });
    expect(whileSignedIn).toEqual([]);
    // The local list itself is untouched, so signing out brings them back.
    expect(chatsForIdentity({ isAuthenticated: false, localChats: local, serverChats: [] })).toEqual(local);
  });
});
```

Add `chatsForIdentity` to that file's import list.

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -- src/store/chatStore.test.js
```

Expected: FAIL — `chatsForIdentity is not a function`.

- [ ] **Step 3: Add the selector**

In `src/store/chatStore.js`:

```js
export function chatsForIdentity({ isAuthenticated, localChats = [], serverChats = [] }) {
    // A signed-in user sees only what the server has: the account is the source of truth, and
    // a shared computer must never show the previous person's conversations. A guest's chats
    // are hidden while signed in, not deleted — signing out brings them back.
    return isAuthenticated ? serverChats : localChats;
}
```

- [ ] **Step 4: Convert a server list entry into a chat**

Also in `src/store/chatStore.js`:

```js
export function chatFromSummary(summary, { defaultModelId = '', defaultKnowledgeBaseId = '' } = {}) {
    // The server has no title, only a preview of the first question, and no per-chat model
    // selection — so a restored chat opens on the defaults. `messages: null` marks it as
    // not-yet-loaded; the conversation is fetched when it is opened.
    return {
        id: summary.id,
        title: summary.preview || DEFAULT_CHAT_TITLE,
        messages: null,
        updatedAt: summary.updated_at || null,
        runtimeConfig: buildRuntimeConfig({
            chatId: summary.id,
            modelId: defaultModelId,
            knowledgeBaseId: defaultKnowledgeBaseId,
        }),
    };
}
```

- [ ] **Step 5: Wire it into `App.jsx`**

Three edits, in this order:

1. Hold the server list in its own state next to `chats`:
   ```js
   const [serverChats, setServerChats] = useState([]);
   ```

2. Load it whenever the identity changes to signed-in, and clear it on sign-out:
   ```js
   useEffect(() => {
     let cancelled = false;
     if (!auth.isAuthenticated) {
       setServerChats([]);
       return () => { cancelled = true; };
     }
     (async () => {
       const summaries = await fetchConversations();
       if (cancelled) return;
       setServerChats(summaries.map((s) => chatFromSummary(s, {
         defaultModelId: defaultModelIdRef.current,
         defaultKnowledgeBaseId: defaultKnowledgeBaseIdRef.current,
       })));
     })();
     return () => { cancelled = true; };
   }, [auth.isAuthenticated]);
   ```
   Use whatever this file already calls its default model / knowledge-base values; do not
   introduce new refs if plain values are already in scope.

3. Render from `chatsForIdentity({ isAuthenticated: auth.isAuthenticated, localChats: chats, serverChats })`
   wherever the sidebar list and the active chat are derived, and make the `saveChats(chats)`
   effect a no-op while `auth.isAuthenticated` — account history must not be written to
   localStorage.

- [ ] **Step 6: Load a conversation when it is opened**

When the selected chat has `messages === null`, fetch and fill it:

```js
  useEffect(() => {
    if (!auth.isAuthenticated || !activeChatId) return;
    const active = serverChats.find((c) => c.id === activeChatId);
    if (!active || active.messages !== null) return;
    let cancelled = false;
    (async () => {
      const conversation = await fetchConversation(activeChatId);
      if (cancelled) return;
      // 404 means gone or not ours; show it empty rather than spinning forever.
      const messages = conversation ? messagesFromTurns(conversation.turns) : [];
      setServerChats((prev) => prev.map((c) => (c.id === activeChatId ? { ...c, messages } : c)));
    })();
    return () => { cancelled = true; };
  }, [auth.isAuthenticated, activeChatId, serverChats]);
```

Guard the effect so it cannot re-fire for a chat it has already filled — `messages !== null` is
that guard, and `serverChats` in the dependency array is why it matters.

- [ ] **Step 7: Run everything**

```bash
npm test
npm run lint
```

Expected: all pass. If a component test breaks because a chat can now have `messages === null`,
that is a real finding — the renderer must tolerate it. Fix the renderer, not the test.

- [ ] **Step 8: Commit**

```bash
git add src/store/chatStore.js src/store/chatStore.test.js src/App.jsx
git commit -m "feat(history): a signed-in user's chats come from the server"
```

---

# Phase 4 — honesty in the UI

## Task 7: Tell a guest their chats live only in this browser

**Files:**
- Modify: `src/i18n.js`
- Modify: `src/components/Sidebar.jsx`
- Modify: `src/components/Sidebar.css`
- Create: `src/components/Sidebar.test.jsx` — this file does not exist yet; `Sidebar.jsx` is
  currently the one component without tests. Create it following `SettingsBar.test.jsx`, which
  renders a sibling sidebar component and is the closest existing model.

- [ ] **Step 1: Write the failing test**

Create `src/components/Sidebar.test.jsx` with a `baseProps` covering every prop `Sidebar.jsx`
destructures — read its signature first — and these two cases:

```jsx
  it('tells a guest their chats live only in this browser', () => {
    render(<Sidebar {...baseProps} isAuthenticated={false} />);
    expect(screen.getByText(/только в этом браузере/i)).toBeInTheDocument();
  });

  it('does not show that notice to a signed-in user', () => {
    render(<Sidebar {...baseProps} isAuthenticated />);
    expect(screen.queryByText(/только в этом браузере/i)).not.toBeInTheDocument();
  });
```

Match the file's existing render helpers and prop names; read it before writing.

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -- src/components/Sidebar.test.jsx
```

- [ ] **Step 3: Add the strings to BOTH languages**

In `src/i18n.js`, in `translations.ru`:

```js
        guestChatsLocalOnly: "Чаты этого устройства хранятся только в этом браузере. Войдите, чтобы они сохранялись в аккаунте и открывались на других устройствах.",
```

and in `translations.en`:

```js
        guestChatsLocalOnly: "Chats on this device live only in this browser. Sign in to keep them in your account and open them anywhere.",
```

`src/i18n.test.js` fails if a key exists in one language and not the other.

- [ ] **Step 4: Render it**

In `src/components/Sidebar.jsx`, below the chat list, when the user is not authenticated:

```jsx
      {!isAuthenticated && (
        <p className="sidebar-guest-notice">{t('guestChatsLocalOnly')}</p>
      )}
```

Use the component's existing translation helper and its existing prop for auth state; if it does
not receive one, thread it from `App.jsx` the way its sibling props are threaded. Style
`.sidebar-guest-notice` in `Sidebar.css` to match the sidebar's existing muted secondary text —
copy the rule the existing "no recent chats" empty state uses rather than inventing sizes.

- [ ] **Step 5: Run everything**

```bash
npm test
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/i18n.js src/components/Sidebar.jsx src/components/Sidebar.css src/components/Sidebar.test.jsx
git commit -m "feat(history): tell guests their chats live only in this browser"
```

---

## Task 8: Do not offer to rate a conversation the backend will refuse

**Files:**
- Modify: `src/components/MessageFeedback.jsx`
- Modify: `src/components/MessageFeedback.test.jsx`

The backend now answers **404** to `/v1/feedback`, `/v1/feedback/clear` and `/v1/feedback/survey`
when the caller does not own the conversation. The realistic trigger is a chat started as a guest
and rated after signing in: `sessionId` survives sign-in while the conversation stays tagged to
the guest session. Today that surfaces as a bare failure.

No wiring is needed to make a *restored* rating appear: `MessageFeedback` already reads
`message.feedback` and `message.feedback.value`, which is exactly what Task 4's mapper produces.
This task is only about the refusal.

- [ ] **Step 1: Write the failing test**

Append to `src/components/MessageFeedback.test.jsx`, matching the file's existing render helper:

```jsx
  it('explains a 404 instead of showing a generic failure', async () => {
    submitFeedback.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }));
    render(<MessageFeedback {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: /нравится/i }));

    expect(await screen.findByText(/другом устройстве|не принадлежит/i)).toBeInTheDocument();
  });
```

Adjust the button matcher to the component's actual accessible name — read the file first.

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -- src/components/MessageFeedback.test.jsx
```

- [ ] **Step 3: Add the strings to BOTH languages**

`translations.ru`:

```js
        feedbackNotYours: "Эта оценка относится к диалогу другого профиля — войдите в тот же аккаунт, чтобы оценить его.",
```

`translations.en`:

```js
        feedbackNotYours: "This rating belongs to a conversation from another profile — sign in to that account to rate it.",
```

- [ ] **Step 4: Handle the 404**

In `src/components/MessageFeedback.jsx`, catch the failure and branch on the status, showing
`feedbackNotYours` for 404 and the component's existing generic message otherwise. If the API
helper does not currently surface a status, add it there rather than parsing the message text —
and say so in your report, since that touches `src/services/api.js`.

- [ ] **Step 5: Run everything**

```bash
npm test
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/i18n.js src/components/MessageFeedback.jsx src/components/MessageFeedback.test.jsx
git commit -m "feat(history): explain a rating refused because the chat is another profile's"
```

---

## Task 9: Final check

- [ ] **Step 1: Full suite and lint**

```bash
npm test
npm run lint
```

- [ ] **Step 2: Verify against the real backend**

Start the dev server and check by hand, because none of the above proves the two repositories
agree on the wire:

1. Sign in, ask a question, reload the page — the chat is still there and the answer keeps its
   sources and its model label.
2. Rate the answer, reload — the rating control comes back filled in, not blank.
3. Run an arena comparison, vote, reload — one comparison with both answers and the chosen side,
   and the question appears once.
4. Sign out — guest chats reappear, account chats are gone from the list.

- [ ] **Step 3: Push**

```bash
git push -u origin HEAD
```

---

## Notes for whoever picks this up

- **Conversations from before consent was granted were never stored.** They cannot be restored,
  and nothing in the UI should imply otherwise.
- **Arena side sources are stored but not rendered.** The arena bubble shows no sources today, so
  restored comparisons carry them in the data and display nothing. That is a rendering gap, not a
  data one.
- **Old arena conversations stay malformed.** Anything written before the backend fix has a
  duplicated question and two assistant rows; the restore path will render them oddly. Cleanup was
  deliberately left out.
