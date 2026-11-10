export const MENON_10 = 'menon-1.0';
export const MENON_11 = 'menon-1.1';

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
  return [...groups.values()];
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

export function fallbackModelId(models, currentId, known) {
  if (!models.length) return currentId;
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
  const legacy = groups.find((g) => g.standId === MENON_10);
  const base = legacy && firstUsable(legacy.entries);
  if (base) return base.id;
  return firstUsable(models)?.id ?? '';
}
