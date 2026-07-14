# Design: throttle the end-of-session survey

Date: 2026-07-14
Status: Approved design

## Goal

The end-of-session survey ("Будете ли пользоваться Меноном для похожих вопросов?")
currently shows every time the user leaves an answered chat, which annoys users and
makes the collected statistics uninformative. Throttle it to **at most once per 10
completed dialogues per browser**: show it on the user's **first** completed dialogue,
then not again until 10 more have passed.

## Current behavior

`App.jsx` (survey-trigger `useEffect`, ~L477–489) fires the modal whenever the user
leaves a chat that (a) received at least one assistant answer and (b) is not yet
`surveyed`. The per-chat `surveyed` flag (persisted with chats in `localStorage` via
`chatStore`) only prevents re-asking the *same* chat. The backend `/survey` endpoint
and DB just store whatever answer is submitted.

## Design (frontend only)

1. **New pure module `src/services/surveyGate.js`** — all gating logic, isolated so a
   future smarter policy (react to important/controversial topics) can replace it
   without touching `App.jsx`:
   - `export const SURVEY_INTERVAL = 10`
   - `decideSurvey({ seenOnce, sinceShown }, interval = SURVEY_INTERVAL)` → `{ show, next }`
     - `!seenOnce` → `{ show: true, next: { seenOnce: true, sinceShown: 0 } }` (first dialogue)
     - else `n = sinceShown + 1`; `n >= interval` → show + reset; else suppress, `sinceShown = n`
   - `readSurveyState()` / `writeSurveyState(state)` over `localStorage`
     (key `meno_survey_gate`), tolerant of missing/corrupt values
     (default `{ seenOnce: false, sinceShown: 0 }`).

2. **`App.jsx` trigger effect** — replace the unconditional `setSurveySessionId(prevId)`:
   ```js
   const { show, next } = decideSurvey(readSurveyState());
   writeSurveyState(next);
   setChats(prev => prev.map(c => (c.id === prevId ? { ...c, surveyed: true } : c)));
   if (show) setSurveySessionId(prevId);
   ```
   The `surveyed` flag now means "this dialogue's survey opportunity was consumed"
   (counted once), so revisiting/re-leaving the same chat cannot double-count. The
   existing `prevActiveChatRef` guard prevents the `setChats` re-render from
   reprocessing (after the first pass `prevId === activeChatId`).

3. Chat schema, `SurveyModal`, the `/survey` endpoint, DB, and the API contract are
   **unchanged**.

## Test plan (vitest, `src/services/surveyGate.test.js`)

- `decideSurvey`: first call (`seenOnce:false`) → `show:true`, resets to
  `{seenOnce:true, sinceShown:0}`.
- Calls 2–10 (`seenOnce:true`) suppress and increment; the 10th (`sinceShown:9` → `n:10`)
  → `show:true` + reset.
- Custom interval respected.
- `read/writeSurveyState` round-trip; `readSurveyState` returns the default on missing
  and on corrupt JSON.

## Out of scope / follow-ups

- Backend/per-user cross-device counting (chose browser-local `localStorage` for now).
- Smart topic-aware selection of which dialogue to survey — `SURVEY_INTERVAL` and the
  isolated `decideSurvey` are the seam for that later.
- The very first survey for an existing user fires on their next completed dialogue
  after this ships (no stored state yet) — intended.
