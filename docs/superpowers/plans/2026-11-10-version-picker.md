# Version Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users choose the Meno version first (Менон 1.0, Менон 1.1, stands) and then a model for it, seeing names only.

**Architecture:**
- **Backend.** `GET /v1/models` in Meno-Stand-RAG-Core gains four additive fields on every entry: `stand_id`,
  `stand_name`, `llm_id`, `llm_name`. Stands are named by our stands file before their manifest.
- **Pure logic.** Meno-Web gets a module `src/services/versions.js`: grouping, deriving the fields for an older
  backend, and the fallback rule.
- **Menu.** A new `VersionPicker` component replaces the model dropdown in `SettingsBar`.
- **App.** `App.jsx` uses the new fallback rule.

**Tech Stack:**
- Python 3.12, FastAPI, pytest.
- React 18, Vite, vitest with @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-11-10-version-picker-design.md` (this repo). Read it first: it is binding.

## Global Constraints

- **Git identity.** Author and committer on every commit:
  `git -c user.name=sckwoky -c user.email=sckwokyboom@gmail.com commit ...`. No trailers. Do not push.
- **Where to work:**
  - backend in `~/Meno-RAG-Core-gateway`, on branch `feat/version-fields` created from `origin/main`;
  - frontend in `~/Meno-Web-picker`, branch `feat/version-picker`.
- **Do not touch** `~/Meno-RAG-Core` (someone's uncommitted work; only its `.venv` binaries are used) or `~/Meno-Web`.
  Never `git stash`.
- **Memory on this machine (3.9 GB):**
  - check `free -m` before tests;
  - backend: one test file at a time,
    `~/Meno-RAG-Core/.venv/bin/python -m pytest tests/<file> -q -p no:cacheprovider`, and only with more than
    1200 MB available (more than 1600 MB for files that import `meno_rag.api.main`);
  - never run the whole backend suite here: the controller runs it on the server;
  - frontend: `npx vitest run <file>`; the whole frontend suite is fine at the end of a task.
- **Additive only.** The backend change only adds fields. No existing field of `/v1/models` changes value;
  `backend_name` keeps the manifest-first rule.
- **Exact strings:**
  - built-in ids `menon-1.0`, `menon-1.1`;
  - backend names `Менон 1.0`, `Менон 1.1`;
  - default `LLM_DISPLAY_NAMES=gemma-4-12B-it=Gemma 4 12B`;
  - UI names: ru `Менон 1.0` / `Менон 1.1`, en `Meno 1.0` / `Meno 1.1`;
  - hints: ru `Версия` / `Модель`, en `Version` / `Model`;
  - unavailable label: ru `недоступна`, en `unavailable`;
  - tooltip: ru `Версия Менона и модель, которые отвечают на ваши вопросы.`, en
    `The Meno version and model that answer your questions.`
- **Untouched:** the arena (including `arenaMatching.js`), history, leaderboard, feedback, the knowledge-base
  selector, and the stand contract.
- **No internals in the picker.** No pipeline names, knowledge-base ids, endpoints or retrieval wording. The trigger's
  old OpenRouter sublabel `gen only · <core> for retrieval` goes away.

## Review Focus

1. **A provider's own model id containing `@`** (an OpenRouter id like `vendor/model@beta`) on an older backend must
   stay under Менон 1.0, not become a bogus version. Test in Task 3.
2. **A model that turns unreachable while the set of ids stays the same** must show as unavailable after the menu
   refreshes the list. Today the refresh keeps the old list when the ids match. Test in Task 5.
3. **The version shown in step 2 disappears from a refreshed list** while the menu is open. The menu returns to step 1
   without an error. Test in Task 4.
4. **The chat's entry is temporarily rate-limited** (status, not removal). The chat keeps it, with no jump. Test in
   Task 3.
5. **`LLM_DISPLAY_NAMES` is malformed** (`broken;=x;meno-lite=Лайт`). Bad parts are ignored, good ones apply, and the
   service starts. Test in Task 2.

Long names (a stand called «Поиск по нормативным документам НГУ») must ellipsize in the trigger and in the rows at
390px. This is checked by hand in Rollout.

---

## Part A — backend (Meno-Stand-RAG-Core, `~/Meno-RAG-Core-gateway`)

Before Task 1: `git -C ~/Meno-RAG-Core-gateway fetch origin && git -C ~/Meno-RAG-Core-gateway checkout -b feat/version-fields origin/main` (the worktree is clean; its current branch `feat/gateway-stands` is merged).

### Task 1: Stand entries carry the version fields; our stand name wins

**Files:**
- Modify: `src/meno_rag/api/stands/registry.py`, the entry dict built in `StandRegistry._entries_of` (about lines
  280–311).
- Test: `tests/stands/test_stand_registry.py`. Use the `_registry`, `_listed` and `_run` helpers and `manifest()` from
  `tests/stands/_helpers.py`.

**Interfaces:**
- Produces, on every stand entry:
  - `stand_id: str` (the stand id);
  - `stand_name: str` (`stand.name` if non-empty, else the manifest's `name`, else `stand.id`);
  - `llm_id: str` (already present);
  - `llm_name: str` (the same value as `display_name`: the llm's display name, else its name, else its id).
- `backend_name` is unchanged (manifest first).

- [ ] **Step 1: Write the failing tests**

```python
def test_the_entries_carry_the_version_fields():
    reg, _ = _registry(manifest(llms=[{"id": "gemma", "name": "Gemma 4"}], default_llm="gemma", name="RAGU"))
    e = _run(_listed(reg))[0]
    assert (e["stand_id"], e["stand_name"], e["llm_id"], e["llm_name"]) == ("lab", "RAGU", "gemma", "Gemma 4")


