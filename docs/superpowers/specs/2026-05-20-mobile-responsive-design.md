# Mobile-responsive frontend — design

## Problem

The current Meno-Web frontend is desktop-only. The viewport meta tag is present, but there are zero `@media` queries anywhere in the CSS. On a phone:

- `#root` keeps `max-width: 1280px` + `padding: 2rem` — wastes screen edge.
- `Sidebar` has a fixed `width: 260px` — eats ~⅔ of a 375px-wide screen.
- The arena's two columns sit side-by-side with `flex: 1` and `gap: 1rem` — each ends up ~150-170px wide, which is unreadable.
- The leaderboard is a fixed-width table that overflows the right edge.
- `SettingsBar` has wide controls (model dropdown, "Arena: ВКЛ" text label) that overflow.
- The leaderboard panel, once opened, cannot be closed except by switching to a chat (currentView state is one-way to `'leaderboard'`).

Result: the app is unusable on a phone.

## Goal

Make the app usable and pleasant on phones and small tablets, **without changing any desktop behaviour** (with one explicit exception below).

## Hard invariant — desktop unchanged

All changes that affect rendering at widths **≥769px** are forbidden, with one explicit exception:

- **Leaderboard toggle/close** (§5 below) — adds a close affordance that is visible and active on desktop too. This is purely additive (a new `X` button + clicking the leaderboard icon a second time closes it). It does not remove or change any existing desktop UI. The user has explicitly approved this single exception.

Everything else lives inside `@media (max-width: 768px)` blocks or in new files that are only referenced from those blocks. A trivial sanity check at PR time: `git diff origin/main -- 'src/**/*.css'` should show that every `+` line in existing CSS files is either inside a `@media (max-width: 768px)` block or is a new block whose body is entirely inside one.

## Breakpoint

A single breakpoint: `@media (max-width: 768px)`. Covers all phones (including landscape) and tablets in portrait orientation.

## 1. Sidebar — hamburger drawer

On ≤768px the sidebar is hidden by default and reachable through a hamburger button in `SettingsBar`.

- **Default state**: `transform: translateX(-100%)`, `position: fixed`, `z-index` above main content, full viewport height.
- **Open state**: `transform: translateX(0)`, with a semi-transparent backdrop (`background: rgba(0,0,0,0.4)`, also fixed, also z-indexed) under it.
- **Transition**: `transition: transform 0.25s ease` on the sidebar; backdrop fades via `opacity` over the same duration.
- **Hamburger button**: lucide `<Menu>` icon, placed at the left edge of `SettingsBar`, visible only on ≤768px (via `display: none` on desktop, `display: flex` inside the mobile media query).
- **Closing**: clicking the backdrop, clicking the hamburger button again (toggle), or clicking any chat in the sidebar all close it.
- **Sidebar interior CSS** (chat list, "new chat" button, etc.) is untouched — the same internal layout works fine at full mobile width.

## 2. Arena columns — swipe carousel

On ≤768px the `.arena-container` becomes a horizontally-scrolled carousel of one-column-at-a-time. Three affordances make swipeability obvious.

- **Layout**: the existing `.arena-container { display: flex; gap: 1rem }` becomes `display: block` on mobile, wrapping a new `.arena-scroll` that holds both columns:
  ```css
  @media (max-width: 768px) {
      .arena-container { display: block; }
      .arena-scroll {
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scroll-behavior: smooth;
          scrollbar-width: none;            /* Firefox */
          padding-inline: 5%;               /* peek */
      }
      .arena-scroll::-webkit-scrollbar { display: none; }  /* Chrome/Safari */
      .arena-column { flex: 0 0 90%; scroll-snap-align: center; }
  }
  ```
  The 90%-width column plus 5% inline padding means ~10% of the other column peeks from the right (or left) edge — the dominant signal that there's content to swipe to.

- **Affordance 1 — peek**: built into the geometry above.

- **Affordance 2 — dot indicator**: a small `<div>` with two dots (`● ○`) sits above `.arena-scroll`, only rendered on ≤768px (`display: none` on desktop). The active dot updates via a `scroll` event listener on `.arena-scroll` that computes `Math.round(scrollLeft / clientWidth)` and stores it in component state.

