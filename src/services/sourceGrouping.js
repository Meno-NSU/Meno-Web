// Pure helpers for rendering the sources list. The backend sends a flat list of
// {document_title, source_url} rows — including one row per URL for multi-source
// summary documents — so the same title can appear many times. Group by title so
// each title renders once with its links.

// Group flat sources by document title, preserving first-appearance order of both
// titles and URLs, dropping empty URLs and exact-duplicate URLs within a group.
export function groupSourcesByTitle(sources) {
  if (!Array.isArray(sources)) return [];
  const order = [];
  const byTitle = new Map();
  for (const source of sources) {
    const title = source?.document_title || '';
    const url = (source?.source_url || '').trim();
    if (!url) continue;
    if (!byTitle.has(title)) {
      byTitle.set(title, []);
      order.push(title);
    }
    const urls = byTitle.get(title);
    if (!urls.includes(url)) urls.push(url);
  }
  return order.map((title) => ({ title, urls: byTitle.get(title) }));
}

// Compact, human-readable form of a URL for display: no scheme, no trailing
// slash, truncated with an ellipsis when very long.
export function formatSourceUrl(url, maxLen = 60) {
  if (!url) return '';
  const stripped = String(url)
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  return stripped.length > maxLen ? `${stripped.slice(0, maxLen - 1)}…` : stripped;
}
