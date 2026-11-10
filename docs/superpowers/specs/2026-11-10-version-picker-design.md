# Version picker: choose the Meno version, then the model

Date: 2026-11-10. Repos: Meno-Web (the picker) and Meno-Stand-RAG-Core (four new fields in `GET /v1/models`).
Mock-up the user chose (variant B): https://claude.ai/artifact/NjFTvmF44SsqAWh3VdEq6d (private to the owner).

## Why

The backend became a gateway (Meno-Stand-RAG-Core, branch feat/gateway-stands, in production since 2026-11-10).
Several answer pipelines now run side by side:
- our own Менон 1.0 and Менон 1.1;
- later, stands run by other team authors (RAGU, CAG).

Today the model menu is one flat list. Менон 1.1 appears in it as entries such as "Менон 1.1 (meno-lite)" next to
plain model ids, and a stand would add yet another group. The owner wants users to choose the version first and then
a model for it, without seeing how a version works inside.

## Goals

- Any user can switch versions; nothing is hidden behind sign-in beyond what is locked today (OpenRouter models).
- The user sees only names:
  - the version: «Менон 1.1»; in the English UI «Meno 1.1»;
  - the model: «meno-lite», «Gemma 4 12B».
- Variant B:
  - One trigger reads «Менон 1.1 · meno-lite».
  - The menu opens on step 1, the list of versions.
  - Choosing a version with several models opens step 2: that version's models and a back control.
  - Choosing a version with one model selects it at once.

## Non-goals

- No change to the arena, history, leaderboard, feedback or the stand contract (meno-backend/1).
- No short descriptions under versions.
- Attaching any stand is not part of this work.

## Anti-goals (a failure even if it works)

- **Inner workings in the UI.** Pipeline names (v2), knowledge-base ids, search details, endpoints or a stand author's
  internal names appear anywhere in the picker.
- **The current frontend breaks before the new one ships.** The backend change must only add fields.
- **A chat silently jumps to another version.** This must not happen when one model of its version goes away while
  another one is still there.

## Decisions

The owner decided:
- variant B;
- names only;
- every user can switch;
- all the points below were played back to the owner and confirmed ("Всё так").

Agreed in chat, proposed by me:
- **Labels.** No subtitles under versions.
- **Order.** Менон 1.0, then Менон 1.1, then stands in the order of the stands file (`STANDS_FILE`).
- **Stand names.** A stand's name is ours: the `name` in the stands file when it is set. Otherwise the manifest's
  `name` (written by the stand author), otherwise the stand id. Today the manifest's name wins; this reverses it.
- **Built-in version names.** The frontend gives the two built-in versions their names through i18n, by version id:
  - `menon-1.0`: ru «Менон 1.0», en «Meno 1.0»;
  - `menon-1.1`: ru «Менон 1.1», en «Meno 1.1».

  Stands show their name as the backend gives it, in both languages.
- **Remembering the choice.**
  - The pair (version, model) is kept per chat, as the model is today. It is one model entry id, e.g.
    `gemma-4-12B-it@menon-1.1`.
  - A new chat starts with the last pair used (the existing `LAST_USED_MODEL_KEY`).
  - The very first visit starts with Менон 1.0 · meno-lite: the first usable entry, as today.
- **Fallback when the chosen entry stops being usable.** Usable means the same as today: it is listed and not locked
  behind sign-in. Pick the first match from this list:
  1. another usable model of the same version;
  2. the first usable model of Менон 1.0;
  3. the first usable entry overall.

  Within each step, prefer an entry whose status is `available`.
- **Knowledge base.** The knowledge-base selector under the input stays hidden. It shows only when more than one
  base is listed, and production lists one (V2_EXPOSE_AS=models). A version already carries its own base.

## Backend: Meno-Stand-RAG-Core

Every entry of `GET /v1/models` gets four new fields. Nothing is removed or renamed: `id`, `display_name`,
`provider`, `pipeline`, `knowledge_base_id`, `backend_id`, `backend_name`, `status`, `requires_auth` and the rest
stay as they are, so the frontend in production keeps working.

