# Epic 3 Context: Bulk Import

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let a user turn vocabulary captured elsewhere (a pasted list or a CSV/Excel file) into Cards in one pass, without losing control of what gets created. Import is the second mode of a Flashcard's "Add cards" panel, so the target Flashcard is always the one the panel was opened from (hierarchy: Class > Folder > Flashcard > Card). Parsed rows never go straight to the database. They first open in the import review editor, which is the Manual-mode row editor, where malformed rows and duplicates are flagged inline and can be fixed or removed. Only Save persists Cards. Valid rows always save, and every skipped or failed row is reported. Nothing is silently dropped or duplicated.

## Stories

- Story 3.1: Paste Import with Review Editor
- Story 3.2: CSV/Excel Import with Column Mapping and Review Editor

## Requirements & Constraints

- **Target:** always a single Flashcard, fixed to the Flashcard the panel was opened from and named in the panel header ("Add cards to {Flashcard}"). There is no Import page and no sidebar Import item.
- **Paste:** line-delimited term/definition pairs. The user picks the delimiter per import (e.g. tab or `—`). "Preview" goes straight to the review editor, with no column mapping.
- **File (CSV/Excel):** a column-mapping step maps file columns to the five Card fields (Term, Definition, Example Sentence, Context/Collocation, Part of Speech) in any order. Preview then opens the same review editor.
- **Nothing is persisted before Save.** Preview is read-only.
- **Row validation:** Term and Definition are required. Malformed rows show an inline reason (e.g. "No delimiter found") and can be fixed in place.
- **Duplicate rule:** a row's Term matches an existing Card's Term in the target Flashcard (case-insensitive, whitespace-trimmed). Flag it as "Already in {Flashcard} — will be skipped". Editing the Term clears the flag. Duplicates are re-checked at Save, and a row that is still a duplicate is skipped and reported, never created a second time.
- **Removed rows (×)** are neither created nor reported.
- **Results:** exactly three groups: Created (N), Duplicates skipped (N), Errors (N, each with line/row number + reason). Never a toast-only summary. If every row is malformed, the result is Created (0) with all rows under Errors, and nothing crashes.
- **Performance:** under 5 s of system time for Preview (click to editor rendered) plus Save (click to Cards persisted and visible in the Flashcard), not counting editing time. This budget limits batch size.
- **Unicode:** IPA, accents and non-Latin scripts must be preserved with no normalization or stripping.
- Each created Card gets exactly two fresh Scheduling Records (one per Recall Direction).

## Technical Decisions

- **Two-step flow:**
  1. `POST /api/import/parse` takes paste text + delimiter (or file + column mapping) + `flashcardId`. It returns rows with source line numbers, per-row errors and duplicate flags, and writes nothing.
  2. The commit goes through the existing `POST /api/cards/batch` (shared with Manual mode, takes `flashcardId`, `source: "import"`). Inside the commit transaction it re-runs row validation and `detectDuplicates` against the Flashcard's current Cards, then returns the Created / Duplicates skipped / Errors groups.
- **Domain purity:** `parseImportBlock` and `detectDuplicates` are pure functions in `packages/domain` (import module), called identically by the paste and file paths. Route Handlers may only adapt the input shape (e.g. sheet to row array). They must not re-implement parsing or duplicate rules. The domain package must not import next, react, Prisma or HTTP libraries.
- **Card creation:** only through the shared `createCardWithSchedulingRecords` (defaults `ease_factor=2.5`, `repetitions=0`, `next_review_date` = start of today in `User.timezone`). No handler builds a SchedulingRecord by hand.
- **Validation:** every handler validates its input with Zod before calling domain or db code. Auth is the Better Auth session cookie, with 401 plus the error envelope when it is missing. All data is scoped to `userId`, so the target Flashcard must belong to the user.
- **Envelopes:** success is `{ data: T }`. Errors are `{ error: { code, message, fields?, details? } }`, where batch/line errors use `details: [{ line, reason }]` and never `fields` in the same response.
- **Observability:** the import commit logs a structured single-line summary (operation, record counts, outcome) on success and on failure.
- **CSV/Excel library:** not decided yet (papaparse, exceljs or xlsx). Choose it at build time behind the domain import boundary.
- **Tests:** Vitest for parsing and duplicate detection (no DB). Playwright API tests for parse and batch commit. Playwright E2E for the panel flow.

## UX & Interaction Patterns

- Add cards panel: a pill switcher between Manual (the default) and Import. Switching modes keeps the target Flashcard. Import has two sub-tabs: Paste (delimiter picker + text box + "Preview") and Upload file (file → mapping → "Preview").
- Review editor = the Manual row editor prefilled with the parsed rows:
  - Each row is labelled with its source line ("line 14") instead of an index, and has a remove (×) button and an inline problem message.
  - "+ Add row" still works, and the optional fields expand per row.
  - A summary strip above the rows ("30 rows · 2 need fixing · 1 duplicate") jumps to the first problem row on click.
  - "Back" returns to the paste box or mapping step and discards edits after a confirm.
  - The footer button reads "Save N cards", where N is the number of rows that will be created.
- Problems never block saving. Save is always enabled, and unfixed problems are reported afterwards.
- On the results view, "Done" returns to the Flashcard, which now lists the new Cards.
- Microcopy is direct and imperative: no emoji, no cheerleading, no "Import successful!" toast. Every element needs a visible focus ring, and tab order follows reading order.

## Cross-Story Dependencies

- Builds on Epic 2 (done or in rework): Story 2.7's Flashcard model (`Card.flashcardId`), the Add cards panel shell and Manual row editor (Story 2.3), `POST /api/cards/batch`, and `createCardWithSchedulingRecords`. Import reuses these and must not fork them.
- Story 3.1 introduces `POST /api/import/parse`, `parseImportBlock`, `detectDuplicates`, the review editor, the duplicate re-check in the batch commit and the results view. Story 3.2 adds file upload and column mapping on top of the same parse endpoint, editor and commit path.
