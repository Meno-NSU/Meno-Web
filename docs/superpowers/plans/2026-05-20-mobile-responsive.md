# Mobile-responsive frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Meno-Web frontend usable on phones and small tablets (≤768px) without changing any desktop behaviour, except for one explicitly-approved leaderboard toggle/close affordance that improves UX on both desktops and mobiles.

**Architecture:** All breakage lives at widths ≤768px. The plan is overwhelmingly `@media (max-width: 768px)` CSS additions to existing stylesheets, plus narrowly-scoped JSX changes for the sidebar drawer (overlay + backdrop), arena column carousel (swipe wrapper + dot indicator + wiggle hint), leaderboard close (`X` button + toggle on the trophy icon), and SettingsBar mobile reflow (hamburger button visible only on mobile). The single desktop-visible change is the leaderboard toggle/close — purely additive.

**Tech Stack:** React 18 + Vite, plain JS (no TS), CSS (no preprocessor), Vitest for unit tests, lucide-react for icons, existing `useTranslation` i18n.

**Reference spec:** [`docs/superpowers/specs/2026-05-20-mobile-responsive-design.md`](../specs/2026-05-20-mobile-responsive-design.md)

**Branch:** Work happens on `claude/mobile-responsive` in `/Users/sckwoky/PycharmProjects/Meno-Web` (already created off `origin/main`).

---

## File structure

| Path | Change | Responsibility |
|---|---|---|
| `src/App.css` | Modify | `@media` override of `#root` padding |
| `src/App.jsx` | Modify | Pass `onClose` to `Leaderboard`; default `isSidebarOpen=false` on mobile |
| `src/components/Sidebar.jsx` | Modify | Render backdrop when open on mobile; `onClose` callback |
| `src/components/Sidebar.css` | Modify | `@media` mobile overlay + backdrop styles |
| `src/components/SettingsBar.jsx` | Modify | Add hamburger button (mobile-only via CSS); toggle behaviour on leaderboard click; `active` class on trophy when open |
| `src/components/SettingsBar.css` | Modify | `@media` hamburger visibility + mobile reflow + active trophy style |
| `src/components/ChatArea.jsx` | Modify | Wrap arena columns in `.arena-scroll` with `.arena-dots` + wiggle hint; pass `onClose` into Leaderboard render path is N/A here (Leaderboard is sibling to ChatArea in App.jsx) |
| `src/components/ChatArea.css` | Modify | `@media` arena swipe layout, dots, wiggle keyframe |
| `src/components/ChatInput.css` | Modify | `@media` input padding tweaks |
| `src/components/Leaderboard.jsx` | Modify | Accept `onClose` prop; render `X` close button in panel; add `data-label` attributes to `<td>` cells |
| `src/components/Leaderboard.css` | Modify | `@media` table → card layout override; `X` button styles |
| `src/i18n.js` | Modify | New keys: `openSidebar`, `closeLeaderboard` |
| `src/components/SettingsBar.test.jsx` | Create | Unit test for `handleLeaderboardClick` toggle semantics |

---

## Pre-flight: install testing-library

The repo already has Vitest (see `src/services/arenaMatching.test.js`). For Task 1's component test we also need `@testing-library/react` and `@testing-library/jest-dom`. Confirm presence first.

- [ ] **Step 0: Check testing-library dependency**

```
cd /Users/sckwoky/PycharmProjects/Meno-Web
grep -E "@testing-library|jsdom" package.json
```

If `@testing-library/react` is NOT listed, install it (and `jsdom` if not present):

```
npm install --save-dev @testing-library/react @testing-library/jest-dom jsdom
```

Confirm `vitest.config.js` (or `vite.config.js`) has `test.environment: 'jsdom'`. If not, add it. If neither config file specifies test env, create a minimal `vitest.config.js`:

```javascript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: { environment: 'jsdom', globals: false },
});
```

(This may already be working — the existing tests are pure JS modules, not component tests. If the existing config covers pure modules already, just add `environment: 'jsdom'`.)

Commit if anything changed:

```
git add package.json package-lock.json vitest.config.js
git commit -m "test: add testing-library + jsdom for component tests"
```

---

## Task 1: Leaderboard toggle + close affordance (desktop-visible)

**Files:**
- Modify: `src/components/SettingsBar.jsx`
- Modify: `src/components/SettingsBar.css`
- Modify: `src/components/Leaderboard.jsx`
- Modify: `src/components/Leaderboard.css`
- Modify: `src/App.jsx`
- Modify: `src/i18n.js`
- Create: `src/components/SettingsBar.test.jsx`

This is the one explicitly-approved desktop-visible change. Pure addition: clicking the trophy a second time closes the leaderboard, and there's a new `X` in the panel.