| field | our plain entries (vLLM, OpenRouter, the default entry) | Менон 1.1 entries (`<base>@menon-1.1`) | stand entries (`<llm>@<stand>`) |
|---|---|---|---|
| `stand_id` | `menon-1.0` | `menon-1.1` | the stand id |
| `stand_name` | `Менон 1.0` | `Менон 1.1` | stands file `name`, else manifest `name`, else stand id |
| `llm_id` | the entry id | the base model id | the stand's own model id (`llm["id"]`) |
| `llm_name` | see below | see below | see below |

`llm_name` is the first that applies:
1. a new setting `LLM_DISPLAY_NAMES`:
   - format `id=name;id=name`, parsed like `V2_MODEL_ALIASES` (malformed parts ignored);
   - default `gemma-4-12B-it=Gemma 4 12B`;
   - it applies to every kind of entry, so one model has one name in every version;
2. for an OpenRouter entry, its `display_name`;
3. for a stand entry, the display name the stand gives for that model;
4. `llm_id`.

`stand_name` for the built-in versions is the Russian name. The frontend localizes those two by `stand_id` and uses
`stand_name` only for stands.

The order of `data` is already what the picker needs:
1. Менон 1.0 entries (vLLM, then OpenRouter);
2. Менон 1.1 entries;
3. stands in stands-file order.

A test pins it.

The built-in ids `menon-1.0` and `menon-1.1` are the ones already reserved in the stand registry and used in metric
labels (`metrics.BUILTIN_STANDS`). Reuse that constant rather than writing the strings again.

## Frontend: Meno-Web

**Grouping.** Group `models` by `stand_id`, in order of first appearance. Each group is
`{ standId, name, models }`:
- `name` is the i18n name for `menon-1.0` and `menon-1.1`, and `stand_name` otherwise;
- a model's name is its `llm_name`.

**Older backend.** If an entry lacks `stand_id`, derive the fields from the id:
- an id with `@`: `stand_id` is the part after the last `@`, `llm_id` the part before;
- an id without `@`: `stand_id` is `menon-1.0` and `llm_id` the id;
- the names fall back to `backend_name` or `stand_id`, and to `display_name` (for an id without `@`) or `llm_id`.

This keeps the picker sensible if the frontend ships first or the backend is rolled back.

**Trigger.**
- It reads `<version> · <model>`, with the model part in the secondary text colour.
- At the app's mobile breakpoint (≤768px in SettingsBar.css) the label takes two lines: version above, model below
  in small tertiary text.
- New tooltip:
  - ru «Версия Менона и модель, которые отвечают на ваши вопросы.»
  - en «The Meno version and model that answer your questions.»

**Step 1: versions.** A small hint «Версия» / «Version» heads one row per version.
- **Row content.** The version name. For the current version, the current model's name in tertiary text at the
  right.
- **Right edge.** A chevron when the version has more than one model. A check when it has one model and that model
  is current.
