# Epic 2 Context: Class, Folder, Flashcard & Card Management

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A user can organize study material in a fixed hierarchy, Class > Folder > Flashcard > Card. They can create, rename and delete Classes, Folders and Flashcards (named sets of Cards), add Cards inside a Flashcard through the Manual mode of "Add cards", edit and delete Cards, and move Flashcards between Folders. Deleting a Class, Folder or Flashcard always offers an explicit, atomic choice of what happens to its contents. This is the content backbone that import (Epic 3) and review (Epic 4) build on.

## Stories

- Story 2.1: Class CRUD
- Story 2.2: Folder CRUD inside a Class
- Story 2.3: Add Cards - Manual Mode
- Story 2.4: Edit a Card
- Story 2.5: Delete a Card
- Story 2.6: Move & Browse Flashcards
- Story 2.7: Flashcard CRUD inside a Folder (prerequisite; implement first)

## Requirements & Constraints

- Card fields: Term, Definition (both required), Example Sentence, Context/Collocation, Part of Speech (optional). Full Unicode (IPA, accents, non-Latin scripts) must be stored and rendered unchanged; no normalization or stripping.
- Every Card is in exactly one Flashcard, every Flashcard in exactly one Folder, every Folder in exactly one Class. No sub-folders, no sub-classes. A Flashcard has only a name, unique per Folder case-insensitively (a clash on create or rename is a field-level error).
- Every Class has exactly one built-in "Unsorted" Folder, created with the Class in one transaction. It cannot be renamed or deleted.
- Folder delete: move its Flashcards to the same Class's Unsorted (default) or delete them with their Cards.
- Flashcard delete: the confirmation names the Flashcard and its Card count. Its Cards and Scheduling Records are removed.
- Class delete: "Move folders to..." (default, with a target-Class picker). Unsorted Flashcards merge into the target's Unsorted, and other Folders move with their contents. Name clashes (Flashcards in Unsorted, Folders in the target) get " (2)", " (3)". Or "Delete class and everything in it", enabled only after typing the Class name. If no other Class exists, only the delete option is offered.
- Move Flashcard: to any Folder in any Class. A name clash in the target Folder is resolved by adding " (2)", " (3)" to the moved Flashcard's name. The Flashcard keeps all its Cards.
- Card creation: each created Card gets exactly two Scheduling Records at SM-2 defaults (ease_factor 2.5, repetitions 0, next_review_date = start of today). Editing a Card never alters its Scheduling Records. Deleting a Card removes both records and drops it from any due queue immediately.
- Manual save: valid rows are created, rows with an empty Term or Definition show field-level errors and are not created.
- All destructive operations are atomic, with no partial moves or deletes, and no orphans.
- Browse views show counts: Classes show Folder, Flashcard and Card counts. Folders show Flashcard and Card counts. Flashcard rows show Card counts.

## Technical Decisions

- Layering: UI calls Route Handlers only (`app/api/**/route.ts`, no Server Actions). Domain stays pure, with no next/react/prisma imports. Prisma is reachable only via `packages/db`, and schema changes only through Prisma migrations.
- Every Route Handler validates its body/query with Zod before touching domain/db. Responses are `{ data }` on success and `{ error: { code, message, fields? | details? } }` on failure. Use `fields` for single-record errors and `details` for line-numbered batch errors, never both. Auth is required on every route (401 otherwise), and all data is scoped to `userId`.
- A single shared `createCardWithSchedulingRecords` domain function creates Cards and their two Scheduling Records. No handler builds a Scheduling Record by hand. Epic 3 import reuses it.
- `POST /api/cards/batch` takes `flashcardId` and is the single multi-row create (Manual mode now, import commit later).
- Routes: `classes/` (CRUD + class-delete), `folders/` (CRUD; GET returns Flashcards with card counts), `flashcards/` (CRUD; `flashcards/[id]/move`), `cards/` (CRUD).
- Folder-delete (both options), flashcard-delete, class-delete (both options, including merge and renames) are each one Prisma `$transaction`. Each logs a structured single-line summary (operation, counts including flashcard counts, outcome).
- Schema: `Flashcard` model (name, folderId), `Card.flashcardId` (replaces `Card.folderId`, required), `Card.userId`. A partial unique index on `(classId) WHERE isUnsorted` enforces one Unsorted Folder per Class. `(cardId, direction)` is unique on Scheduling Record. IDs are `cuid()`. If Prisma rejects `Class`, use `StudyClass` with `@@map("class")`, keeping "Class" in UI and API paths.
- Story 2.7 includes the schema change and a reset of existing test data (no data migration). The reset against the Neon database needs explicit user confirmation before it runs. Stories 2.2-2.6 are rework of already-built Folder-based code. The old "Move Card between Folders" code is replaced by Move Flashcard.
- Text fields are Postgres TEXT (UTF-8).

## UX & Interaction Patterns

- Row component: rows under section headers with a small accent square bullet, a hover state, and a trailing "..." menu. Flashcard rows offer Rename, Move to..., Delete. Card rows offer Edit and Delete only (no Move). The Unsorted Folder's menu has no rename or delete.
- Breadcrumbs: Folder page "Classes / {Class} / {Folder}", Flashcard page "Classes / {Class} / {Folder} / {Flashcard}". Edit and Delete Card actions live on the Flashcard page.
- Modals:
  - Folder delete: two explicit buttons, "Move flashcards to Unsorted" (primary) and "Delete flashcards too" (secondary-danger), no checkbox.
  - Flashcard delete: names the Flashcard and its Card count.
  - Move Flashcard: a Folder picker across Classes.
  - Class delete: "Move folders to..." with a target-Class picker is primary. "Delete class and everything in it" is secondary-danger and needs the typed Class name.
- Add cards panel: opened from inside a Flashcard, with the target Flashcard in its header and a Manual/Import pill switcher (Import lands in Epic 3). Manual mode is Quizlet-style: numbered Term/Definition rows, optional fields expandable per row, "+ Add row". Tab moves to the next field, and Enter in the last field of the last row adds a row. One Save creates all valid rows.
- Classes empty state: a primary "Create class" button.
- The empty due-queue "+ Add card" opens Manual mode in the last-used Flashcard with a Flashcard picker. This is wired with Epic 4's empty state, and the picker is deferred to Epic 4.
- Tone is direct and imperative, with no cheerleading. Every interactive element needs a visible focus state, and everything is keyboard reachable.

## Cross-Story Dependencies

- Story 2.7 (Flashcard level + schema change) must be done first. Stories 2.3-2.6 depend on it, and 2.2's delete cascade and counts change with it.
- Story 2.3 introduces `createCardWithSchedulingRecords` and `cards/batch`, which Epic 3 import commits through.
- Story 2.1's class-delete merge and rename rules reuse the same " (2)" clash convention as Story 2.6's move.
- Story 2.3's "+ Add card" from the empty due-queue depends on Epic 4's empty state (Flashcard picker deferred to Epic 4).
- The Epic 4 review queue scopes by class, folder or flashcard, so the hierarchy and IDs here must stay stable.
- Epic 5 export/restore serializes the full Class/Folder/Flashcard/Card structure.