- [ ] **Step 1: Write failing unit test for toggle semantics**

Create `src/components/SettingsBar.test.jsx`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import SettingsBar from './SettingsBar.jsx';

function renderBar({ currentView = 'chat', setCurrentView = vi.fn() } = {}) {
    return render(
        <SettingsBar
            theme="light"
            toggleTheme={() => {}}
            isSidebarOpen={true}
            models={[]}
            selectedModel=""
            onModelChange={() => {}}
            onDropdownOpen={() => {}}
            isArenaMode={false}
            setIsArenaMode={() => {}}
            currentView={currentView}
            setCurrentView={setCurrentView}
            coreModelId=""
            onOpenSidebar={() => {}}
        />,
    );
}

describe('SettingsBar leaderboard toggle', () => {
    it('opens the leaderboard from chat view', () => {
        const setCurrentView = vi.fn();
        renderBar({ currentView: 'chat', setCurrentView });
        const btn = screen.getByTitle(/leaderboard|таблиц/i);
        fireEvent.click(btn);
        expect(setCurrentView).toHaveBeenCalledWith('leaderboard');
    });

    it('closes the leaderboard when already open', () => {
        const setCurrentView = vi.fn();
        renderBar({ currentView: 'leaderboard', setCurrentView });
        const btn = screen.getByTitle(/leaderboard|таблиц/i);
        fireEvent.click(btn);
        expect(setCurrentView).toHaveBeenCalledWith('chat');
    });

    it('marks the trophy button active when leaderboard is open', () => {
        renderBar({ currentView: 'leaderboard' });
        const btn = screen.getByTitle(/leaderboard|таблиц/i);
        expect(btn.className).toMatch(/\bactive\b/);
    });
});
```

- [ ] **Step 2: Run the new test, confirm it fails**

```
npx vitest run src/components/SettingsBar.test.jsx
```
Expected: all 3 tests fail (either `setCurrentView` is called with `'leaderboard'` instead of `'chat'` in the second test, OR rendering fails because `currentView` prop isn't yet accepted).

- [ ] **Step 3: Update `SettingsBar.jsx` to accept `currentView` and toggle**

In `src/components/SettingsBar.jsx`:

1. Change the `SettingsBar` function signature to also destructure `currentView` (passed from `App.jsx` in Step 5 below):

   ```javascript
   export default function SettingsBar({
       theme, toggleTheme, isSidebarOpen,
       models, selectedModel, onModelChange, onDropdownOpen,
       isArenaMode, setIsArenaMode,
       currentView, setCurrentView,
       coreModelId,
       onOpenSidebar,         // also added — used by Task 4; safe to wire now
   }) {
   ```

2. Replace `handleLeaderboardClick`:

   ```javascript
   const handleLeaderboardClick = () => {
       setCurrentView(currentView === 'leaderboard' ? 'chat' : 'leaderboard');
   };
   ```

3. Update the trophy button JSX to apply an `active` class when leaderboard is open:

   ```jsx
   <button
       className={`btn-icon leaderboard-toggle ${currentView === 'leaderboard' ? 'active' : ''}`}
       onClick={handleLeaderboardClick}
       title={t('arenaLeaderboardTitle')}
   >
       <Trophy size={20} />
   </button>
   ```

- [ ] **Step 4: Add `active` styling for the trophy button**

In `src/components/SettingsBar.css`, append (anywhere in the file is fine; put it near the `.btn-icon` styles for cohesion):

```css
.leaderboard-toggle.active {
    background-color: var(--bg-tertiary);
    color: var(--primary);
}
```

- [ ] **Step 5: Pass `currentView` from `App.jsx` and wire `Leaderboard.onClose`**

In `src/App.jsx`, find the `<SettingsBar ... />` render (around line 780) and add `currentView` to the props passed:

```jsx
<SettingsBar
    theme={theme}
    toggleTheme={toggleTheme}
    isSidebarOpen={isSidebarOpen}
    models={models}
    selectedModel={selectedModel}
    onModelChange={handleModelChange}
    onDropdownOpen={handleModelsDropdownOpen}
    isArenaMode={isArenaMode}
    setIsArenaMode={setIsArenaMode}
    currentView={currentView}
    setCurrentView={setCurrentView}
    coreModelId={coreModelId}
    onOpenSidebar={() => setIsSidebarOpen(true)}
/>
```

(`onOpenSidebar` is for Task 4; wiring it now is harmless.)

In the same file, find `<Leaderboard />` (a few lines below) and pass an `onClose` prop:

```jsx
{currentView === 'chat' ? (
    <ChatArea {/* ... unchanged ... */} />
) : (
    <Leaderboard onClose={() => setCurrentView('chat')} />
)}
```

- [ ] **Step 6: Add `onClose` prop + `X` close button in `Leaderboard.jsx`**

In `src/components/Leaderboard.jsx`:

1. Import the `X` icon at the top:
   ```javascript
   import { Trophy, X } from 'lucide-react';
   ```

2. Update the component signature to accept `onClose`:
   ```javascript
   export default function Leaderboard({ onClose }) {
   ```

3. Add the close button inside the `leaderboard-container`, just inside the opening div, as the first child:

   ```jsx
   return (
       <div className="leaderboard-container">
           {onClose && (
               <button
                   className="leaderboard-close-btn"
                   onClick={onClose}
                   title={t('closeLeaderboard')}
                   aria-label={t('closeLeaderboard')}
               >
                   <X size={20} />
               </button>
           )}
           <div className="leaderboard-header">
               {/* ... unchanged ... */}
           </div>
           {/* ... rest unchanged ... */}
       </div>
   );
   ```

- [ ] **Step 7: Style the close button**

In `src/components/Leaderboard.css`, append:

```css
.leaderboard-close-btn {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 0.5rem;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-2);
    transition: background-color 0.2s, color 0.2s;
}

.leaderboard-close-btn:hover {
    background-color: var(--surface-3);
    color: var(--text-1);
}
```

Also change `.leaderboard-container` to make absolute positioning work — find the existing rule (line 1 of `Leaderboard.css`) and add `position: relative;` to its block:

```css
.leaderboard-container {
    position: relative;       /* <-- add this line */
    padding: 2rem;
    max-width: 1000px;
    margin: 0 auto;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
}
```

- [ ] **Step 8: Add new i18n key `closeLeaderboard`**

In `src/i18n.js`, add to BOTH `ru:` and `en:` locale blocks (near the other arena keys):

```javascript
// ru:
closeLeaderboard: "Закрыть таблицу",
// en:
closeLeaderboard: "Close leaderboard",
```

- [ ] **Step 9: Run all tests, confirm green**

```
npx vitest run
```
Expected: all tests pass, including the 3 new in `SettingsBar.test.jsx`.

- [ ] **Step 10: Commit**

```
git add src/components/SettingsBar.jsx src/components/SettingsBar.css src/components/SettingsBar.test.jsx src/components/Leaderboard.jsx src/components/Leaderboard.css src/App.jsx src/i18n.js
git commit -m "arena: toggle leaderboard from trophy + close X button"
```

---

## Task 2: Global mobile padding

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Append a mobile media query at the end of `src/App.css`**

```css
@media (max-width: 768px) {
    #root {
        padding: 0;
    }
}
```

- [ ] **Step 2: Sanity check tests still pass**

```
npx vitest run
```
Expected: green.

- [ ] **Step 3: Commit**

```
git add src/App.css
git commit -m "mobile: drop #root padding to 0 below 768px"
```

---

## Task 3: Sidebar overlay + backdrop on mobile

**Files:**
- Modify: `src/components/Sidebar.jsx`
- Modify: `src/components/Sidebar.css`
- Modify: `src/App.jsx`

The existing sidebar already has an `isOpen`/`toggleSidebar` prop and a collapsed-state floating button. We'll keep desktop behaviour identical: on mobile, when `isOpen=true` the sidebar becomes a fixed overlay with a backdrop; on mobile, default state is closed.

- [ ] **Step 1: Update `Sidebar.jsx` to render an optional backdrop**

In `src/components/Sidebar.jsx`, change the expanded-state return to wrap the `<aside>` in a fragment that includes a backdrop. The backdrop is always rendered when `isOpen=true`; on desktop CSS hides it via `display: none`, so it's a no-op for desktop.

```jsx
return (
    <>
        <div className="sidebar-backdrop" onClick={toggleSidebar} aria-hidden="true" />
        <aside className="sidebar">
            {/* ... existing inner content unchanged ... */}
        </aside>
    </>
);
```

(The collapsed-state branch — `if (!isOpen) return <button className="sidebar-toggle-btn collapsed">...</button>;` — stays unchanged.)

- [ ] **Step 2: Add mobile overlay + backdrop styles to `Sidebar.css`**

Append at the end of `src/components/Sidebar.css`:

```css
/* Backdrop: hidden by default; visible only when sidebar is open at mobile widths. */
.sidebar-backdrop {
    display: none;
}