- **Unavailable version.** A version whose every model is unavailable (status `rate_limited` or `unreachable`;
  today's model row already disables those) is greyed, marked «недоступна» / «unavailable», and cannot be chosen.
  This includes a one-model version whose model is unavailable.
- **Version whose models are all locked behind sign-in.**
  - With one model, choosing it opens the sign-in dialog, as a locked model does today.
  - With several models, it is an ordinary chevron row; step 2 shows the locked rows, and choosing one opens the
    sign-in dialog.

**Step 2: models.**
- A back control «‹ <version name>» returns to step 1; the menu stays open.
- A hint «Модель» / «Model» heads the version's models, shown as today's model rows: status icon, lock for
  `requires_auth`, check for the current pair, state label for rate-limited or unreachable.
- If OpenRouter is enabled, Менон 1.0's step 2 keeps today's layout:
  1. its vLLM models;
  2. featured OpenRouter models under «Другие модели» / «Other models»;
  3. the «All free models (N)» expander.
- When step 2 opens for a version other than the current one, keyboard focus starts on the model with the same
  `llm_id`, if that model is usable there.

**Behaviour.**
- The menu always opens on step 1.
- Escape and an outside click close the menu and reset it to step 1.
- All rows are buttons reachable by keyboard.
- Choosing a model sets the chat's `modelId` to that entry's `id` and closes the menu.
- Choosing a version with one model does the same with that model's entry.

**Fallback.** The existing auto-fallback effect in App.jsx follows the rule in Decisions instead of "first usable
entry".

**Unchanged:**
- arena mode and its pairing;
- `LAST_USED_MODEL_KEY`;
- the knowledge-base selector logic;
- the leaderboard;
- the chat history.

**Not on main.** The unmerged branch `feat/external-backends` (0a7f20d: one menu group per external backend) is
superseded by this picker and is not merged.

## Rollout

1. **Backend first.** Use a short-lived branch from Meno-Stand-RAG-Core `main` and merge into `main` once CI is
   green. Deploy with the existing `~/meno-v2` scripts; the owner runs them, since they use sudo. The frontend in
   production ignores the new fields.
2. **Frontend second.** Use a short-lived branch from Meno-Web `main`, merge after CI and a check at phone width,
   then deploy to `~/Meno-Stand/Meno-Web`, which is served by `node server.js`.
3. **Rollback.** Each side rolls back on its own. The new frontend copes with an old backend through the fallback
   above.

## Testing

- **Backend.**
  - The four fields on each kind of entry: vLLM, OpenRouter, the default entry, Менон 1.1, a stand with a manifest,
    a plain stand.
  - Name priority for stands.
  - `LLM_DISPLAY_NAMES` parsing.
  - The order of `data`.
  - The response still carries the old fields.
- **Frontend (vitest).**
  - Grouping with the new fields and without them.
  - Moving between step 1 and step 2, and back.
  - A version with one model.
  - An unavailable version.
  - A locked model.
  - The fallback rule.
  - Built-in names in ru and en.
  - The trigger label, wide and narrow.
- **Manually.** On prod data after the backend deploy, at desktop and phone width, in light and dark theme.

## Settled after the builder check (my calls)

- **Production data.** Production today lists four entries; OpenRouter is disabled:
  - Менон 1.0: `meno-lite` and `gemma-4-12B-it`, both vLLM;
  - Менон 1.1: `meno-lite@menon-1.1` and `gemma-4-12B-it@menon-1.1`.

  Both versions have two models, so step 2 is the normal path. The OpenRouter layout in Менон 1.0's step 2 is kept
  but only exercised by tests.
- **Step 2 for other versions.** Every version other than Менон 1.0 shows its models as one flat list, in the order
  of the backend list. Менон 1.0 shows the OpenRouter groups only when such entries exist.
- **Version of an entry that vanished.** When the chat's entry is no longer listed, its version is taken from the
  previous model list, the last one that contained it. The frontend keeps that list for this purpose.
  - If it is not there (for example after a page reload), use the `@` rule: the part after the last `@`, but only if
    that is a version id present in the current list. Otherwise treat it as Менон 1.0.
  - A provider's own model id may contain `@`, which is why the suffix is only trusted when it names a listed
    version.
  - The fallback does nothing while the model list is empty or still loading; the current effect already returns
    early on an empty list.
- **A stand that was never reached** has no entries, so it is simply not listed: the registry lists only stands it
  has heard from. A stand that answered before and is down now lists its models as `unreachable`, so its version
  shows as unavailable.
- **Other readers of the model list.** Nothing else in the frontend reads model names. `arenaMatching.js` reads
  `provider` for its pool weights and stays as it is. `display_name` stays in the backend response for compatibility
  and is no longer shown by the picker.
- **Backend constants.** Add constants for the two built-in ids next to `metrics.BUILTIN_STANDS` and build that set
  from them; importing them from `metrics` is fine. The two Russian names are literals in the backend on purpose.

## Left to the builder

- Component structure; the picker may move out of SettingsBar into its own component.
- CSS details within the app's existing tokens and dropdown styles.
- i18n key names.
- Exact test names.
- Where the four fields are documented on the backend side.
