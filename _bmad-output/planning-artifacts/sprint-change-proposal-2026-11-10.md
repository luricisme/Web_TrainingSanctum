# Sprint Change Proposal — Introduce the Flashcard level

Date: 2026-11-10 · Mode: Batch · Scope: **Major** (PRD, architecture, epics, UX and code all change) · Status: awaiting approval

## 1. Issue summary

While reviewing story 2.6 (Move & Browse Cards) the product owner showed that the intended hierarchy has **four** levels, not three:

**Class → Folder → Flashcard → Card**

- A **Flashcard** is a named set (a deck, like a Quizlet set). It lives in exactly one Folder.
- A **Card** is one Term/Definition pair. It lives in exactly one Flashcard.

The PRD (glossary, FR-5), architecture (data model, AD naming rule), UX docs and epics all fix the hierarchy at three levels and use "Folder" for what the owner calls a Flashcard. Story 2.6 was therefore built as "move a Card between Folders", which is not what the owner wants. The owner wants "Move" to move a **Flashcard** between Folders.

## 2. Impact analysis

**Data model (breaking).** New `Flashcard` model between `Folder` and `Card`. `Card.folderId` becomes `Card.flashcardId`. Decision from the owner: existing data is test data and is **wiped** (no data migration). The reset runs against the Neon database in `apps/web/.env.local` and needs explicit confirmation before it runs.

**Epics.**
- Epic 2 (all stories) changes. A new prerequisite story introduces the Flashcard level; 2.3–2.6 are re-pointed from Folder to Flashcard.
- Epic 3: import targets a Flashcard; duplicates are checked inside the target Flashcard.
- Epic 4: "Review this folder" keeps working (all Cards under the Folder); add "Review this flashcard".
- Epic 5: export, restore and stats include the Flashcard level.

**Artifacts needing edits:** PRD (glossary, FR-3, FR-5, FR-6/7, FR-9, FR-13/14, non-goals, scope list, user journeys), `ARCHITECTURE-SPINE.md` (naming rule, entity diagram, structure, requirement map), `epics.md`, `EXPERIENCE.md`, `DESIGN.md` (hierarchy rule, list-row, nav), and `history/focus-indigo/mockups/key-screens.html` (Folder detail).

**Built code to change.** Prisma schema and a new migration, `apps/web/app/api/folders/[id]` (GET returns Flashcards, not Cards), new `app/api/flashcards/**`, `app/api/cards/**` (batch takes `flashcardId`), `packages/domain` (`FolderCardsResponse`, card schemas, new flashcard schemas), the Folder detail page (becomes a Flashcard list), a new Flashcard detail page (the current Card list, Add cards panel, Edit/Delete card), the folder-delete cascade, class-delete cascade, class counts, and tests.

**Stories already done in code:** 2.1 (class), 2.2 (folder CRUD) stay, with a changed delete cascade and counts. 2.3–2.5 move their UI and routes down one level. 2.6 is rebuilt as Move Flashcard (the committed Move Card code is replaced).

## 3. Recommended approach: direct adjustment

Rework inside Epic 2 on the current branch `story/2.6-move-browse-cards`. No rollback is needed, since the old commit stays in history. Effort: medium-large (new level in schema, API, UI and tests). Risk: moderate, mostly in cascades and the picker that used to choose a Folder.

## 4. Detailed change proposals

### PRD

