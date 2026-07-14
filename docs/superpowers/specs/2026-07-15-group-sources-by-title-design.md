# Design: group the sources list by document title

Date: 2026-07-15
Status: Approved design

## Problem

The sources list under an answer shows the **same document title repeated** with
different links, which reads as confusing duplicates. Two causes:

1. A single multi-source `summary` document carries a **list of URLs** (e.g.
   "Приёмная кампания в Новосибирском государственном университете" has 24 URLs);
   the backend's `flatten_sources` emits one `{document_title, source_url}` row per
   URL, all sharing the title.
2. The corpus has many distinct documents with **identical titles** (2,508 titles
   shared by 7,014 documents), so retrieving several of them repeats a title too.

## Fix (frontend only)

Group the flat `sources` array by `document_title` in `SourcesBlock`; render each
title once with its links. No backend/API/DB/contract change.

- **Pure module `src/services/sourceGrouping.js`:**
  - `SOURCES_LINK_CAP = 5`.
  - `groupSourcesByTitle(sources)` → `[{ title, urls: string[] }]`: group by
    `document_title` preserving first-appearance order; within a group keep URL
    order and drop exact-duplicate URLs; drop empty URLs.
  - `formatSourceUrl(url)` → display string: strip `https?://` and a trailing `/`,
    truncate to ~60 chars with an ellipsis.
- **`SourcesBlock` render (three cases per group):**
  - 1 URL → `↗ {title || formatSourceUrl(url)}` linking to the URL (today's look).
  - empty title, N URLs → each URL as its own `↗ {formatSourceUrl(url)}` link.
  - non-empty title, N URLs → the title once as a label, then its URLs listed
    beneath as `↗ {formatSourceUrl(url)}` links, showing the first `SOURCES_LINK_CAP`
    with a "показать все (N) / свернуть" toggle (own `useState` in a `SourceGroup`
    sub-component). URLs are already priority-sorted in the data, so "first N" is
    the most relevant.
- **i18n (RU/EN):** `sourcesShowAll` = "Показать все ({n})" / "Show all ({n})",
  `sourcesCollapse` = "Свернуть" / "Collapse".
- **Styles:** indent the grouped sub-links; a plain text-button for the toggle.

## Testing

- vitest `sourceGrouping.test.js`: grouping merges same titles and preserves order;
  dedupes identical URLs; drops empties; single vs multi; empty-title handling;
  `formatSourceUrl` strips protocol/trailing slash and truncates.
- Browser: confirm the summary document renders one title + 5 links + "показать
  все (24)", and that ordinary single-link sources are unchanged, in RU and EN.

## Out of scope

Backend source structuring, title disambiguation (deriving per-URL labels), and
capping URLs in the backend — all avoided; this is a pure rendering change.