def test_our_name_for_a_stand_wins_over_its_manifest():
    reg, _ = _registry(manifest(name="RAGU"), name="Поиск по документам")
    e = _run(_listed(reg))[0]
    assert e["stand_name"] == "Поиск по документам"
    assert e["backend_name"] == "RAGU"  # unchanged: older frontends keep what they had


def test_a_plain_stand_without_a_name_is_named_by_its_id():
    reg, _ = _registry(None)  # a plain endpoint: no manifest
    e = _run(_listed(reg))[0]
    assert e["stand_name"] == "lab" and e["stand_id"] == "lab"
```

- [ ] **Step 2: Run** `pytest tests/stands/test_stand_registry.py -q`. The 3 new tests fail with `KeyError: 'stand_id'`.
- [ ] **Step 3: Add the four keys in `_entries_of`.** Compute `stand_name` from `stand.name`, then the manifest
  `name`, then `stand.id`.
- [ ] **Step 4: Run the file again.** All tests pass.
- [ ] **Step 5: Commit** `feat(stands): model entries name their stand and model for the version picker`

### Task 2: Our own entries carry the version fields; LLM_DISPLAY_NAMES

**Files:**
- Modify:
  - `src/meno_rag/api/metrics.py:164` — `MENON_10 = "menon-1.0"`, `MENON_11 = "menon-1.1"`,
    `BUILTIN_STANDS = frozenset({MENON_10, MENON_11})`,
    `BUILTIN_STAND_NAMES = {MENON_10: "Менон 1.0", MENON_11: "Менон 1.1"}`.
  - `src/meno_rag/config.py` (next to `v2_model_aliases`, about line 223) — `llm_display_names: str` with default
    `"gemma-4-12B-it=Gemma 4 12B"` and alias `LLM_DISPLAY_NAMES`, plus a one-line comment.
  - `src/meno_rag/api/knowledge_bases.py` — `virtual_model_entries` sets the 1.1 fields; new
    `apply_llm_display_names`.
  - `src/meno_rag/api/main.py` `list_models` (about lines 545–635) — the 1.0 fields on vLLM, OpenRouter and default
    entries; one final `apply_llm_display_names` pass over all entries, stands included.
  - Any `example.env` or settings doc that lists `V2_MODEL_ALIASES` gets `LLM_DISPLAY_NAMES` beside it.
- Test:
  - `tests/v2/test_virtual_models.py` — uses its `_client(make_client)` and `FakeRegistry`;
  - `tests/test_models_endpoint.py` — the OpenRouter case, following that file's existing OpenRouter setup;
  - `tests/stands/test_stand_chat.py` — the order, using `stand_client` from `tests/stands/_helpers.py`.

**Interfaces:**
- Consumes: the stand entries from Task 1.
- Produces:
  - `metrics.MENON_10`, `metrics.MENON_11`, `metrics.BUILTIN_STAND_NAMES`;
  - `knowledge_bases.apply_llm_display_names(entries: list[dict], raw: str) -> None`, which sets
    `entry["llm_name"] = names.get(entry["llm_id"], entry["llm_name"])` with `names` from
    `parse_model_aliases(raw)`.

Field values:
- vLLM and default entries: `stand_id=MENON_10`, `llm_id=id`, `llm_name=id`.
- OpenRouter entries: `llm_name=display_name`.
- Менон 1.1 entries: `stand_id=MENON_11`, `llm_id=` the base id, `llm_name=` the base id.
- Every kind: `stand_name=BUILTIN_STAND_NAMES[stand_id]`. Then `LLM_DISPLAY_NAMES` overrides `llm_name` for any entry
  whose `llm_id` it maps.

- [ ] **Step 1: Write the failing tests**

```python
# tests/v2/test_virtual_models.py
def test_every_entry_names_its_version_and_model(make_client):  # noqa: F811  (fixture)
    c, _ = _client(make_client)
    data = {m["id"]: m for m in c.get("/v1/models").json()["data"]}
    f = lambda i: tuple(data[i][k] for k in ("stand_id", "stand_name", "llm_id", "llm_name"))  # noqa: E731
    assert f("meno-lite") == ("menon-1.0", "Менон 1.0", "meno-lite", "meno-lite")
    assert f("gemma-4-12B-it") == ("menon-1.0", "Менон 1.0", "gemma-4-12B-it", "Gemma 4 12B")
    assert f("gemma-4-12B-it@menon-1.1") == ("menon-1.1", "Менон 1.1", "gemma-4-12B-it", "Gemma 4 12B")
    assert f("other") == ("menon-1.0", "Менон 1.0", "other", "other")
    assert data["gemma-4-12B-it@menon-1.1"]["display_name"] == GEMMA  # old fields unchanged
    assert data["gemma-4-12B-it"]["display_name"] == "gemma-4-12B-it"