@media (max-width: 768px) {
    .sidebar {
        position: fixed;
        top: 0;
        left: 0;
        height: 100vh;
        width: 80vw;
        max-width: 320px;
        z-index: 60;
        box-shadow: 4px 0 12px rgba(0, 0, 0, 0.2);
    }

    .sidebar-backdrop {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 55;
        animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    /* On mobile the in-flow collapsed toggle (top-left absolute button) is
       replaced by the hamburger inside SettingsBar (Task 4). Hide the floating
       collapsed button so we don't have two open affordances. */
    .sidebar-toggle-btn.collapsed {
        display: none;
    }
}
```

- [ ] **Step 3: Default sidebar closed on mobile in `App.jsx`**

In `src/App.jsx`, find the `useState` for `isSidebarOpen` (likely something like `const [isSidebarOpen, setIsSidebarOpen] = useState(true);` — look near the top of the `App` function).

Replace the initial value with a function that checks viewport width once on mount:

```javascript
const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth > 768;
});
```

This way: desktop users see the sidebar open by default (unchanged behaviour); mobile users see it closed by default.

If the existing initial value was something different (e.g. read from localStorage), preserve that logic and just add the viewport guard:

```javascript
const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return false;
    // ... existing fallback ...
    return true;
});
```

- [ ] **Step 4: Run tests, manually inspect that desktop is unchanged**

```
npx vitest run
```
Expected: green.

Desktop sanity check is visual (manual): in the implementation harness this is delegated to the user, but as a self-check, run `git diff origin/main -- 'src/components/Sidebar.css'` and confirm that every changed line is either inside `@media (max-width: 768px)` or is the no-op `.sidebar-backdrop { display: none; }` default.

- [ ] **Step 5: Commit**

```
git add src/components/Sidebar.jsx src/components/Sidebar.css src/App.jsx
git commit -m "mobile: sidebar as fixed overlay with backdrop below 768px"
```

---

## Task 4: Hamburger button in SettingsBar (mobile-only)

**Files:**
- Modify: `src/components/SettingsBar.jsx`
- Modify: `src/components/SettingsBar.css`
- Modify: `src/i18n.js`

- [ ] **Step 1: Add hamburger button to `SettingsBar.jsx`**

Import the `Menu` icon at the top:

```javascript
import { Trophy, Moon, Sun, ChevronDown, AlertCircle, Menu } from 'lucide-react';
```

Inside the `<header className="settings-bar">`, just after the `<div className={\`settings-spacer ...`} />` line and BEFORE the `<div className="settings-controls">` line, insert:

```jsx
<button
    className="btn-icon sidebar-hamburger"
    onClick={onOpenSidebar}
    title={t('openSidebar')}
    aria-label={t('openSidebar')}