- **Affordance 3 — wiggle hint**: when a new arena round appears (i.e. `pendingTurn` transitions from nothing to a fresh bubble), a tiny `← swipe →` label is rendered next to the dots and pulses for 1.5 seconds via a CSS keyframe animation. It disappears on the first `scroll` event OR when the timer expires, whichever comes first. State: a per-bubble `hintShown` flag in component state, initially `true`, set to `false` on first scroll. Persisted-per-bubble so a bubble that's been swiped once doesn't pulse again on re-render.

- **Voting buttons**: each column keeps its own primary vote button ("Левый лучше" / "Правый лучше") inside the column. The secondary `tie` / `both_bad` buttons stay below `.arena-scroll` in their existing horizontal row, unchanged.

- **Generation state**: while either side is still streaming, the user can swipe to either column and watch tokens arrive. No new locking needed.

## 3. Leaderboard — vertical card list

On ≤768px the leaderboard is rendered as a vertical list of cards, one card per model:

- Card header: rank (`#1`, `#2`, ...) + model name, prominent typography.
- Card body: small label-value pairs for Эло / матчи / процент побед, in a row.
- Cards scroll in the normal vertical page flow — no inner `overflow` (a horizontal scroll inside a vertical-scrolling page is a known UX trap on touch screens).

Implementation approach: render the SAME JSX on desktop and mobile, but on ≤768px override the table layout via CSS:

```css
@media (max-width: 768px) {
    .leaderboard-table,
    .leaderboard-table thead,
    .leaderboard-table tbody,
    .leaderboard-table tr,
    .leaderboard-table th,
    .leaderboard-table td {
        display: block;
    }
    .leaderboard-table thead { display: none; }
    .leaderboard-table tr {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 0.75rem;
        margin-bottom: 0.5rem;
    }
    .leaderboard-table td::before {
        content: attr(data-label) " ";
        font-weight: 600;
        color: var(--text-secondary);
    }
    /* — rank cell gets prominent treatment, model cell next, metrics row inline — */
}
```

