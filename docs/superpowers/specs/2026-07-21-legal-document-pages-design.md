# Design: routed legal document pages + sidebar links

Date: 2026-07-21
Status: Approved design
Initiative: Meno privacy / 152-ФЗ — Stage 2b (frontend), slice 2 (document pages)

## Goal

Make the three legal documents reachable at their own URLs — `/privacy`, `/consent`,
`/terms` — rendered as standalone pages, and add compact links to them at the bottom
of the sidebar. The document body (fetch + markdown) is shared with the consent
gate's in-place reader built in slice 1, not duplicated.

## Current behavior

- The app is a single `<App/>` mounted bare in `main.jsx` — **no router**; in-app view
  switching uses a `currentView` string ('chat' | 'leaderboard').
- Direct navigation / refresh to arbitrary paths already works: `server.js` has an SPA
  fallback (`app.get('{*path}')` → `dist/index.html`) and vite dev does history
  fallback by default. So client routes need **no** backend/nginx change.
- Slice 1 shipped `components/LegalDocument.jsx` — a dismissible modal reader that
  fetches `getLegalDocument(kind)` and renders the markdown. `LEGAL_DOC_TITLE_KEYS`
  (in `services/consentGate.js`) maps each kind to its i18n title key.

## Decisions (from brainstorming)

- **Routing:** `react-router-dom` (new dependency) — declarative routes, `<Link>`,
  History API (SPA navigation, no reload).
- **Link placement:** bottom of the sidebar.

## Design (frontend only, Meno-Web)

1. **Dependency:** add `react-router-dom`.

2. **`components/AppRoutes.jsx`** — a thin route table (kept separate from `main.jsx`
   so it is testable via `MemoryRouter`):
   - `/privacy` → `<LegalPage kind="privacy_policy" />`
   - `/consent` → `<LegalPage kind="personal_data_consent" />`
   - `/terms` → `<LegalPage kind="terms_of_use" />`
   - `*` → `<App />` (everything else, unchanged)
   `main.jsx` becomes `<BrowserRouter><AppRoutes/></BrowserRouter>`.

3. **`components/LegalDocumentView.jsx` (+ `.css`)** — extract the "fetch by kind →
   loading / error / version + markdown" core out of `LegalDocument.jsx`. Emits the
   same classes (`.legal-doc-loading`, `.legal-doc-error`, `.legal-doc-meta`,
   `.legal-doc-markdown`) so styling and the modal keep working. Both the modal reader
   and the page embed it, so there is exactly one document-rendering implementation.
   - `LegalDocument.jsx` keeps only the overlay/card/header/close chrome and renders
     `<LegalDocumentView kind={kind} />` in its body.
   - The markdown/loading/error/meta CSS moves to `LegalDocumentView.css`;
     `LegalDocument.css` keeps overlay/card/header/close.

4. **`components/LegalPage.jsx` (+ `.css`)** — standalone full page for a document:
   a top bar (Menon logo linking to `/`, a "back to chat" link, theme toggle), the
   localized document title (`t(LEGAL_DOC_TITLE_KEYS[kind])`), and
   `<LegalDocumentView kind={kind} />` in a readable centered column. Applies the
   persisted theme from `localStorage` (`App`'s theme effect does not run on these
   routes). Public — no guest/model bootstrapping.

5. **`components/LegalLinks.jsx`** — a compact row of three `<Link>`s
   (Конфиденциальность · Условия · Согласие) to the three routes. Rendered at the
   bottom of `Sidebar.jsx`.

6. **i18n (ru/en, parity guard):** short link labels (`legalLinkPrivacy`,
   `legalLinkTerms`, `legalLinkConsent`) and a back-to-chat label (`legalBackToApp`).
   Page headings reuse the existing `consentReadConsent/Privacy/Terms` keys.

## Test plan (vitest, TDD)

- `LegalDocumentView.test.jsx`: fetches by kind; renders loading, then markdown
  content + version; error state on fetch failure (mock `../services/api.js`).
- `LegalDocument.test.jsx`: slim to overlay behavior — role=dialog, close button / Esc
  / backdrop call `onClose`, and it renders the view for the given kind (mock
  `LegalDocumentView`). The fetch/markdown assertions move to the view's test.
- `LegalLinks.test.jsx`: renders three links with the correct `to` targets
  (`/privacy`, `/terms`, `/consent`) — wrapped in `MemoryRouter`.
- `LegalPage.test.jsx`: renders the localized title for the kind, a home/back link,
  and the document view (mock the view or the api); maps kind → title.
- `AppRoutes.test.jsx`: with `App` and `LegalPage` mocked, `MemoryRouter` at
  `/privacy` `/consent` `/terms` renders `LegalPage` with the right kind, and any
  other path renders `App`.
- Real SPA navigation (click a sidebar link → page; back button; direct URL) verified
  in-browser.

## Out of scope / follow-ups (later Stage 2b slices)

- Registration consent checkbox in `AuthModal`.
- «Данные и конфиденциальность» settings section.
- Backend `consent_required` gate on `/v1/chat/completions`.
