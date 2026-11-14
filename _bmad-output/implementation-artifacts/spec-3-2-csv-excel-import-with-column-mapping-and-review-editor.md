---
title: 'CSV/Excel Import with Column Mapping and Review Editor'
type: 'feature'
created: '2026-11-13'
status: 'done'
baseline_commit: '835045fa557c465c3c0b5c14ae44c6e401381ffa'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1b-paste-import-term-and-card-separators.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/history/focus-indigo/working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Import → "Upload file" is a disabled stub. Users with vocabulary in a spreadsheet must copy it into the paste box, and paste import can only fill Term and Definition.

**Approach:** Enable the Upload file sub-tab. The flow is: choose or drop a file, map its columns to the five Card fields, then Preview. Preview opens the existing review editor, with rows labelled by spreadsheet row number. Save uses the existing import commit. The browser reads the file into a grid of text cells. A pure domain function turns the grid plus the mapping into the same `ParsedRow`s that paste import produces, so validation, duplicate rules and results are shared.

## Boundaries & Constraints

**Always:**
- Decisions (2026-11-13, user):
  - Accept `.csv` and `.xlsx` only.
  - For `.xlsx`, import the first sheet only, and show its name on the mapping step.
  - Mapping uses one select per Card field.
  - Keep the full spec, about 2,700 tokens.
- The file is read in the browser into a grid of strings. `POST /api/import/parse` takes `{source:"file", flashcardId, grid, hasHeader, mapping}`.
  - It runs the domain `parseImportTable` + `detectDuplicates` and writes nothing.
  - The paste request body is unchanged.
- CSV is parsed by a pure domain `parseCsv`:
  - Follows RFC 4180 (quoted fields, `""` escapes, line breaks inside quotes).
  - Strips the UTF-8 BOM.
  - Auto-detects comma / semicolon / tab from the first record (outside quotes).
  - A file that decodes with U+FFFD shows "Save the file as CSV UTF-8 and try again."
- Mapping: each Card field (Term, Definition, Example Sentence, Context/Collocation, Part of Speech) has a column select. Its options are the column header names (or "Column A", "Column B"… without a header) plus "Not mapped".
  - The selects are prefilled by a pure `guessMapping` from header names (case-insensitive aliases, e.g. term/word/front → Term, definition/meaning/back → Definition), else columns A → Term, B → Definition.
  - Term and Definition must be mapped ("Map a column to Term.").
  - A column may be mapped to only one field ("Each column can be mapped once.").
  - A preview of the first 3 data rows under the selects updates live.
- The "First row has column names" checkbox is on by default. Row numbers are 1-based spreadsheet rows, with the header counted.
- Rows whose mapped cells are all blank produce no row. At most 200 non-blank data rows ("Upload at most 200 rows per import."). The file must be 2 MB or smaller ("Choose a file of 2 MB or less.").
- A parsed row carries all five fields. The review editor prefills them and expands the optional fields of rows that have any.
- Labels: "Row 14" in review and results. The back link reads "← Back to mapping".
- Cell text is only trimmed. Unicode is preserved. xlsx numbers and dates become their displayed text.
- Paste text and the chosen file both survive switching the Paste / Upload sub-tab.

**Never:**
- The file bytes are never sent to the server, and nothing is stored before Save.
- No changes to the batch commit route, Manual mode, or paste parsing behaviour.
- No duplicate or validation rules outside `packages/domain`.
- No legacy `.xls` / `.ods`. No regex or formula evaluation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy CSV, any order | Header `pos,meaning,word`; 3 rows | Guess maps word→Term, meaning→Definition, pos→PoS; rows labelled Row 2–4 | N/A |
| No header | Box unchecked, 2 columns | Columns A/B → Term/Definition; first row is Row 1 | N/A |
| Quoted CSV | `"a, b","line1⏎line2"` | Term `a, b`, Definition keeps the line break | N/A |
| Semicolon CSV | `term;definition` | Detected; 2 columns | N/A |
| Missing Definition cell | Row 5 blank Definition | Row 5 shows "Definition is required"; others save | Reported under Errors as Row 5 |
| Duplicate | Term exists in Flashcard | "Already in {Flashcard} — will be skipped" | Re-checked at Save |
| Blank rows | Empty row 3 | No row; Row 4 keeps label 4 | N/A |
| Term unmapped | Term = Not mapped | Preview blocked | "Map a column to Term." |
| Over limit | 201 data rows | No preview | "Upload at most 200 rows per import." |
| Wrong type / size | `.pdf` or 3 MB file | Stays on the drop zone | "Choose a .csv or .xlsx file." / size message |
| Empty file | Only a header | No preview | "This file has no rows to import." |