>
    <Menu size={20} />
</button>
```

(`onOpenSidebar` was already plumbed in Task 1 Step 5. It calls `setIsSidebarOpen(true)`.)

- [ ] **Step 2: Hide hamburger on desktop, show on mobile**

In `src/components/SettingsBar.css`, append:

```css
.sidebar-hamburger {
    display: none;
}

@media (max-width: 768px) {
    .sidebar-hamburger {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        margin-right: 0.5rem;
    }
}
```

- [ ] **Step 3: Add `openSidebar` i18n key**

In `src/i18n.js`, add to both locales near the existing `closeSidebar` key (it already exists in the file per `Sidebar.jsx`'s usage):

```javascript
// ru:
openSidebar: "Открыть боковую панель",
// en:
openSidebar: "Open sidebar",
```

- [ ] **Step 4: Run tests**

```
npx vitest run
```
Expected: green. The `SettingsBar.test.jsx` from Task 1 should still pass (the new hamburger button is also visible to the tests, but the leaderboard-button query is targeted by title so it's not affected).

- [ ] **Step 5: Commit**

```
git add src/components/SettingsBar.jsx src/components/SettingsBar.css src/i18n.js
git commit -m "mobile: hamburger in SettingsBar opens sidebar drawer"
```

---

## Task 5: SettingsBar mobile reflow

**Files:**
- Modify: `src/components/SettingsBar.css`

Pure CSS additions. Hide the arena toggle text label, ellipsise long model names, and add a wrap fallback so the bar never overflows.

- [ ] **Step 1: Append mobile reflow rules to `SettingsBar.css`**

```css
@media (max-width: 768px) {
    .settings-bar {
        padding: 0.5rem 0.75rem;
    }

    .settings-spacer,
    .settings-spacer.spaced {
        display: none;
    }

    .model-dropdown-trigger {
        min-width: 0;
        max-width: 50vw;
    }

    .model-dropdown-label {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* Hide the "Arena: ВКЛ/ВЫКЛ" text label; keep the ⚔️ icon and active styling. */
    .arena-toggle .arena-text {
        display: none;
    }

    .arena-toggle {
        padding: 0.4rem 0.6rem;
    }

    .settings-actions {
        gap: 0.4rem;
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .settings-controls {
        gap: 0.5rem;
    }
}
```

- [ ] **Step 2: Run tests + commit**

```
npx vitest run
git add src/components/SettingsBar.css
git commit -m "mobile: reflow SettingsBar — hide arena text, ellipsis model name"
```

---

## Task 6: Arena swipe carousel — layout + peek

**Files:**
- Modify: `src/components/ChatArea.jsx`
- Modify: `src/components/ChatArea.css`

Wrap the two arena columns in a `.arena-scroll` div. On desktop the wrapper is a transparent passthrough (CSS makes it `display: contents` so layout is unchanged). On mobile it becomes a horizontally-scrolling snap container.

- [ ] **Step 1: Wrap arena columns in a scroll container in `ChatArea.jsx`**

Find `ArenaMessageBubble` (function near the bottom of `src/components/ChatArea.jsx`). It currently returns something shaped like:

```jsx
return (
    <div className="message-wrapper assistant arena" style={{ ... }}>
        <div className="arena-container" style={{ display: 'flex', gap: '1rem', width: '100%' }}>
            <div className="arena-column a" style={{ ... }}>
                {/* ... */}
            </div>
            <div className="arena-column b" style={{ ... }}>
                {/* ... */}
            </div>
        </div>
        {/* ... tie/both_bad buttons below ... */}
    </div>
);
```

Refactor: wrap the two `.arena-column` siblings in a `.arena-scroll`, and move the `display: flex; gap: 1rem; width: 100%` inline style off `.arena-container` and onto a CSS class so the media query can override it. Concretely:

1. Remove the inline `style={{ display: 'flex', gap: '1rem', width: '100%' }}` from `.arena-container`.
2. Insert `.arena-scroll` between `.arena-container` and the columns.

```jsx
return (
    <div className="message-wrapper assistant arena" style={{ maxWidth: '100%', marginBottom: '2rem' }}>
        <div className="arena-container">
            <div className="arena-scroll">
                <div className="arena-column a" style={{ ... }}>
                    {/* ... unchanged inner content ... */}
                </div>
                <div className="arena-column b" style={{ ... }}>
                    {/* ... unchanged inner content ... */}
                </div>
            </div>
        </div>
        {/* ... tie/both_bad buttons unchanged below ... */}
    </div>
);
```

- [ ] **Step 2: Replace the inline column styles with CSS class additions**

The current `.arena-column.a` and `.arena-column.b` have lengthy inline styles (`flex: 1, backgroundColor: bgA, border: borderA, borderRadius: '12px', padding: '1rem', overflowX: 'auto', display: 'flex', flexDirection: 'column'`). These need to be partially preserved on desktop and overridden on mobile.

For this task, leave the inline styles AS-IS (don't refactor them out). The mobile @media will use higher specificity (or move inline styles to classes only where the media query needs to override them — for `flex` specifically).

The mobile-CSS approach: target `.arena-scroll .arena-column` with `flex: 0 0 90% !important;` to win against the inline `flex: 1`. The `!important` is justified here because we cannot easily remove inline styles without breaking the voted-winner highlight (which uses `bgA`/`bgB`/`borderA`/`borderB` from JS state).

- [ ] **Step 3: Add CSS for desktop default + mobile scroll**

In `src/components/ChatArea.css`, append:

```css
.arena-container {
    display: flex;
    gap: 1rem;
    width: 100%;
}

.arena-scroll {
    display: contents;
}

@media (max-width: 768px) {
    .arena-container {
        display: block;
        width: 100%;
    }

    .arena-scroll {
        display: flex;
        gap: 0.5rem;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        scroll-behavior: smooth;
        scrollbar-width: none;
        padding-inline: 5%;
        margin-inline: -5%;
        width: 100vw;
        max-width: calc(100% + 10vw);
    }

    .arena-scroll::-webkit-scrollbar {
        display: none;
    }

    .arena-scroll .arena-column {
        flex: 0 0 90% !important;
        scroll-snap-align: center;
        min-width: 0;
    }
}
```

Notes:
- On desktop `.arena-scroll { display: contents; }` makes it layout-transparent — the existing `.arena-container { display: flex }` controls the columns directly.
- On mobile `.arena-container` becomes a normal block and `.arena-scroll` becomes the actual flex/scroll container with peek (5% padding-inline + 90% column width).
- `margin-inline: -5%` cancels the parent's gutter so the carousel can edge-to-edge while keeping inner peek. The `width: 100vw; max-width: calc(100% + 10vw)` lets the wrapper bleed past its parent's content box; if this causes horizontal page scroll, drop the bleed and use `padding-inline: 1rem` instead.

- [ ] **Step 4: Run tests + commit**

```
npx vitest run
git add src/components/ChatArea.jsx src/components/ChatArea.css
git commit -m "mobile: arena columns become swipe carousel below 768px"
```

---

## Task 7: Arena dot indicator

**Files:**
- Modify: `src/components/ChatArea.jsx`
- Modify: `src/components/ChatArea.css`

- [ ] **Step 1: Add dot state + scroll listener to `ArenaMessageBubble`**

At the top of `ArenaMessageBubble` (after the existing `const [voting, setVoting] = useState(false);`):

```javascript
const [activeDot, setActiveDot] = useState(0);
const scrollRef = useRef(null);

useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
        const idx = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
        setActiveDot(Math.max(0, Math.min(1, idx)));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
}, []);
```

Also import `useRef` from React at the top of the file if it's not already imported:

```javascript
import { useEffect, useRef, useState } from 'react';
```

- [ ] **Step 2: Attach `ref` to `.arena-scroll` and render the dots**

Update the JSX from Task 6:

```jsx
<div className="arena-container">
    <div className="arena-dots" aria-hidden="true">
        <span className={`arena-dot ${activeDot === 0 ? 'active' : ''}`} />
        <span className={`arena-dot ${activeDot === 1 ? 'active' : ''}`} />
    </div>
    <div className="arena-scroll" ref={scrollRef}>
        {/* ... columns unchanged ... */}
    </div>