- **Glossary.** Folder: "A user-defined grouping of **Flashcards** inside exactly one Class. The hierarchy is fixed at four levels, Class → Folder → Flashcard → Card." Add **Flashcard**: "A named set of Cards inside exactly one Folder (the brief's 'collections/sets')."
- **FR-3 / FR-5.** Cards are created inside a Flashcard. Every Card is in exactly one Flashcard, every Flashcard in exactly one Folder, every Folder in one Class. A user can create, rename, delete Flashcards, and **move a Flashcard to any Folder** (same or different Class).
- **Folder delete.** Move its Flashcards to the same Class's Unsorted Folder (default) or delete them with their Cards. Class delete is unchanged in shape (Unsorted Flashcards merge into the target's Unsorted; clashing Folder names get " (2)"; Flashcard names that clash inside a Folder get " (2)").
- **Flashcard delete.** Confirmation names the Flashcard and its Card count; deleting removes its Cards and their Scheduling Records.
- **FR-6/FR-7 import and duplicates.** Target is a Flashcard; a duplicate is a Term matching a Card in the target Flashcard.
- **FR-9 scoped review.** Class, Folder and Flashcard scopes. **FR-13/14.** Export and restore include Flashcards.
- **Non-goals.** "Hierarchy deeper than Class → Folder → Flashcard → Card."
- Flashcard has only a **name** (owner decision). Name is unique inside its Folder (case-insensitive).

### Architecture

- Naming rule: `Class`, `Folder`, `Flashcard`, `Card`, `SchedulingRecord`, `User`.
- Entity diagram: `FOLDER ||--o{ FLASHCARD`, `FLASHCARD ||--o{ CARD`. `Card` carries `flashcardId` and `userId`.
- New routes: `app/api/flashcards/**` (CRUD, `POST /api/flashcards/[id]/move`). `POST /api/cards/batch` takes `flashcardId`. Folder GET returns its Flashcards with card counts.
- Delete cascades (folder-delete, class-delete) stay single-transaction and log a summary including flashcard counts.

### Epics (`epics.md`)

- New **Story 2.7: Flashcard CRUD inside a Folder** (prerequisite; implement first). Includes the schema change, DB reset, Flashcard list on Folder detail, create / rename / delete Flashcard with confirmation, counts shown on Class and Folder rows.
- **2.2** Folder delete choices become "Move flashcards to Unsorted" / "Delete flashcards too".
- **2.3, 2.4, 2.5** Replace "Folder" with "Flashcard" (Add cards from a Flashcard; edit and delete Cards on the Flashcard page).
- **2.6** Retitled **Move & Browse Flashcards**: move a Flashcard to any Folder; Folder shows its Flashcards as rows with breadcrumb "Classes / {Class} / {Folder}", and a Flashcard shows its Cards with breadcrumb "Classes / {Class} / {Folder} / {Flashcard}"; Classes view shows Folder, Flashcard and Card counts.
- **3.x, 4.x, 5.x** Replace Folder with Flashcard in import target, duplicate rule, due-queue scope, export and restore.

### UX

- `EXPERIENCE.md` / `DESIGN.md`: hierarchy rule becomes four levels; screen list gains **Flashcard detail** (Cards, Add cards, edit/delete/study); **Folder detail** lists Flashcards (rows with "..." menu: Rename, Move to…, Delete); Card row drops "Move to…" (Edit, Delete only); Add cards header shows the target Flashcard.

### Code and tests (after approval)

1. Prisma: add `Flashcard`; `Card.flashcardId`; reset the database (needs confirmation, owner said wipe).
2. Domain: flashcard schemas (name, move), update card responses and batch input.
3. API: `app/api/flashcards/**`, update folders GET and delete cascade, class delete and counts, cards batch.
4. UI: Folder detail lists Flashcards; new Flashcard detail page hosts the existing Cards list, Add cards, Edit, Delete; Move Flashcard modal replaces Move Card.
5. Tests: update API, domain and e2e suites; add flashcard CRUD and move cases.

## 5. Implementation handoff

- Product Manager / Architect: edit PRD, architecture and UX docs (items above). I can make these edits after approval.
- Developer: implement stories 2.7, then re-run 2.3–2.6 as rework, each as its own spec through `bmad-build`.
- Sprint status: add `2-7-flashcard-crud-inside-a-folder`; set 2.3–2.6 back to `in-progress` for rework; Epic 2 stays `in-progress`.
- Success: a user can build Class → Folder → Flashcard → Card, move a Flashcard between Folders, and every cascade stays atomic; typecheck, lint, unit and Playwright suites pass.