</frozen-after-approval>

## Code Map

- `packages/domain/src/import.ts`
  - Reuse `validateImportCard`, `detectDuplicates`, `MAX_IMPORT_CARDS` and the `ImportPreviewRow` / `previewImport` pattern.
  - Extend `ParsedRow` with optional `example`, `context` and `partOfSpeech`.
  - The paste parser stays untouched.
- `packages/domain/src/cards.ts` -- field limits L12-17. `importCardLineSchema` (L154) already carries `line`; the commit is unchanged.
- `apps/web/app/api/import/parse/route.ts` -- branch on `source === "file"` before the paste schema. Reuse the ownership lookup and `zodFields`.
- `apps/web/app/(shell)/flashcards/[id]/add-cards-panel.tsx`
  - Import state (L76-85), `importDirty` (L129), `handlePreview` (L306), the `labelMode` snapshot and the `ImportReview` / `ImportResults` props.
  - Add `importSource` and file state here.
- `apps/web/app/(shell)/flashcards/[id]/import-paste.tsx` -- `SourceSwitcher` (L289) has Upload disabled. Make it controlled and shared (move it to its own file).
- `apps/web/app/(shell)/flashcards/[id]/import-review.tsx`
  - `RowLabelMode` (L23), `toReviewRows` (L51, copies term/definition only), label render (L308-314) and the back link text (L301).
