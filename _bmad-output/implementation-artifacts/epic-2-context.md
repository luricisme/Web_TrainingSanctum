# Epic 2 Context: Class, Folder, Flashcard & Card Management

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A user can organize study material in a fixed four-level hierarchy, Class > Folder > Flashcard > Card (a Flashcard is a named set of Cards, like a Quizlet set). They can create, rename and delete Classes, Folders and Flashcards, add Cards inside a Flashcard through Manual mode of "Add cards", edit and delete Cards, and move Flashcards between Folders, with safe, explicit choices for what happens to contents on delete. This epic also owns the shared card-creation path that import (Epic 3) reuses. Stories 2.1-2.6 were built against the old three-level model; 2.7 (the Flashcard level) is a prerequisite and 2.3-2.6 are rework.

## Stories

- Story 2.1: Class CRUD
- Story 2.2: Folder CRUD inside a Class
- Story 2.3: Add Cards - Manual Mode
- Story 2.4: Edit a Card
- Story 2.5: Delete a Card
- Story 2.6: Move & Browse Flashcards
- Story 2.7: Flashcard CRUD inside a Folder (prerequisite; implement first)

## Requirements & Constraints

- Card fields: Term, Definition (both required), Example Sentence, Context/Collocation, Part of Speech (optional). Full Unicode (IPA, diacritics, non-Latin scripts) must be stored and rendered unchanged, with no normalization or stripping.
- Every Card is in exactly one Flashcard, every Flashcard in exactly one Folder, every Folder in exactly one Class. No nesting of Folders or Classes.
- A Flashcard has only a name, unique per Folder case-insensitively; create, rename or move into a clash gives a field-level error and changes nothing.
- Every Class has one built-in "Unsorted" Folder, created in the same transaction as the Class; it cannot be renamed or deleted.
- Deleting a Card removes both of its Scheduling Records immediately, so it leaves any due queue. Editing a Card never touches its Scheduling Records.
- Deleting a Flashcard: confirmation names it and its Card count; its Cards and Scheduling Records are removed.
- Deleting a Folder: move its Flashcards to the same Class's Unsorted (default) or delete them with their Cards.
- Deleting a Class: move its Folders to another Class (default; Unsorted Flashcards merge into the target's Unsorted; clashing Folder or Flashcard names get " (2)"), or delete everything after typing the Class name. If no other Class exists, only the delete option is offered.
- All delete and move cascades are atomic: no partial moves or deletes, no orphans.
- Class and Folder rows show Flashcard and Card counts; the Classes view shows Folder, Flashcard and Card counts.
- Moving a Flashcard can target any Folder in any Class.

## Technical Decisions

- Each new Card gets exactly two Scheduling Records (one per Recall Direction) at defaults: ease_factor 2.5, repetitions 0, next_review_date = start of today in the user's local day. All creation goes through the single domain function `createCardWithSchedulingRecords`; no Route Handler builds a Scheduling Record by hand. Epic 3 import calls the same function.
- Layering: `packages/domain` is pure (no next/react/prisma imports); only `app/api/**` imports it; UI calls Route Handlers over HTTP. Postgres only via the Prisma client in `packages/db`; schema changes only via Prisma migrations. No Server Actions.
- Every Route Handler validates body/query with Zod first. Success: `{ data: T }` (or `{ data: T[], meta? }`). Errors: `{ error: { code, message, fields?, details? } }`; `fields` for single-record errors, `details` (line/reason) for multi-row batch saves; never both.
- All routes require the Better Auth session (401 otherwise); all data is scoped to `userId` (Card also carries `userId`).
- Routes: `app/api/classes/**`, `app/api/folders/**` (GET returns the folder's Flashcards with card counts), `app/api/flashcards/**` (CRUD, `POST /api/flashcards/[id]/move`), `app/api/cards/**` (CRUD; `POST /api/cards/batch` takes `flashcardId`, is the single multi-row create used by Manual mode and import commit).
- Schema (Story 2.7): new `Flashcard` model between Folder and Card; `Card.folderId` becomes `Card.flashcardId`. Existing data is test data and is wiped (no data migration); the reset against the Neon DB in `apps/web/.env.local` requires explicit confirmation before it runs. Unique `(cardId, direction)` on Scheduling Records; partial unique index on `(classId) WHERE isUnsorted`. IDs are cuid. Model names match the domain vocabulary (fallback `StudyClass` with `@@map("class")` only if Prisma rejects `Class`).
- Folder-delete, flashcard-delete and class-delete (both options, including merges and renames) each run in one Prisma `$transaction`, and log a single-line structured summary (operation, record counts including flashcard counts, outcome).
- Tests: Vitest for domain, Playwright request fixture for API, Playwright browser for E2E; update existing suites and add flashcard CRUD and move cases.

## UX & Interaction Patterns

- List rows use section headers with the small accent square bullet, `row-hover` state, and a trailing "..." menu. Flashcard rows: Rename, Move to..., Delete. Card rows: Edit and Delete only (no Move). Unsorted Folder has no rename or delete.
- Breadcrumbs: Folder page "Classes / {Class} / {Folder}"; Flashcard page "Classes / {Class} / {Folder} / {Flashcard}". The Flashcard page hosts the Cards list, Add cards, and Edit/Delete.
- Modals: folder-delete (two buttons, "Move flashcards to Unsorted" primary / "Delete flashcards too" secondary-danger, no checkbox); flashcard-delete (names Flashcard and Card count); move-flashcard (Folder picker across Classes); class-delete ("Move folders to..." with target-Class picker as primary; "Delete class and everything in it" enabled only after typing the Class name).
- "Add cards" panel opens from inside a Flashcard, target Flashcard shown in the header, pill switcher Manual / Import (Import arrives in Epic 3). Manual: numbered Term/Definition rows, optional fields expandable per row, "+ Add row", Tab moves to next field, Enter in the last field of the last row adds a row, one Save creates all valid rows; invalid rows show field-level errors while valid rows are still created.
- Empty Classes view: primary "Create class" button. Empty due-queue "+ Add card" opens Manual mode in the last-used Flashcard with a Flashcard picker.
- Microcopy is direct and imperative, with no cheerleading or emoji. Every interactive element needs a visible `:focus-visible` state.

## Cross-Story Dependencies

- Story 2.7 first: it introduces the Flashcard schema, API and UI that 2.3-2.6 are re-pointed to, and it changes the counts and delete cascade shown in 2.1 and 2.2.
- 2.2 and 2.1 delete cascades depend on the Flashcard level (Folders contain Flashcards, not Cards).
- 2.6 replaces the committed "Move Card between Folders" code with Move Flashcard.
- 2.3's `createCardWithSchedulingRecords` and `POST /api/cards/batch` are reused by Epic 3 import (target is a Flashcard; duplicates are checked within it).
- Epic 4 review scopes (Class, Folder, Flashcard) and Epic 5 export/restore/stats depend on this hierarchy and its data model.
