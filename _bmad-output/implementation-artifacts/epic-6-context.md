# Epic 6 Context: Pastel Frame & Navigation

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give users the refreshed look (dark frame with top bar, inset light panel, pastel tiles, realm avatar), let them reach every destination on a phone through a bottom dock, let them give each Class its own colour, and let them jump anywhere with quick search. Two stories (6.1, 6.2) record work already built; the remaining four finish navigation, colour, search and input contrast.

## Stories

- Story 6.1: Pastel Frame Shell and Tiles (built)
- Story 6.2: Realm Avatar (built)
- Story 6.3: Mobile Dock
- Story 6.4: Class Colour
- Story 6.5: Quick Search
- Story 6.6: Input Border Contrast

## Requirements & Constraints

- Below 640px a floating dock (Review, Classes, Cultivation, Settings, Search) replaces the app bar; at 640px and up the app bar shows and the dock does not. Both are absent in Review and Learn focus mode, including first paint with no JavaScript.
- The dock must be keyboard operable with visible focus rings, clear the device bottom safe area, and never cover page content at scroll end.
- Each Class has one of five colours; new Classes default to the next colour in order; existing Classes are backfilled by creation order. Colour shows on the Class tile and its Folder and Flashcard tiles. It is never the only cue (name and breadcrumb stay primary).
- Quick search (FR-20): opens with Ctrl+K or "/" only when focus is not in a text field and no session or modal is open. Shows Go to (Review, Classes, Cultivation, Settings) and Suggested ("Continue: last-used Flashcard"). Typing matches destinations plus Class, Folder, Flashcard names and Card terms, scoped to the user. Arrow keys, Enter and Esc work; Esc returns focus. It is read-only and returns only the signed-in user's data.
- Input borders and the `border` token must reach at least 3:1 against panel and card backgrounds in both themes, measured and recorded in DESIGN.md. Tile edges, card hairlines and the XP ring track are either brought to 3:1 or recorded as accepted with a reason. Input focus and error states are kept; the existing e2e suite must still pass.
- Default theme is light; a stored dark choice loads with no flash. Reduced motion stops the slow ray turn on the realm avatar at Bộ 3 and up.

## Technical Decisions

- Design tokens live in `apps/web/app/globals.css` and DESIGN.md.
- Class colour is the only schema change: one additive migration, deployed to Neon together with the code (a missing migration makes every page 500). `color` is validated by Zod as one of the five values on create and update (AD-6).
- The backup export includes `color` and restore reads it, validated by the shared `backupExportSchema` (Stories 5.2 and 5.3), so 6.4 must land before those so the backup schema is written once.
- Quick search reuses existing list endpoints or adds one read-only search route.
- Realm avatar has 19 looks (one per realm) rendered inside the XP ring, gaining detail at higher realms and showing the lower look after a demotion.

## UX & Interaction Patterns

- Class, Folder and Flashcard lists are tiles in a 1, 2 or 3 column grid, each with a "..." menu (Colour is an entry on the Class menu).
- Review and Learn grade buttons are the four pastel pills.
- Realm badge sits at the right end of the app bar, showing avatar, realm, stage and XP in words.
- The dock raises the current destination; the Search button appears only once Story 6.5 exists.

## Cross-Story Dependencies

- Build order: 6.3, 6.6, then Epic 5 stories, then 6.4, then 5.2 and 5.3, then 6.5.
- 6.4 must precede Stories 5.2 and 5.3 (backup export and restore carry `color`).
- 6.3's Search button depends on 6.5 and stays hidden until then.
- 6.5 is last in build order and droppable.
- 6.1 and 6.2 depend on Epic 5's Realm badge and ladder (UX-DR6, UX-DR23); Review and Learn focus mode comes from Epic 4.