- `apps/web/app/(shell)/flashcards/[id]/import-results.tsx` -- `rowLabel` (L11).
- `apps/web/app/(shell)/flashcards/[id]/manual-row.tsx` -- `label.wide` / `numeric:false` already fit "Row 14". `Row.more` expands the optional fields.
- `apps/web/app/components/ui.ts`, `../../classes/ui` -- `inputClass`, `labelClass`, button classes. Reuse `selectClass` from import-paste (export it).
- Tests: `tests/domain/import.test.ts`, `tests/api/import.spec.ts` (helpers `newUser`, `createFlashcard`) and `tests/e2e/import.spec.ts` (paste flow pattern; replace any assertion that Upload is disabled).

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/import-table.ts` (new) + `index.ts` export
  - `parseCsv(text) → string[][]`.
  - `guessMapping(headers, columnCount)`.
  - `importFileParseSchema` (Zod: grid ≤ 1000 × 50, cells ≤ 2000 chars, mapping refinements, the 200-row limit).
  - `parseImportTable(grid, {hasHeader, mapping}) → ParsedRow[]` (line = spreadsheet row, card = ordinal, all five fields, `validateImportCard` problems).
  - `previewImportTable`.
- [x] `apps/web/app/api/import/parse/route.ts` -- the file branch: session → schema → owned Flashcard → `previewImportTable`.
- [x] `apps/web/lib/read-spreadsheet.ts` (new, client) -- File → grid. `.csv` → TextDecoder + `parseCsv`. `.xlsx` → dynamic import of `read-excel-file` (first sheet), cells → display strings. Type/size/encoding errors.
- [x] `apps/web/package.json` -- add `read-excel-file`.
- [x] `import-source-switcher.tsx` (new) and `import-upload.tsx` (new) in `flashcards/[id]/`
  - Drop zone: dashed `border-border`, a "Choose file" button and drag-over state. It is keyboard reachable.
  - Then the file name, "Choose another file", the header checkbox, the five selects and the 3-row preview.
  - Inline errors, Preview / Cancel footer, and the "Nothing is saved yet." note.
- [x] `add-cards-panel.tsx`, `import-paste.tsx` -- source state, file preview mutation, label mode "row", and dirty/back confirms naming "the uploaded file".
- [x] `import-review.tsx`, `import-results.tsx` -- `RowLabelMode` adds `"row"` ("Row N", "Duplicate of row N"). `toReviewRows` copies the optional fields and sets `more`. The back link text is a prop.
- [x] Tests:
  - Vitest: every matrix row (`parseCsv`, `guessMapping`, `parseImportTable`), plus an xlsx→grid test on a small fixture.
  - Playwright API: file parse (401, 404, mapping errors, no writes).
  - E2E: upload a CSV with shuffled columns → map → preview shows Row labels and the optional fields → save → results.

**Acceptance Criteria:**
- Given a 30-row CSV, when I map, Preview and Save, then 30 Cards with all mapped fields and two Scheduling Records each appear within 5 s of system time.
- Given all rows are malformed, when I Save, then Created (0) shows and every row is under Errors as "Row N" + reason.
- Paste import tests still pass unchanged.
- The UI conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

## Implementation Notes

- `read-excel-file` is pinned exactly at 9.3.14 (9.3.15 was 2 days old). The reader uses its `universal` build so the same code runs in the browser and in Vitest. Numbers keep the text stored in the file (`parseNumber: s => s`), so a cell formatted as "1,000" reads as "1000". Dates read as `YYYY-MM-DD`, plus ` HH:MM` when there is a time. Booleans read as TRUE / FALSE.
- The reader drops trailing blank rows and empty trailing columns before sending the grid. Blank rows inside the file are kept so row numbers stay true. A grid over 1,000 rows gets its own message, "This file has more than 1000 rows. Remove blank rows or split the file." (review fix #6).
- New messages beyond the frozen list: "Map a column to Definition.", "Choose a column from the file.", "Use a file with at most 50 columns.", "A cell in this file is longer than 2000 characters." and "This file could not be read. Save it as .xlsx and try again."
- When two fields share a column, both selects are flagged right away. "Map a column to Term/Definition." appears when Preview is pressed, and focus moves to that select. Preview with no file shows "Choose a .csv or .xlsx file."
- `guessMapping` runs when a file loads. Changing the header checkbox keeps the current mapping. "Choose another file" opens the picker in place; if the new file is invalid, the current file and mapping stay.
- `previewImport`'s duplicate step became the shared `withDuplicateFlags`, which `previewImportTable` also uses. Paste parsing is unchanged.
- In the drop zone, "Choose file" is a secondary button, and Preview stays the panel's one accent action, as in Paste. The drag-over state uses `row-hover` and a `text-tertiary` dashed border, not the accent.

## Spec Change Log

## Review Triage Log

Pass 1 (2026-11-13). Layers: blind-hunter, edge-case-hunter, verification-gap, design-fidelity.

| # | Layer | Finding | Verdict | Route | Evidence |
|---|-------|---------|---------|-------|----------|
| 1 | blind, edge, vgap | The server checks the mapping against the 50-column cap, not the grid width | low | patch | `superRefine` passes `MAX_IMPORT_GRID_COLUMNS`. A crafted `term: 40` gives "Term is required" rows; the UI blocks it first |
| 2 | blind, edge, vgap | A valid UTF-8 CSV that contains U+FFFD is rejected as wrongly encoded | low | patch | The decoder is non-fatal and the code then runs `includes("�")`; direct correction to `fatal: true` |
| 3 | edge, vgap | "Reading file" stays stuck when reading throws | low | patch | `load()` has no try/finally, and `file.arrayBuffer()` is outside any catch |
| 4 | blind, edge | File, mapping and paste text stay loaded after a successful import | medium | patch | `handleCommit` onSuccess clears none of them. Results → Manual → Import shows the imported file, and closing asks to discard it |
| 5 | blind, edge | A file dropped outside the drop zone, or on the mapping step, opens in the browser | medium | patch | Drop handlers exist only on the drop-zone div, which is gone once a file has loaded |
| 6 | blind, edge | More than 1000 grid rows shows "Upload at most 200 rows" | low | patch | `readSpreadsheet` and the schema reuse `IMPORT_ROW_LIMIT_MESSAGE` for the grid cap; direct correction with its own message |
| 7 | blind | Vietnamese header names ("Từ", "Nghĩa") are never matched | low | patch | `FIELD_ALIASES` is English-only; adding alias strings is a direct change |
| 8 | blind | `IMPORT_FILE_EXTENSIONS` is exported but never used | low | patch | No references; delete it |
| 9 | design | The checkbox uses the accent fill (`accent-accent`) | low | patch | DESIGN.md Colors > Accent: one actionable accent per screen |
| 10 | vgap | Drag and drop is never tested | medium | patch | Filed evidence: every test uses `setInputFiles` |
| 11 | vgap | `hasHeader: false` is not tested through the API or E2E | medium | patch | Filed evidence: `fileBody` always sends true |
| 12 | vgap | The grid caps (rows, columns, cell length) are untested | medium | patch | Filed evidence: no test references the caps |
| 13 | vgap | The unreadable `.xlsx` path is untested | medium | patch | Filed evidence: there is no corrupt-xlsx case |
| 14 | vgap | The combined "pasted text and the uploaded file" close message is untested | low | defer | Filed as defer; copy-level only |
| 15 | blind, edge | `readJson` buffers bodies of any size | medium (pre-existing) | defer | `readJson` predates this story and the paste route has the same exposure; Vercel caps bodies at 4.5 MB |
| 16 | blind, edge | The schema allows a grid of 1000×50×2000 characters | low | reject | The platform body cap (4.5 MB) bounds it, and a total-size refine adds new surface |
| 17 | blind, edge | An unterminated quote merges the rest of the file into one cell | low | reject | Rare; reporting it adds an error path |
| 18 | edge | A stray mid-field quote in the first record throws off delimiter detection | low | reject | Rare in vocabulary headers; fixing it means re-implementing the field-start logic |
| 19 | blind | A long cell in an unmapped column rejects the file | low | reject | Rare; the fix needs mapping-aware transport |
| 20 | blind | The header checkbox is always on at load | false | reject | The frozen decision is "on by default" |
| 21 | blind | Tabs are not the full WAI-ARIA tabs pattern | low | reject | Pre-existing pattern, already rejected in spec-3-1 #9 |
| 22 | blind | The back-link copy is keyed on the label mode | low | reject | No harm; the label mode and the source are 1:1 |
| 23 | blind | `.tsv` / `.xls` get the plain type message | false | reject | The frozen decision is `.csv` + `.xlsx` only |
| 24 | blind | `selectClass` lives in import-paste; the grid is parsed twice on the server; doc comments are not rewrapped | low | reject | Cosmetic; no named harm |
| 25 | blind | `XLSX_UNREADABLE_MESSAGE` wording; a failed chunk import is reported as unreadable | low | reject | Rare; separating the cases adds branches |
| 26 | edge | The upload finishes after the user has switched to Paste | low | reject | Reading takes milliseconds; a cancel token adds complexity |
| 27 | edge | Time-only xlsx cells read as `1899-12-30 HH:MM` | low | reject | Rare in vocabulary files |
| 28 | edge | xlsx number formats (%, 1,000) are not kept as displayed text | low | reject | Deviates from the frozen "displayed text" rule. `read-excel-file` has no formatted output; vocabulary files rarely hold numbers. Reported to the user |
| 29 | design | `py-1.5` on the source switcher is off the spacing scale | low | reject | It matches the existing mode-switcher pill; changing only this one breaks the pairing |

## Design Notes

The browser builds the grid because the mapping step already needs the headers and sample rows before any request. The server still applies every rule, re-parsing nothing but the grid, so the domain stays the single source of truth (AD-import-domain) and the route only adapts input shape. `read-excel-file` was chosen over SheetJS (the npm build is stale and has known CVEs) and over exceljs (heavy in the browser). It is loaded on demand so the panel bundle does not grow.

## Verification

**Commands:**
- `npm test`, `npm run lint`, `npm run typecheck` -- clean
- `BETTER_AUTH_URL=http://localhost:3100 AUTH_RATE_LIMIT=off npx playwright test tests/api/import.spec.ts tests/e2e/import.spec.ts tests/e2e/cards.spec.ts` (with `apps/web/.env.local` sourced; a hand-started `next start -p 3100` needs the same two variables) -- pass (45)
