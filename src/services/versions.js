export const MENON_10 = 'menon-1.0';
export const MENON_11 = 'menon-1.1';
export const RAGU = 'ragu';

// The versions in the menu, best first. A version not named here comes after them, and a legacy one comes last.
const VERSION_ORDER = [RAGU, MENON_11];
export const LEGACY_VERSIONS = new Set([MENON_10]);

// What a chat starts in when the person has not picked a model: the first of these that is listed, usable and
// available, else the first of them that is listed and usable. A choice names a version and, optionally, its model.
export const DEFAULT_CHOICES = [
  { standId: RAGU, llmId: 'gemma-4-12B-it' },
  { standId: MENON_11, llmId: 'gemma-4-12B-it' },
  { standId: MENON_10 },
];

export const BUILTIN_VERSION_KEYS = {
  'menon-1.0': 'versionMenon10',
  'menon-1.1': 'versionMenon11',
};

export function describeEntry(entry) {
  const id = entry.id;
  if (entry.stand_id) {
    const llmId = entry.llm_id ?? id;
    return {
      standId: entry.stand_id,
      standName: entry.stand_name ?? entry.backend_name ?? entry.stand_id,
      llmId,
      llmName: entry.llm_name ?? (entry.display_name || llmId),
    };
  }
  let standId = MENON_10;
  let llmId = id;
  const at = id.lastIndexOf('@');
  if (at > 0) {
    const suffix = id.slice(at + 1);
    if (suffix === MENON_11 || entry.provider === 'external') {
      standId = suffix;
      llmId = id.slice(0, at);
    }
  }
  return {
    standId,
    standName: entry.stand_name ?? entry.backend_name ?? standId,
    llmId,
    llmName: entry.llm_name ?? (standId === MENON_11 ? llmId : entry.display_name || llmId),
  };
}

export function groupByVersion(models) {
  const groups = new Map();
  for (const entry of models) {
    const d = describeEntry(entry);
    let group = groups.get(d.standId);
    if (!group) {
      group = { standId: d.standId, standName: d.standName, entries: [] };
      groups.set(d.standId, group);
    }
    group.entries.push(entry);
  }
  const rank = (group) => {
    const at = VERSION_ORDER.indexOf(group.standId);
    if (at >= 0) return at;
    return VERSION_ORDER.length + (LEGACY_VERSIONS.has(group.standId) ? 1 : 0);
  };
  return [...groups.values()].sort((a, b) => rank(a) - rank(b));
}

export function versionName(group, t) {
  const key = BUILTIN_VERSION_KEYS[group.standId];
  return key ? t(key) : group.standName;
}

export const isUsable = (entry) => !entry.requires_auth;

export const isAvailable = (entry) => (entry.status?.state ?? 'available') === 'available';

export function rememberVersions(known, models) {
  for (const entry of models) known.set(entry.id, describeEntry(entry).standId);
}

function firstUsable(entries) {
  const usable = entries.filter(isUsable);
  return usable.find(isAvailable) ?? usable[0];
}

export function defaultModelId(models) {
  const usable = (choice) => models.filter((m) => {
    const d = describeEntry(m);
    return isUsable(m) && d.standId === choice.standId && (!choice.llmId || d.llmId === choice.llmId);
  });
  for (const choice of DEFAULT_CHOICES) {
    const ready = usable(choice).find(isAvailable);
    if (ready) return ready.id;
  }
  for (const choice of DEFAULT_CHOICES) {
    const listed = usable(choice)[0];
    if (listed) return listed.id;
  }
  return firstUsable(models)?.id ?? '';
}

// The model for `currentId` (a chat's model, or the person's pick): kept while listed and usable; otherwise
// another model of its version; otherwise, as with no id at all, the default.
export function fallbackModelId(models, currentId, known) {
  if (!models.length) return currentId;
  if (!currentId) return defaultModelId(models);
  const current = models.find((m) => m.id === currentId);
  if (current && isUsable(current)) return currentId;

  const groups = groupByVersion(models);
  let standId = known.get(currentId);
  if (!standId && current) standId = describeEntry(current).standId;
  if (!standId) {
    const at = currentId.lastIndexOf('@');
    const suffix = at >= 0 ? currentId.slice(at + 1) : '';
    if (suffix && groups.some((g) => g.standId === suffix)) standId = suffix;
  }
  if (!standId) standId = MENON_10;

  const inVersion = groups.find((g) => g.standId === standId);
  const own = inVersion && firstUsable(inVersion.entries);
  if (own) return own.id;
  return defaultModelId(models);
}