The implementation may need `data-label` attributes added to each `<td>` in JSX — adding attributes is a no-op for desktop rendering (CSS doesn't read them on desktop), so the desktop invariant holds.

If the existing `Leaderboard.jsx` doesn't use a `<table>` at all (e.g. divs styled as a table), the same principle applies: alternative styling under the media query, no structural change on desktop. The final implementation will adapt to whichever is in the current code.

## 4. Settings bar reflow

`SettingsBar` overflows on phones because:
- Selected model name (potentially long) takes wide horizontal space.
- `Arena: ВКЛ` / `Arena: ВЫКЛ` button has a text label.
- Four buttons on the right (lang, leaderboard, arena toggle, theme) take space.

On ≤768px:

- **Left edge**: new hamburger button (§1).
- **Model dropdown trigger**: `max-width: 50vw` plus `text-overflow: ellipsis` + `white-space: nowrap` on the displayed model name.
- **Arena toggle text label** (`Arena: ВКЛ/ВЫКЛ`): hidden via `.arena-text { display: none; }`. The `⚔️` icon and the active state (visible via existing `.active` class CSS) remain.
- **Other icon buttons** (lang, leaderboard, theme): no changes — they're already compact.
- **Wrap fallback**: `.settings-actions { flex-wrap: wrap; }` if the row still overflows on the narrowest phones.

## 5. Leaderboard toggle and close ⚠ desktop-visible change

The single exception to the desktop invariant. Pure addition, no removal.

- **Toggle behaviour**: `handleLeaderboardClick` in `SettingsBar.jsx` becomes:
  ```javascript
  const handleLeaderboardClick = () => {
      setCurrentView(prev => prev === 'leaderboard' ? 'chat' : 'leaderboard');
  };
  ```
- **Active highlighting**: the `<Trophy>` icon button gets a class (`active`) when `currentView === 'leaderboard'`, styled to visually indicate it's the open view (e.g. background fill matching the existing "arena toggle active" treatment). The class itself + matching CSS rule is new but the rule is scoped to `.leaderboard-toggle.active` — invisible everywhere else.
- **Close-X button**: the `Leaderboard` component accepts an `onClose` prop. In the top-right corner of the panel, a small button with the lucide `<X>` icon calls `onClose()`. `App.jsx` passes `onClose={() => setCurrentView('chat')}`.
- Both affordances work identically on desktop and mobile.

## 6. Chat input tweaks

On ≤768px:

- `.input-container` outer padding reduced (target: 0.5rem inline) to free horizontal space.
- KB selector inside the input (if present): `max-width: 140px` + ellipsis on long KB names.
- Textarea and send button: no structural changes.

These are minor and follow the same `@media (max-width: 768px)` discipline.

## 7. Global padding

`#root` in `App.css` currently has `padding: 2rem`. On ≤768px override to `padding: 0.25rem` (or even `padding: 0`) so the chat takes the full screen width.

## 8. Theming and CSS variables

No new CSS variables introduced. Mobile styles reference the existing `--bg`, `--text`, `--border`, `--primary`, etc. — so dark/light theme work without further effort.

## 9. State management impact

- New state for `arena-scroll` active dot (one integer per arena bubble) — local to `ArenaMessageBubble`.
- New state for the wiggle-hint `hintShown` flag — local to `ArenaMessageBubble`.
- No new global state. No changes to existing global state shapes.

## 10. Out of scope

- Landscape-orientation-specific layout (we cover landscape phones with the same `≤768px` rule, but don't optimise for "landscape only").
- Native mobile gestures beyond what `scroll-snap` provides (no pinch-zoom, no long-press menus).
- PWA / install-to-home-screen / offline support.
- Server-side rendering or accessibility audits beyond what already exists.
- Reducing markdown-rendering complexity on mobile (think blocks, code highlighting, etc. — they keep their existing rendering, just inside a narrower column).

## 11. Testing approach

- **Manual matrix**: Chrome DevTools device emulation at iPhone SE (375×667), iPhone 14 Pro (393×852), iPad portrait (768×1024), Galaxy S20 (360×800). Touch event emulation enabled.
- **Desktop regression**: open the app at ≥1024px viewport and visually compare with `origin/main`. The diff should be: only the leaderboard X-button and the toggle highlight on the trophy icon are visible.
- **Static check**: `git diff origin/main -- 'src/**/*.css'` and confirm that all changed lines in existing CSS files are inside `@media (max-width: 768px)` blocks, except for the leaderboard close button (and toggle active class) which is explicitly allowed.
- **Tests**: no unit tests for pure CSS. One small unit test for `handleLeaderboardClick`'s toggle semantics (currentView flips between 'chat' and 'leaderboard') is reasonable; will be specified in the implementation plan.

## 12. Files touched

| Path | Change | Why |
|---|---|---|
| `src/App.css` | Modify | `@media` override for `#root` padding |
| `src/components/Sidebar.css` | Modify | `@media` mobile drawer styles |
| `src/components/Sidebar.jsx` | Modify | Accept `open`/`onClose` props for mobile drawer; backdrop |
| `src/components/SettingsBar.jsx` | Modify | Hamburger button (mobile-only via CSS); toggle behaviour on leaderboard click; `arena-text` span around the text label so CSS can hide it |
| `src/components/SettingsBar.css` | Modify | `@media` mobile reflow + hamburger visibility |
| `src/components/ChatArea.jsx` | Modify | `.arena-scroll` wrapper around columns; dot indicator + wiggle hint render; `onScroll` handler; close button passthrough into `Leaderboard` |
| `src/components/ChatArea.css` | Modify | `@media` arena swipe layout, dot indicator styles, wiggle keyframe |
| `src/components/ChatInput.css` | Modify | `@media` input padding/sizing |
| `src/components/Leaderboard.jsx` | Modify | Accept `onClose` prop; X button in panel; `data-label` attrs on cells if needed for mobile card rendering |
| `src/components/Leaderboard.css` | Modify | `@media` card layout override |
| `src/App.jsx` | Modify | Wire `sidebarOpen` state + close handler; pass `onClose` to `Leaderboard` |
| `src/i18n.js` | Modify | New keys: `closeButtonLabel`, possibly `openSidebar`/`closeSidebar` aria-label |

## 13. Risks

- **CSS specificity collisions**: existing inline styles in `ChatArea.jsx` (the arena column uses inline `style={{ flex: 1, ... }}`) may override media-query rules. Mitigation: where this happens, move those inline styles to classes during this work, or use `!important` sparingly. The implementation plan will identify each conflict.
- **scroll-snap browser support**: solid in modern Safari iOS 14+, Chrome 69+, Firefox 68+. No fallback needed for our target audience.
- **Hamburger discoverability**: a single icon at top-left is the most common pattern; no extra hand-holding tooltip planned.
- **Wiggle hint annoyance**: 1.5s is a deliberate compromise. If it feels too long or too short during manual testing, the constant can be tuned post-merge.