</div>
```

- [ ] **Step 3: Style the dots — hidden on desktop, visible on mobile**

In `src/components/ChatArea.css`, append:

```css
.arena-dots {
    display: none;
}

@media (max-width: 768px) {
    .arena-dots {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }

    .arena-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: var(--border);
        transition: background-color 0.2s, transform 0.2s;
    }

    .arena-dot.active {
        background-color: var(--primary);
        transform: scale(1.3);
    }
}
```

- [ ] **Step 4: Run tests + commit**

```
npx vitest run
git add src/components/ChatArea.jsx src/components/ChatArea.css
git commit -m "mobile: arena swipe dots indicator below 768px"
```

---

## Task 8: Arena wiggle hint

**Files:**
- Modify: `src/components/ChatArea.jsx`
- Modify: `src/components/ChatArea.css`
- Modify: `src/i18n.js`

- [ ] **Step 1: Add hint state + timer + dismiss-on-first-scroll**

In `ArenaMessageBubble`, near the dot state from Task 7, add:

```javascript
const [hintVisible, setHintVisible] = useState(true);

useEffect(() => {
    if (!hintVisible) return;
    const t = setTimeout(() => setHintVisible(false), 1500);
    return () => clearTimeout(t);
}, [hintVisible]);
```

Modify the `onScroll` handler from Task 7 to also dismiss the hint:

```javascript
const onScroll = () => {
    const idx = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
    setActiveDot(Math.max(0, Math.min(1, idx)));
    setHintVisible(false);    // <- added
};
```

- [ ] **Step 2: Render the hint next to the dots**

Update the dots JSX (from Task 7) to:

```jsx
<div className="arena-dots" aria-hidden="true">
    <span className={`arena-dot ${activeDot === 0 ? 'active' : ''}`} />
    <span className={`arena-dot ${activeDot === 1 ? 'active' : ''}`} />
    {hintVisible && <span className="arena-swipe-hint">{t('arenaSwipeHint')}</span>}