def test_a_malformed_llm_display_names_setting_keeps_its_good_parts(make_client, monkeypatch):  # noqa: F811
    monkeypatch.setenv("LLM_DISPLAY_NAMES", "broken;=x;meno-lite=Лайт")
    c, _ = _client(make_client)
    data = {m["id"]: m for m in c.get("/v1/models").json()["data"]}
    assert data["meno-lite"]["llm_name"] == "Лайт" and data["meno-lite@menon-1.1"]["llm_name"] == "Лайт"
    assert data["gemma-4-12B-it"]["llm_name"] == "gemma-4-12B-it"  # the setting replaces the default map


def test_the_default_entry_belongs_to_menon_10(make_client):  # noqa: F811  (fixture)
    c, _ = _client(make_client, ids=())
    first = c.get("/v1/models").json()["data"][0]
    assert first["stand_id"] == "menon-1.0" and first["llm_id"] == first["id"]
```

- `tests/test_models_endpoint.py`, `test_an_openrouter_entry_is_a_menon_10_model_named_by_its_display_name`: with
  that file's OpenRouter fixture, an OpenRouter entry has `stand_id == "menon-1.0"`, `llm_id == entry["id"]` and
  `llm_name == entry["display_name"]`.
- `tests/stands/test_stand_chat.py`, `test_the_model_list_runs_menon_10_then_11_then_the_stands`:
  - build the client with `stand_client` and set `c.app.state.vllm_registry` to the `FakeRegistry(("meno-lite",))`
    pattern from `tests/v2/test_virtual_models.py`;
  - assert that the list of `stand_id`s, with consecutive duplicates collapsed, equals
    `["menon-1.0", "menon-1.1", "lab"]`;
  - assert that the stand entry's `llm_name` follows `LLM_DISPLAY_NAMES` when its `llm_id` is mapped (map its llm id
    with `monkeypatch.setenv`).

- [ ] **Step 2: Run** each of the three files. The new tests fail on the missing keys.
- [ ] **Step 3: Implement** as described in Files and Interfaces. `metrics.py` keeps `BUILTIN_STANDS` as the same
  frozenset; existing users of it do not change.
- [ ] **Step 4: Run** the three files, then `tests/stands/test_stand_registry.py`, then
  `~/Meno-RAG-Core/.venv/bin/ruff check . && ~/Meno-RAG-Core/.venv/bin/ruff format --check .`. All clean.
- [ ] **Step 5: Commit** `feat(api): every model entry names its version and model; LLM_DISPLAY_NAMES`

## Part B — frontend (Meno-Web, `~/Meno-Web-picker`)

### Task 3: Version logic as pure functions

**Files:**
- Create: `src/services/versions.js`, `src/services/versions.test.js`.

**Interfaces:**
- Produces, all exported from `src/services/versions.js`:
  - `MENON_10 = 'menon-1.0'` and `MENON_11 = 'menon-1.1'`;
  - `BUILTIN_VERSION_KEYS = { 'menon-1.0': 'versionMenon10', 'menon-1.1': 'versionMenon11' }`;
  - `describeEntry(entry) -> { standId, standName, llmId, llmName }`;
  - `groupByVersion(models) -> Array<{ standId, standName, entries }>`, in order of first appearance;
  - `versionName(group, t) -> string`: `t(BUILTIN_VERSION_KEYS[standId])` for built-ins, else `standName`;
  - `isUsable(entry) -> boolean` is `!entry.requires_auth`;
  - `isAvailable(entry) -> boolean` is `(entry.status?.state ?? 'available') === 'available'`;
  - `rememberVersions(known: Map<string, string>, models) -> void` records id → standId;
  - `fallbackModelId(models, currentId, known) -> string`.

`describeEntry` uses the backend fields when `stand_id` is present. Otherwise it derives them:
- an id with `@` whose suffix is `menon-1.1`, or whose entry has `provider === 'external'`:
  `standId = suffix`, `llmId = prefix`;
- any other id: `standId = MENON_10`, `llmId = id`;
- `standName = stand_name ?? backend_name ?? standId`;
- `llmName = llm_name ?? (standId === MENON_11 ? llmId : (display_name || llmId))`.

`fallbackModelId` works like this:
1. If `models` is empty, return `currentId`.
2. If `currentId` is listed and `isUsable`, return it.
3. Otherwise find its version:
   - `known.get(currentId)`;
   - else, if it is listed, its own `standId`;
   - else the part after its last `@`, if that part is a `standId` in `groupByVersion(models)`;
   - else `MENON_10`.
4. Return the first usable entry of that version, preferring `isAvailable`.
5. Else the first usable entry of `MENON_10`, preferring available.
6. Else the first usable entry overall, preferring available.
7. Else `''`.

- [ ] **Step 1: Write the failing tests** in `src/services/versions.test.js`:
  - **describeEntry, backend fields.**
    `{id:'gemma-4-12B-it@menon-1.1', stand_id:'menon-1.1', stand_name:'Менон 1.1', llm_id:'gemma-4-12B-it', llm_name:'Gemma 4 12B'}`
    → `{standId:'menon-1.1', standName:'Менон 1.1', llmId:'gemma-4-12B-it', llmName:'Gemma 4 12B'}`.
  - **describeEntry, older backend:**
    - `{id:'meno-lite', provider:'vllm', display_name:'meno-lite'}` → `menon-1.0`, `'menon-1.0'`, `'meno-lite'`,
      `'meno-lite'`;
    - `{id:'meno-lite@menon-1.1', provider:'vllm', display_name:'Менон 1.1 (meno-lite)'}` → `standId 'menon-1.1'`,
      `llmId 'meno-lite'`, `llmName 'meno-lite'`;
    - `{id:'gemma@lab', provider:'external', backend_name:'RAGU', display_name:'Gemma 4'}` → `'lab'`, `'RAGU'`,
      `'gemma'`, `'Gemma 4'`.
  - **describeEntry, provider id with `@`** (Review Focus 1):
    `{id:'vendor/model@beta', provider:'openrouter', display_name:'Beta'}` → `standId 'menon-1.0'`,
    `llmId 'vendor/model@beta'`, `llmName 'Beta'`.
  - **groupByVersion.** Ids `['a', 'b@menon-1.1', 'c', 'd@lab' (provider external)]` → standIds
    `['menon-1.0', 'menon-1.1', 'lab']`; the 1.0 entries are `a` and `c`, in that order.
  - **fallbackModelId:**
    - keeps a usable current entry;
    - keeps a current entry whose status is `rate_limited` (Review Focus 4);
    - with models `meno-lite`, `gemma-4-12B-it`, `meno-lite@menon-1.1` and the current `gemma-4-12B-it@menon-1.1`
      gone → `'meno-lite@menon-1.1'`;
    - within 1.1, `x@menon-1.1` unreachable and `y@menon-1.1` available, current gone → `'y@menon-1.1'`;
    - current `q@lab` gone, `known` maps it to `lab`, no lab entries left → `'meno-lite'` (the first 1.0 entry);
    - current `or/x` listed with `requires_auth` → `'meno-lite'`;
    - `known` maps `a@weird` to `menon-1.1` → a 1.1 entry;
    - current `vendor/model@beta` gone, `known` empty → the first 1.0 entry;
    - empty models → `currentId`;
    - nothing usable → `''`.
- [ ] **Step 2: Run** `npx vitest run src/services/versions.test.js`. It fails (module missing).
- [ ] **Step 3: Implement** `src/services/versions.js`.
- [ ] **Step 4: Run it again.** It passes. Then run `npx eslint src/services`.
- [ ] **Step 5: Commit** `feat(models): versions and their models from the model list`

### Task 4: The VersionPicker menu

**Files:**
- Create: `src/components/VersionPicker.jsx`, `src/components/VersionPicker.css`, `src/components/VersionPicker.test.jsx`.
- Modify:
  - `src/components/SettingsBar.jsx`: replace the `.model-dropdown` block with `<VersionPicker …/>`; move
    `StatusIcon`, `formatUntil`, `ModelItem`, `ModelGroup` and `AllFreeModelsExpander` into `VersionPicker.jsx`;
    drop the OpenRouter sublabel;
  - `src/components/SettingsBar.test.jsx`: the three "locked models" tests click the «Менон 1.0» row before the model;
  - `src/App.test.jsx` (about lines 303–304): after clicking `.model-dropdown-trigger`, click «Менон 1.0» before
    «Model 2»;
  - `src/i18n.js`: ru and en.

**Interfaces:**
- Consumes: Task 3's `groupByVersion`, `describeEntry`, `versionName`, `isUsable`, `isAvailable`.
- Produces:
  `export default function VersionPicker({ models, selectedModel, onSelect, onRequireAuth, onOpen })`.
  - `onSelect(entryId)`;
  - `onOpen()` is called when the menu opens; it is the old `onDropdownOpen`;
  - `SettingsBar` passes `onModelChange`, `onOpenAuth` and `onDropdownOpen` through.
- New i18n keys:
  - `versionMenon10`, `versionMenon11`;
  - `versionHint` («Версия» / «Version»);
  - `versionUnavailable` («недоступна» / «unavailable»);
  - `versionBack` («Назад к версиям» / «Back to versions»), the back button's `aria-label`;
  - `tipModelSelect` takes the new texts from Global Constraints;
  - `modelDropdownHint` stays the step-2 hint («Модель»).
- DOM:
  - the trigger keeps the class `model-dropdown-trigger`, and its label holds two spans,
    `.version-trigger-version` and `.version-trigger-model`;
  - the menu keeps `model-dropdown-menu`;
  - version rows are buttons with class `version-row`;
  - the back control has class `version-back`.
- CSS:
  - reuse the `.model-dropdown*` rules in `SettingsBar.css`;
  - `VersionPicker.css` adds the row, back and trigger rules;
  - the separator ` · ` is a `::before` on the model span;
  - at `max-width: 768px` the two spans stack: the model in `0.72rem`, `var(--text-tertiary)`, no separator;
  - long names ellipsize.

Fixture `PROD` for the tests, four entries with backend fields as production lists them:
- `meno-lite` and `gemma-4-12B-it`: `stand_id 'menon-1.0'`, `stand_name 'Менон 1.0'`, `llm_name` `meno-lite` and
  `Gemma 4 12B`;
- `meno-lite@menon-1.1` and `gemma-4-12B-it@menon-1.1`: the same for `menon-1.1`.

- [ ] **Step 1: Write the failing tests** in `VersionPicker.test.jsx`. The language is ru unless a test says otherwise,
  and the en test resets it with `setLanguage('ru')`.
  - **Trigger.** With `selectedModel 'gemma-4-12B-it@menon-1.1'`, `.version-trigger-version` has text `Менон 1.1` and
    `.version-trigger-model` has text `Gemma 4 12B`.
  - **Step 1 of the menu.** Clicking the trigger shows the hint `Версия` and rows `Менон 1.0` and `Менон 1.1`, with no
    model rows. With selected `meno-lite`, the `Менон 1.0` row also contains `meno-lite`.
  - **Step 2 and back.** Clicking `Менон 1.1` shows the hint `Модель`, `meno-lite`, `Gemma 4 12B` and a
    `.version-back` reading `Менон 1.1`. Clicking `.version-back` shows the version rows again.
  - **Choosing a model.** In step 2 of 1.1, clicking `Gemma 4 12B` calls `onSelect('gemma-4-12B-it@menon-1.1')` and
    closes the menu.
  - **One-model version.** Add `{id:'lite@cag', provider:'external', stand_id:'cag', stand_name:'CAG', llm_id:'lite', llm_name:'meno-lite'}`;
    clicking `CAG` calls `onSelect('lite@cag')` at once.
  - **Unavailable version.** Stand `ragu`'s two entries have `status: {state: 'unreachable'}`. The `RAGU` row is
    disabled and shows `недоступна`; clicking it calls nothing.
  - **Locked one-model version.** `{id:'x@lab', provider:'external', stand_id:'lab', stand_name:'Лаб', llm_id:'x', llm_name:'x', requires_auth:true}`;
    clicking `Лаб` calls `onRequireAuth`, not `onSelect`.
  - **Reset.** Open the menu, go to step 2, press Escape: the menu is closed. Opening it again shows step 1.
  - **English names.** After `setLanguage('en')`, the rows read `Meno 1.0` and `Meno 1.1`, and a stand keeps its
    `stand_name`.
  - **OpenRouter inside Менон 1.0.** Use `{id:'local', provider:'vllm', display_name:'Local'}`, an OpenRouter entry
    with `featured: true` and `display_name:'OR Demo'`, and one with `featured: false` and `display_name:'OR Free'`,
    without backend fields. After `Менон 1.0`, `Другие модели` and the expander `All free models (1)` are shown.
  - **The open version disappears** (Review Focus 3). In step 2 of 1.1, `rerender` with the 1.0 entries only: the
    menu shows the version rows and nothing throws.
  - **Selection not listed.** `selectedModel 'gone'` shows the label `Модель`; `models []` gives the trigger class
    `no-models` and the text `Нет доступных моделей`.
  - **Keyboard focus.** With selected `gemma-4-12B-it` (1.0), opening step 2 of 1.1 focuses the `Gemma 4 12B` button.
- [ ] **Step 2: Run** `npx vitest run src/components/VersionPicker.test.jsx`. It fails.
- [ ] **Step 3: Implement** `VersionPicker` and wire it into `SettingsBar`; add the i18n keys; update the two
  existing test files.
- [ ] **Step 4: Run** `npx vitest run src/components src/i18n.test.js src/App.test.jsx`, then `npx eslint .`
  (0 errors; the two existing `react-hooks/exhaustive-deps` warnings in App.jsx may stay). All pass.
- [ ] **Step 5: Commit** `feat(models): choose the Meno version, then the model`

### Task 5: The app keeps a chat in its version; refresh notices status changes

**Files:**
- Modify: `src/App.jsx`:
  - the auto-fallback effect (about lines 653–664);
  - `handleModelsDropdownOpen` (about lines 766–774).
- Test: `src/App.test.jsx`.

**Interfaces:**
- Consumes: Task 3's `rememberVersions` and `fallbackModelId`.
- Produces: no new exports.

Changes:
- **Known versions.** `const knownVersionsRef = useRef(new Map())`. An effect on `[models]`, placed before the
  fallback effect, calls `rememberVersions(knownVersionsRef.current, models)`.
- **Fallback.** Keep the early return on an empty list or no active chat. Then compute
  `const target = fallbackModelId(models, selectedModel, knownVersionsRef.current)` and call
  `updateActiveChatRuntimeConfig({ modelId: target })` only when `target` is non-empty and differs from
  `selectedModel`.
- **Refresh on open.** `handleModelsDropdownOpen` keeps `prev` only when the ids AND each entry's `status?.state` are
  the same. A status change replaces the list (Review Focus 2).

- [ ] **Step 1: Write the failing tests** in `src/App.test.jsx`, using its `fetchModels` / `refreshModels` mocks and
  `resetApiMocks`:
  - **`keeps a chat in its version when its model goes away`.**
    - Before render, `localStorage.setItem('lastUsedModelId', 'a@menon-1.1')`.
    - `fetchModels` resolves to entries `c` (1.0), `a@menon-1.1` and `b@menon-1.1`, with backend fields and
      `llm_name`s `C`, `A`, `B`.
    - `refreshModels` resolves to `c` and `b@menon-1.1` only.
    - Click `.model-dropdown-trigger`; this refreshes the list.
    - Then `.version-trigger-version` reads `Менон 1.1` and `.version-trigger-model` reads `B`.
  - **`shows a model that turned unreachable after the menu refreshes`.**
    - `fetchModels` gives `m1` and `m2`, both available.
    - `refreshModels` gives the same ids with `m2.status = {state: 'unreachable'}`.
    - Open the menu, then the `Менон 1.0` row: the `Model 2` button is disabled.
- [ ] **Step 2: Run** `npx vitest run src/App.test.jsx`. The two new tests fail.
- [ ] **Step 3: Implement** the changes above.
- [ ] **Step 4: Run** `npx vitest run` (the whole suite), `npx eslint .` and `npm run build`. All pass.
- [ ] **Step 5: Commit** `feat(models): a chat stays in its version when its model goes away`

## Part C — rollout (the controller, not a task for subagents)

1. **Backend checks.** Run the full suite on the server (a copy of the tree under `~/meno-v2/gateway-test/<sha>`,
   `run_suite.sh`), then ruff and mypy on the server.
2. **Backend into main.** Push `feat/version-fields`, wait for CI to be green, then make a merge commit into `main`
   (sckwoky) and push it. Wait for CI on `main`.
3. **Backend deploy.** Prepare a deploy and a rollback for `main`; the existing `~/meno-v2/deploy_gw.sh` checks out
   `feat/gateway-stands`, so give it the branch and use a new `STATE`. Rehearse on a copy, then the owner runs it.
   Verify `/v1/models` on prod: the four fields, the old fields unchanged, the leaderboard unchanged.
4. **Frontend checks.** Run vitest, eslint and the build locally; check on prod data at 390px and on desktop, light
   and dark, including a long stand name.
5. **Frontend into main.** Push the branch, then fast-forward or merge into Meno-Web `main` (sckwoky); wait for CI
   on `main`.
6. **Frontend deploy.** Use the procedure used for `ba2abed` (bundle into `~/Meno-Stand/Meno-Web`, build, restart
   `node server.js`); the owner runs it.
7. **Clean up.** Delete Meno-Web branch `feat/external-backends` once the picker is live (ask the owner).
