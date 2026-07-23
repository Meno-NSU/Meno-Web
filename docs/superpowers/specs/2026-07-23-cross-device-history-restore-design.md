# Design: cross-device history restore (frontend)

Part B of the cross-device history work. Part A — the backend contract — is merged in
Meno-Stand-RAG-Core (`docs/superpowers/specs/2026-07-23-conversation-state-parity-design.md`).
Nothing in this repository consumes it yet, so none of that work is visible to a user today.

## Goal

Signing in on a second device shows the same conversations, with the same content: questions
and answers, the sources shown under each answer, the model that answered, the ratings and
comments left, and arena comparisons with both answers and the chosen side. Signing out and
back in changes nothing.

## Current behavior / gaps

`App.jsx` holds `chats` in React state, seeded from `loadChats()` and written back to
`localStorage['meno_core_chats']` on every change. Nothing ever calls `GET /v1/conversations`.
The list is per-browser and per-profile: the same account on another device sees nothing.

Two write-side gaps make the backend's arena fix inert:

1. The chat request body is `{model, messages, stream, user, knowledge_base_id}` — no `arena`
   flag. Both arena sides therefore still persist themselves under one `session_id`, which is
   what produces the duplicated question and two racing assistant rows Part A exists to stop.
2. Nothing posts a finished comparison to `/v1/arena/turn`, so no arena turn is ever stored.

And one that corrupts what *is* stored:

3. **`turn_index` counts voted rounds, not rounds.** `arenaTurnIndex` (`src/services/arenaHistory.js`)
   increments only for `arenaData.voted`, and `ChatArea.jsx` sends that as the vote's
   `turn_index`. Skip voting on the first comparison and vote on the second, and the second is
   sent as index 0 — the index the first one would have had. Until Part A this only confused
   vote deduplication; now that `append_arena_turn` is idempotent on
   `(conversation_id, turn_index)`, two different comparisons collide onto one stored turn and a
   restored conversation silently loses a round.

## Decisions

**For a signed-in user the server is the only source of chats.** No localStorage cache for
account conversations: every chat list and every opened conversation comes from the API. This
costs a request per opened chat and makes history unavailable when the network is down, and it
is the choice that cannot show one person's chats to the next person on a shared computer.

**Guest chats stay in localStorage and are never uploaded to an account.** A guest's chats live
only in that browser; the UI must say so, because today nothing does and they are silently
lost. On sign-in the guest list is hidden — not deleted — and reappears on sign-out.

**`turn_index` becomes the ordinal of the arena round**, counting every round whether voted or
not. This changes the meaning of a value already flowing to `/v1/arena/vote`, so it is its own
change, landing before the rest.

## Restore mapping

The heart of this work: one pure function turning the backend's `turns[]` into the message
array `ChatArea` already renders. Backend shapes are published in OpenAPI as `UserTurn`,
`AnswerTurn` and `ArenaTurn`.

| backend turn | frontend message |
|---|---|
| `kind: "user"` | `{role: 'user', content}` |
| `kind: "answer"` | `{role: 'assistant', content, sources, completionId: request_id, model, feedback}` |
| `kind: "arena"` | `{role: 'assistant', isArena: true, arenaData: {bubbleId, a, b, voted, winner}}` |

For an arena turn, `a` and `b` come from the side whose `key` is `"a"` / `"b"`:
`{model, kb: knowledge_base_id, content}`. `voted` is `winner !== null`. `bubbleId` is minted
fresh on restore — it only ever identifies a message object within one session.

`feedback` is what makes the rating controls come back filled in rather than blank, which is
also what stops the same answer being rated twice.

## What cannot be restored, and why that is acceptable

Stating these plainly, because "the same conversation" should not quietly mean "almost".

- **Reasoning blocks and streaming state.** `ReasoningBlock` content, `thinkStartTime`,
  `isStreaming` — all transient, none stored. A restored answer appears complete, which is what
  it is.
- **Per-chat model and knowledge-base selection.** `chat.runtimeConfig` is local; the server
  stores the model on each answer, not the chat's current selection. A restored chat therefore
  opens with the default selection, and the model that produced each past answer is still shown
  on the answer itself. Storing the selection server-side is possible but is not part of
  restoring history.
- **Chat titles.** The server has no title, only a preview — the first user message. Restored
  chats are named from that preview, so a locally renamed chat loses its name on another device.
- **Conversations from before the service consent was granted.** They were never stored, by
  design. Nothing can bring them back, and the UI should not imply otherwise.
- **Arena side sources.** The backend stores them per side; the current arena bubble does not
  render sources at all. Restored comparisons will carry them in the data and show nothing until
  the bubble learns to.

## Write path

**Arena requests carry `arena: true`,** so the backend skips its own conversation writes. Both
sides send it.

**A finished comparison is posted once to `/v1/arena/turn`** with the question, both sides and
their sources, and its `turn_index`. Posted when both sides have finished, not when the user
votes, so an unvoted comparison is stored too. The existing vote call then sets the winner.

## Phases

1. **`turn_index` counts rounds.** Smallest, and everything else depends on it being right.
2. **Arena writes.** `arena: true` on both side requests; post the completed comparison. After
   this the backend's arena fix is live and history stops being written malformed.
3. **Restore.** The mapping function, `GET /v1/conversations` on sign-in, lazy per-conversation
   load on open, guest chats hidden while signed in.
4. **Honesty in the UI.** The guest notice; rating controls that do not offer to re-rate a
   conversation the signed-in user does not own (the backend now answers 404 there).

## Test plan

vitest, matching the repo's existing style — services tested directly, components through
Testing Library.

- `arenaTurnIndex` counts unvoted rounds; a skipped vote no longer reuses an index.
- The mapping function round-trips each turn kind, and an arena turn with `winner: null`
  restores as unvoted.
- An answer turn's `feedback` reaches the rating control as its initial state.
- Signing in replaces the visible chat list with the server's and hides guest chats; signing out
  brings them back.
- A guest sees the notice that chats live only in this browser.
- The i18n ru/en parity guard keeps passing — every new string exists in both.

## Follow-ups

- **The end-of-session survey swallows a refusal entirely.** `POST /v1/feedback/survey` is
  subject to the same ownership 404 the rating controls now explain, but `handleSurveyDone`
  closes the modal before the request resolves, marks the chat surveyed regardless, and only
  `console.warn`s on failure — `SurveyModal` has no error path at all. So a refused survey is
  indistinguishable from a successful one, with no retry and no notice. The "never nag twice"
  behaviour is deliberate; being unable to tell the two apart is not.

- **A network failure is indistinguishable from an empty history.** With the server as the only
  source of chats for a signed-in user, `fetchConversations` swallows a failed request and
  returns an empty list, so an offline user is told they have no conversations. That is the
  honest cost of the server-only decision, but it deserves a distinct error state — "could not
  load your history" rather than silence — before this is in front of many users.

- **Rounds that were never stored leave gaps in `turn_index`.** A comparison where one side
  failed is counted locally but never posted, and because `arena: true` suppresses the backend's
  own writes, such a round leaves no user turn on the server either: the question disappears from
  stored history entirely. The restored conversation is therefore missing that exchange. Storing
  the question even when a side fails would need the backend to accept a partial comparison.

## Out of scope

- Uploading guest chats into an account on sign-in. Decided against in Part A.
- Cleaning up arena conversations written before Part A; they keep their duplicated questions.
- Storing per-chat model selection or chat titles server-side.
- Offline access to account history.