</div>
```

(`t` is already destructured from `useTranslation` at the top of `ArenaMessageBubble`.)

- [ ] **Step 3: Style the hint + wiggle keyframe**

In `src/components/ChatArea.css`, inside the existing `@media (max-width: 768px)` block from Task 7 (or as a separate `@media` block at the end of the file — order doesn't matter), add:

```css
@media (max-width: 768px) {
    .arena-swipe-hint {
        font-size: 0.7rem;
        color: var(--text-secondary, var(--text-2));
        opacity: 0.85;
        margin-left: 0.5rem;
        animation: arenaSwipeWiggle 1.5s ease-in-out;
    }

    @keyframes arenaSwipeWiggle {
        0%, 100% { transform: translateX(0); opacity: 0.85; }
        25% { transform: translateX(-4px); opacity: 1; }
        75% { transform: translateX(4px); opacity: 1; }
    }
}

.arena-swipe-hint {
    display: none;
}

@media (max-width: 768px) {
    .arena-swipe-hint {
        display: inline-block;
    }
}
```

(Note: the desktop-default `display: none` and mobile override are separate from the styling block above; combining or splitting the two `@media` blocks is fine — CSS order doesn't matter here.)

- [ ] **Step 4: Add `arenaSwipeHint` i18n key**

In `src/i18n.js`, add to both locales:

```javascript
// ru:
arenaSwipeHint: "← свайп →",
// en:
arenaSwipeHint: "← swipe →",
```

- [ ] **Step 5: Run tests + commit**

```
npx vitest run
git add src/components/ChatArea.jsx src/components/ChatArea.css src/i18n.js
git commit -m "mobile: arena swipe wiggle hint (1.5s, dismiss on first scroll)"
```

---

## Task 9: Leaderboard card layout

**Files:**
- Modify: `src/components/Leaderboard.jsx`
- Modify: `src/components/Leaderboard.css`

- [ ] **Step 1: Add `data-label` attributes to `<td>` cells**

In `src/components/Leaderboard.jsx`, find the `tbody` rows. Add `data-label={t('...')}` to each `<td>` so the mobile CSS can prepend labels. Each cell gets the same label as its column header:

```jsx
<tbody>
    {data.map((row, i) => (
        <tr key={i} className={i < 3 ? `rank-${i + 1}` : ''}>
            <td className="rank-col" data-label={t('arenaRank')}>#{i + 1}</td>
            <td data-label={t('arenaSetup')}>
                <div className="setup-name">{row.model}</div>
                <div className="setup-kb" style={{fontSize: '0.85em', color: 'var(--text-2)'}}>{row.knowledge_base}</div>
            </td>
            <td className="elo-col" data-label={t('arenaEloRating')} style={{fontWeight: 'bold', color: 'var(--primary)'}}>{row.elo}</td>
            <td data-label={t('arenaWinRate')}>{row.win_rate}%</td>
            <td data-label={t('arenaMatches')}>{row.matches}</td>
        </tr>
    ))}
    {/* ... empty-row case unchanged ... */}
