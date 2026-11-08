# Epic 2 Context: Class, Folder & Card Management

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A user can organize study material as Class → Folder → Card: create, rename, and delete Classes and Folders (each Class with its built-in "Unsorted" Folder), add Cards inside a Folder through the Manual mode of "Add cards", and edit, delete, and move Cards. Deleting a Folder or Class always gives the user a safe, explicit choice of what happens to its contents. This epic produces the data the rest of the product (import, review, stats) operates on, and establishes the shared card-creation path that import reuses.

## Stories

- Story 2.1: Class CRUD
- Story 2.2: Folder CRUD inside a Class
- Story 2.3: Add Cards — Manual Mode
- Story 2.4: Edit a Card
- Story 2.5: Delete a Card
- Story 2.6: Move & Browse Cards

## Requirements & Constraints

- Fixed hierarchy Class → Folder → Card. A Folder lives in exactly one Class; a Card lives in exactly one Folder. No sub-folders, no sub-classes.
- Every Class has exactly one built-in "Unsorted" Folder, created in the same transaction as the Class; it cannot be renamed or deleted.
- Card fields: Term, Definition, Example Sentence, Context/Collocation, Part of Speech. Term and Definition required; the rest optional. Full Unicode (IPA, accents, non-Latin scripts) must be stored and rendered without normalization or stripping.
- Each new Card gets two Scheduling Records (one per Recall Direction) at SM-2 defaults (`ease_factor = 2.5`, `repetitions = 0`, `next_review_date` = start of today in the user's local day).
- Editing a Card never touches its Scheduling Records. Deleting a Card removes both Scheduling Records and drops it from any due queue immediately.
- Moving a Card to any Folder in any Class is allowed; it always ends up in exactly one Folder.
- Folder delete: user chooses "Move cards to Unsorted" (default, same Class's Unsorted) or "Delete cards too".
- Class delete: user chooses "Move folders to…" (default, target-Class picker) or "Delete class and everything in it" (enabled only after typing the Class name). On move, Unsorted Cards merge into the target's Unsorted, other Folders move with their Cards, and Folder-name clashes in the target get a " (2)" suffix. When no other Class exists, only the delete option is offered.
- Both delete cascades are atomic: no partial moves, no orphaned or silently deleted Cards.
- Manual save is per-row tolerant: rows with empty Term/Definition show field-level errors and are not created, while valid rows are still created.
- Stats shown in browsing: each Class shows Folder count and Card count; each Folder shows card count.

## Technical Decisions

- All three card-creation paths (manual now, paste and CSV import in Epic 3) call one domain function, `createCardWithSchedulingRecords`, in `packages/domain`. It takes the five Card fields and returns a Card plus exactly two fresh Scheduling Records. No Route Handler constructs a Scheduling Record by hand. Epic 3 commits through a shared `POST /api/cards/batch`, so build that batch endpoint here so Manual mode and later import share it.
- Domain stays framework-free (no `next`, `react`, `@prisma/client`); only `app/api/**` Route Handlers import it. Postgres is touched only through the Prisma client in `packages/db`, with schema changes via Prisma migrations only.
- Routes: `app/api/classes/**` (Class CRUD plus class-delete), `app/api/folders/**` (Folder CRUD, always under a Class), plus card routes. Every Route Handler validates body/query with Zod before calling domain/db code.
- Response envelope `{ data: T }` for success. Error envelope `{ error: { code, message, fields?, details? } }`: use `fields` for single-record field errors (card edit) and `details` for multi-row batch errors (multi-row Manual save); never both, never a bare string.
- Folder-delete cascade and class-delete (both move and delete variants) each run inside one Prisma transaction, and log a structured single-line summary (operation, record counts, outcome).
- Prisma model names match domain vocabulary: `Class` (fall back to `StudyClass` with `@@map("class")` only if Prisma rejects `Class` as reserved, keeping "Class" in UI and API paths), `Folder`, `Card`, `SchedulingRecord`. Keys are `cuid()` strings; timestamps in UTC. All data is scoped to `user_id`; every route requires the session (401 otherwise).
- `next_review_date` default uses the shared `toLocalCalendarDay` helper keyed on `User.timezone`. If that helper is not yet present in the codebase, introduce it in `packages/domain` for this epic (Epic 4 reuses it).
- Text columns are Postgres TEXT/UTF-8.

## UX & Interaction Patterns

- Classes view: Classes listed as rows grouped under section headers with the small accent-colored square section-bullet marker; row hover state; trailing "..." overflow menu for rename/delete. Folder rows follow the same pattern (the Unsorted Folder's menu omits rename/delete).
- Empty Classes state shows a primary "Create class" button.
- Breadcrumb inside a Folder: "Classes / {Class} / {Folder}"; Cards shown as rows.
- "Add cards" panel opened from inside a Folder: header shows the target Folder; pill switcher offers Manual and Import (Import mode itself is Epic 3, so leave its slot for it). Manual mode is a Quizlet-style editor: numbered Term/Definition rows, optional fields (Example Sentence, Context/Collocation, Part of Speech) expandable per row, "+ Add row", Tab moves to the next field, Enter in the last field of the last row adds a row, one Save creates all valid rows.
- Empty due-queue state's "+ Add card" opens Manual mode in the last-used Folder with a Folder picker to change the target (the empty state itself is built in Epic 4; here only the Manual-mode entry with a picker is needed).
- Modals: folder-delete has two explicit buttons ("Move cards to Unsorted" primary, "Delete cards too" secondary-danger, no checkbox); class-delete has "Move folders to…" with a target-Class picker as primary and "Delete class and everything in it" as secondary-danger, enabled only after typing the Class name.
- Voice: direct, imperative, no cheerleading or emoji. Every interactive element needs a visible `:focus-visible` ring and keyboard operability.

## Cross-Story Dependencies

- Depends on Epic 1: authenticated session and `user_id` scoping, the response/error envelope conventions, the app shell (Classes nav item and placeholder page), and design tokens.
- Story 2.1 (Class plus its Unsorted Folder) must precede 2.2 (Folders live in a Class) and 2.3 (Cards need a target Folder).
- Story 2.3 introduces `createCardWithSchedulingRecords` and the batch card endpoint; 2.4, 2.5 and 2.6 build on Cards existing.
- Class-delete (2.1) and Folder-delete (2.2) cascades must remove or move Cards consistently with card delete (2.5), including their Scheduling Records.
- Story 2.6's browsing views (Folder/Class lists, Folder entry point to "Add cards") are the host for 2.3's panel; the Folder page can be stubbed in 2.2 and completed in 2.6.
- Downstream: Epic 3 reuses the Add cards panel shell, `createCardWithSchedulingRecords`, and `POST /api/cards/batch`; Epic 4's Review-this-class/folder scoping and due queue read the Class → Folder → Card data created here; Epic 5 export/restore must cover this hierarchy.
