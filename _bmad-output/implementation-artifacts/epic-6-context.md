# Epic 6 Context: Pastel Frame & Navigation

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give users the refreshed "Pastel Frame" look (dark frame with top bar around a light content panel, pastel tint tiles, realm avatar), make every destination reachable on a phone through a floating dock, let each Class carry its own colour, and let users jump anywhere with keyboard quick search. The shell/tiles and realm avatar work is already built; the remaining work is navigation, colour, search and a contrast fix.

## Stories

- Story 6.1: Pastel Frame Shell and Tiles (built)
- Story 6.2: Realm Avatar (built)
- Story 6.3: Mobile Dock
- Story 6.4: Class Colour
- Story 6.5: Quick Search
- Story 6.6: Input Border Contrast

## Requirements & Constraints

- Every Main nav destination, including Settings and Log out, must be reachable at every viewport width (below 640px was previously a dead end).
- Each Class has one of five colours (lavender, sky, mint, butter, rose). A new Class defaults to the next colour in order; the colour is changeable; its Folders and Flashcards show it. Colour is never the only cue: Class name and breadcrumb stay primary.
- Existing Classes get colours by creation order; nothing else changes.
- Quick search opens on Ctrl+K or "/" only when focus is not in a text field and no session or modal is open. It offers Go to (Review, Classes, Cultivation, Settings) and Suggested (continue last-used Flashcard), then searches Class, Folder, Flashcard names and Card terms. Read-only, scoped to the signed-in user. It is last in build order and droppable for MVP.
- Contrast: input borders, selects and Add cards fields must reach at least 3:1 against `bg` and `card` in both themes (currently about 1.3:1 light, 1.6:1 dark). Tile edges, card hairlines and the XP ring track must reach 3:1 or be recorded in DESIGN.md as accepted with a reason. Measured ratios are recorded in DESIGN.md. Text pairs already pass AA; any new token must be checked against `card`, `bg` and tints in both themes.
- The existing e2e suite (138 tests) must keep passing.
- Focus mode (Review, Learn) hides the app bar and the dock from first paint, with and without JavaScript. Light theme is the default.

## Technical Decisions

- Tokens live in `apps/web/app/globals.css` and DESIGN.md. Tailwind v4 maps CSS variables to DESIGN.md tokens. Font is Plus Jakarta Sans via `next/font/google` (latin, vietnamese).
- Class colour is the only schema change: one additive migration adding `Class.color` (enum of five values, default assigned at creation, never null). Per project rule, the migration must be deployed to Neon with the code, or the dev server returns 500 on every page.
- Every Route Handler validates with Zod before touching domain or db (AD-6), so `color` is validated as one of the five values on create and update.
- Backup: `backupExportSchema` (single shared schema for export and restore, AD-10) carries `class.color`; restore validates it, and an older backup without it restores with colours assigned by creation order.
- UI never imports domain or db packages directly; it calls the API via TanStack Query. Success responses use the `{ data: T }` envelope.
- Quick search reuses existing list endpoints or adds one new read-only search route.
- The dock's Search button is hidden until Story 6.5 exists, then opens the palette.

## UX & Interaction Patterns

- Dock: below 640px, a floating pill on the frame colour with Review, Classes, Cultivation, Settings and Search as round icon buttons; current destination raised; clear of the device bottom safe area; page content must not be covered when scrolled to the end; keyboard operable with visible focus ring. The Realm badge is not shown on mobile; at 640px and wider the dock is hidden and the app bar shows.
- Tiles: Class, Folder and Flashcard tiles in a 1, 2 or 3 column grid with a "..." menu; Class tiles add a Colour item. Class create and rename modals show five swatches.
- Palette: centred over a scrim; arrows move the highlight, Enter opens, Esc closes and returns focus to where it was; key hints in footer.
- Grade buttons are four pastel pills (rose, butter, mint, sky).

## Cross-Story Dependencies

- Build order: 6.3, 6.6, then Epic 5 stories 5.6, 5.7, 5.4, then 6.4, then 5.2, 5.3, then 6.5, then 5.5.
- 6.4 must land before Stories 5.2 and 5.3 so the backup schema is written once; those stories carry a Class colour AC.
- 6.5 enables the Search button in the dock from 6.3.
- 6.6 feeds Story 5.5's contrast verification AC.
- 6.1 and 6.2 are done; 6.3 to 6.6 build on the shell and Realm badge (UX-DR6) they delivered.