</tbody>
```

(`data-*` attributes have zero effect on desktop rendering, so the invariant holds.)

- [ ] **Step 2: Add mobile card override to `Leaderboard.css`**

Append:

```css
@media (max-width: 768px) {
    .leaderboard-container {
        padding: 1rem 0.75rem;
    }

    .leaderboard-header h1 {
        font-size: 1.5rem;
    }

    .table-wrapper {
        background: transparent;
        border: none;
        border-radius: 0;
        overflow: visible;
    }

    .leaderboard-table,
    .leaderboard-table thead,
    .leaderboard-table tbody,
    .leaderboard-table tr,
    .leaderboard-table th,
    .leaderboard-table td {
        display: block;
        width: 100%;
        box-sizing: border-box;
    }

    .leaderboard-table thead {
        display: none;
    }

    .leaderboard-table tr {
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 0.75rem 1rem;
        margin-bottom: 0.5rem;
    }

    .leaderboard-table td {
        padding: 0.25rem 0;
        border-bottom: none;
        text-align: left;
        font-size: 0.85rem;
    }

    .leaderboard-table td::before {
        content: attr(data-label);
        font-weight: 600;
        color: var(--text-2);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-right: 0.4rem;
    }

    /* Rank gets prominent treatment — full-width header line. */
    .leaderboard-table td.rank-col {
        font-size: 1rem;
        font-weight: bold;
        margin-bottom: 0.25rem;
    }
    .leaderboard-table td.rank-col::before {
        display: none;
    }

    /* Model name (second cell): also more prominent, no inline label. */
    .leaderboard-table td:nth-child(2) {
        margin-bottom: 0.4rem;
    }
    .leaderboard-table td:nth-child(2)::before {
        display: none;
    }

    .setup-name {
        font-size: 0.95rem;
    }

    /* Hover state on touch is meaningless and looks broken — disable. */
    .leaderboard-table tbody tr:hover {
        background: var(--surface-2);
    }
}
```

- [ ] **Step 3: Run tests + commit**

```
npx vitest run
git add src/components/Leaderboard.jsx src/components/Leaderboard.css
git commit -m "mobile: leaderboard table renders as vertical cards below 768px"
```

---

## Task 10: Chat input mobile padding

**Files:**
- Modify: `src/components/ChatInput.css`

- [ ] **Step 1: Append mobile padding tweaks**

Look at the existing `.input-container` rule and similar wrappers in `src/components/ChatInput.css`. Append:

```css
@media (max-width: 768px) {
    .input-container {
        padding: 0.5rem;
    }

    /* If the KB selector lives inside the input container with class
       .kb-selector (or similar), constrain its width. Match the class to
       whatever the file uses — likely .input-kb-selector or .kb-pill. */
    .input-container .kb-pill,
    .input-container .input-kb-selector {
        max-width: 140px;
    }

    .input-container .kb-pill > *,
    .input-container .input-kb-selector > * {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
}
```

If the file uses different class names for the KB selector, adapt accordingly — open `src/components/ChatInput.jsx` and `src/components/ChatInput.css` and find the actual class. The principle is "constrain max-width + ellipsis"; the exact selector targets whatever is there.

- [ ] **Step 2: Run tests + commit**

```
npx vitest run
git add src/components/ChatInput.css
git commit -m "mobile: tighter chat input padding below 768px"
```

---

## Task 11: Desktop-regression sanity check

This is a verification task, not a code change. No commit.

- [ ] **Step 1: Run the full test suite**

```
cd /Users/sckwoky/PycharmProjects/Meno-Web
npx vitest run
```
Expected: all tests pass (including the new `SettingsBar.test.jsx`). Existing `arenaMatching.test.js` and any other tests must remain green.

- [ ] **Step 2: Run lint**

```
npm run lint
```
Expected: 0 new errors. The pre-existing `react-hooks/exhaustive-deps` warnings (App.jsx:359, 371) may still be present — those are not introduced by this work.

- [ ] **Step 3: Static desktop-invariant check**

```
git diff origin/main -- 'src/**/*.css' | grep -E '^[+-]' | grep -v '^[+-]@media' | grep -v '^[+-][+-][+-]'
```

Read every `+` line that is NOT inside a `@media (max-width: 768px)` block. Each such line MUST belong to one of these allowed categories:
- A new `display: none;` default rule for an element that only appears on mobile (`.sidebar-backdrop`, `.sidebar-hamburger`, `.arena-dots`, `.arena-swipe-hint`).
- The leaderboard close-button styles (Task 1 step 7) — explicitly desktop-visible per spec §5.
- The leaderboard `position: relative` addition (Task 1 step 7) — needed for the absolutely-positioned X button on desktop too.
- The `.arena-container { display: flex; gap: 1rem; width: 100%; }` lifted from inline styles in Task 6 (it's a pure relocation, not a behavioral change).
- The `.leaderboard-toggle.active { ... }` rule (Task 1 step 4) — desktop-visible per spec §5.

If anything else is in the diff, treat it as a regression and revert or scope it under a media query.

- [ ] **Step 4: Manual smoke checklist (delegated to user)**

The user will run these checks; the agent records them here so the user has a clear list:

1. **Desktop ≥1024px**: open app, verify visually identical to `origin/main`, EXCEPT:
   - Clicking the trophy icon a second time now closes the leaderboard.
   - When the leaderboard is open, the trophy icon has a subtle highlight.
   - When the leaderboard is open, an `X` button sits in the panel's top-right.
2. **Phone width (Chrome DevTools, iPhone SE 375×667)**:
   - Sidebar is hidden by default.
   - SettingsBar has a hamburger button on the left.
   - Clicking hamburger slides sidebar in from the left with a backdrop. Click backdrop or hamburger again to close.
   - Arena rounds (turn on arena mode, ask a question) show ONE column at a time with ~10% peek of the other on the right.
   - Two dots above the columns; active dot is highlighted.
   - On first appearance of a fresh arena round, `← swipe →` text wiggles for 1.5s next to the dots.
   - Swipe right reveals column B; dots update; hint disappears.
   - Leaderboard opens as a vertical list of cards, scrollable. No horizontal overflow.
   - `X` button closes the leaderboard back to chat view.
   - Chat input padding feels tight, doesn't overflow.

---

## Final verification

- [ ] All tasks committed; `git log --oneline origin/main..HEAD` shows ~10-11 commits (one per task).
- [ ] `npx vitest run` — green.
- [ ] `npm run lint` — no new errors.
- [ ] Static desktop-invariant check from Task 11 step 3 — clean.
- [ ] User has completed the manual smoke checklist.

---

## Spec coverage check (self-review)

| Spec section | Covered by |
|---|---|
| Hard invariant — desktop unchanged | Task 11 step 3 (static check) + Task 11 step 4 (visual check) |
| Breakpoint ≤768px | All tasks |
| §1 Sidebar drawer | Tasks 3, 4 |
| §2 Arena swipe (peek + dots + wiggle) | Tasks 6, 7, 8 |
| §3 Leaderboard cards | Task 9 |
| §4 SettingsBar reflow | Tasks 4, 5 |
| §5 Leaderboard toggle + close X | Task 1 |
| §6 Chat input tweaks | Task 10 |
| §7 #root padding | Task 2 |
| §11 Testing | Task 1 (unit test for toggle), Task 11 (regression + manual) |
| §12 Files touched | Matches plan's File structure table |
| §13 Risks: inline styles in ChatArea.jsx | Task 6 step 2 (uses `!important` to win against inline `flex: 1`) |
