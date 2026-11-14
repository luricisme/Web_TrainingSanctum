---
title: 'Paste Import with Review Editor'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: '3ce965609002d4e4c689597455293e10216ebb41'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/history/focus-indigo/working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users can only add Cards one row at a time (Manual mode). They cannot bring in a list they have already written elsewhere, and the Import tab in the Add cards panel is a disabled stub.

**Approach:** Turn on Import → Paste inside the existing Add cards panel. The flow is: paste the text and pick a delimiter → Preview → `POST /api/import/parse` (pure domain parsing plus duplicate detection, writes nothing) → the review editor, which is the Manual row editor with source-line labels, × buttons and inline problems → Save through `POST /api/cards/batch` with `source:"import"`. In that mode the batch saves the valid rows, skips duplicates (re-checked in the transaction) and reports errors. The results view shows three groups.

## Boundaries & Constraints

**Always:**
- The target is the Flashcard the panel was opened from, and the header names it.
- Nothing is persisted before Save.
- Parsing and duplicate rules live only in `packages/domain` as pure functions, `parseImportBlock` and `detectDuplicates`. They must not import next, react, Prisma or HTTP code.
- A line is split on the first occurrence of the delimiter only: the left side is the Term and the rest is the Definition. Both sides are trimmed, and text is otherwise preserved exactly (IPA, accents, non-Latin scripts).
- Blank lines are ignored and produce no row, but source line numbers still count them.
- Duplicate = the Term matches an existing Card's Term in the target Flashcard, compared case-insensitively after trimming. The flag reads "Already in {Flashcard} — will be skipped", and editing the Term clears it on the client.
- Save is always enabled. Valid rows always save. Removed rows are neither sent nor reported.
- Cards are created only through `createCardWithSchedulingRecords`.
- Every handler validates with Zod, requires the session, and scopes the Flashcard to `userId`.
- `{data}` / `{error}` envelopes. Each commit writes one structured log line.
- Delimiter options: Tab (default), ` — ` (em dash), ` - ` (spaced hyphen), `:`, `,` and `;`.
- Decision (2026-11-12): a paste with more than 200 non-blank lines is rejected at Preview with parse 400 VALIDATION_ERROR "Paste at most 200 lines per import." There are no chunked saves.
- Decision (2026-11-12): when a Term repeats within one paste (same key), the later occurrence is flagged "Duplicate of line N — will be skipped" and is skipped and reported under Duplicates at Save. The server also re-checks for repeats among the rows in the same commit.

**Never:**
- No separate Import page or sidebar item.
- No changes to Manual mode's all-or-nothing batch behaviour (`source` omitted or `"manual"`).
- No DB migration or `source` column.
- No file upload or column mapping (that is Story 3.2).
- No toast-only result and no "Import successful!" copy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | `apple\tquả táo` on line 1 (Tab) | Row line 1, term `apple`, definition `quả táo`, no problem | N/A |
| No delimiter | `banana` on line 3 | Row line 3, term `banana`, empty definition, problem "No delimiter found" | Fixable in place |
| Empty side | `\tdef` or `term\t` | Problem "Term is required" / "Definition is required" | Fixable |
| Over-length | Term over 200 chars | Problem uses the `cardInputSchema` message | Fixable |
| Duplicate | `Apple ` when the Flashcard has `apple` | `duplicate: true` | Skipped at Save unless the Term is edited |
| Extra delimiter | `a\tb\tc` | Term `a`, definition `b\tc` | N/A |
| Blank lines | Lines 2 and 5 blank | No rows for them; later rows keep their true line numbers | N/A |
| All malformed, saved unfixed | 4 bad rows | Created 0, Errors 4 with line + reason | No crash |
| Becomes a duplicate at Save | A Card with that Term is added between Preview and Save | Skipped and reported under Duplicates | N/A |
| Repeat within paste | `cat` on line 2 and `Cat` on line 9 | Line 9 is flagged as a duplicate of line 2 | Skipped at Save |
| More than 200 lines | 201 non-blank lines | No rows; error "Paste at most 200 lines per import." | 400 VALIDATION_ERROR |
| Foreign or missing Flashcard | parse or batch | 404 NOT_FOUND envelope | |

</frozen-after-approval>

## Code Map

- `apps/web/app/(shell)/flashcards/[id]/add-cards-panel.tsx`
  - Contains `AddCardsPanel`, `ModeSwitcher` (L353, Import is `disabled`), `ManualRow` (L381, props `row`, `index`, `errors`, `registerInput`, `onChange`, `onKeyDown`), the `Row`/`Field`/`FIELD_LABELS` model (L28-38), `handleSave` (L179) and an inline discard `alertdialog` (L308).
  - Reuse `ManualRow`; do not fork it.
- `apps/web/app/(shell)/flashcards/[id]/flashcard-detail-view.tsx` -- opens the panel (L209). Query key `["flashcard", id]` (L81).
- `apps/web/app/api/cards/batch/route.ts`
  - All-or-nothing validation (L34-48). Transaction (L70): find the Flashcard by userId → timezone → `createCardWithSchedulingRecords` → `createManyAndReturn` + `schedulingRecord.createMany`. Local `logBatch` (L17).
- `packages/domain/src/cards.ts`
  - `createCardsBatchSchema` (L49) has no `source` field.
  - `cardInputSchema` (L35); `validateCardRows` (L75); `createCardWithSchedulingRecords` (L111); `CreateCardsBatchResponse` (L144).
  - Limits L12-17.
- `packages/domain/src/index.ts` -- barrel. It contains a "planned import" comment.
- `apps/web/lib/api-response.ts`
  - `ok`, `fail`, `validationFailure`, `readJson`, `HttpError`.
- `apps/web/lib/session.ts` -- `requireSession`.
- `apps/web/lib/api-client.ts` -- `apiFetch`, `ApiError`.
- `apps/web/app/(shell)/classes/modal.tsx`, `apps/web/app/components/ui.ts` -- `Modal` and the button/input class tokens. There is no Textarea primitive; style one with `inputClass`.
- Tests:
  - `tests/domain/cards.test.ts` (Vitest pattern).
  - `tests/api/cards.spec.ts` (`newUser`, `createFlashcard` helpers).
  - `tests/e2e/cards.spec.ts:81` asserts that Import is disabled. Update it.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/import.ts` (new) + `index.ts` export
  - Add `IMPORT_DELIMITERS`, `parseImportBlock(text, delimiter) → ParsedRow[{line, term, definition, error?}]`, `detectDuplicates(rows, existingTerms) → per-row duplicate flag`, `normalizeTermKey`, and the Zod `importParseSchema`.
  - Reuse `cardInputSchema` for row errors.
- [x] `packages/domain/src/cards.ts`
  - Add an optional `source: "manual"|"import"` to the batch schema. Import cards carry `line: number|null`.
  - Add `ImportCommitResult{created, duplicates:[{line, term}], errors:[{line, reason}]}`.
- [x] `apps/web/app/api/import/parse/route.ts` (new)
  - Session → Zod → Flashcard owned by the user (404 otherwise) → load its Terms → `parseImportBlock` + `detectDuplicates` → `ok({rows})`. No writes.
- [x] `apps/web/app/api/cards/batch/route.ts`
  - When `source:"import"`: validate each row and keep the invalid ones as errors. Inside the transaction, re-run `detectDuplicates` against the current Terms. Create the rest, return `ok(ImportCommitResult)` and log the counts.
  - The Manual path is unchanged.
- [x] `apps/web/app/(shell)/flashcards/[id]/add-cards-panel.tsx` + new `import-paste.tsx`, `import-review.tsx`, `import-results.tsx` in the same folder
  - Enable the Import tab and add a Paste sub-tab (delimiter `<select>`, textarea, Preview).
  - Review editor: `ManualRow` gains optional `label`, `onRemove`, `problem`. Add the summary strip that jumps to the first problem row, "+ Add row" (labelled "new"), Back with a confirm, and the "Save N cards" footer.
  - Results view: three groups, then Done, which invalidates the queries and closes the panel.
  - Switching mode while there are review rows asks for confirmation before discarding.
- [x] `tests/domain/import.test.ts` -- covers every I/O matrix row.
- [x] `tests/api/import.spec.ts` -- parse (401, 404, flags, no writes) and the import commit (partial save, duplicate re-check, all-malformed, two Scheduling Records).
- [x] `tests/e2e/cards.spec.ts` (or new `import.spec.ts`) -- paste → preview → fix a row → save → results → Cards visible. Replace the disabled-Import assertion.

**Acceptance Criteria:**
- Given the Flashcard's Add cards panel, when I choose Import → Paste, then the header names that Flashcard and no route change happens.
- Given a 30-line valid paste, when I Preview and then Save, then 30 Cards with two Scheduling Records each appear in the Flashcard within 5 s of system time.
- Given the results view, then it shows exactly Created (N), Duplicates skipped (N) and Errors (N, line + reason), and Manual-mode batch tests still pass unchanged.
- The UI conforms to the DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

## Implementation Notes

- `ManualRow` moved unchanged (plus the optional `label`, `onRemove`, `problem` props) into `manual-row.tsx` so the review editor can reuse it without a circular import; `add-cards-panel.tsx` re-exports `underlineInput`.
- Row validation for import lives in the domain as `validateImportCard` (empty sides read "Term is required" / "Definition is required", other problems use the `cardInputSchema` message). Parse, review counts and the commit all use it.
- `detectDuplicates` returns `{duplicate, duplicateOf}` per row; a malformed row never counts as the earlier occurrence of a repeat. The parse response adds `duplicateOfLine`.
- The import commit answers 200 with `ImportCommitResult` and takes a `SELECT … FOR UPDATE` lock on the Flashcard row so concurrent imports cannot both pass the duplicate re-check. Manual mode is unchanged (card creation was factored into a shared `createCards` helper inside the route).
- A pasted row left unfixed is reported at Save with the server's reason (e.g. "Definition is required" for a line that showed "No delimiter found" in review).
- Local Playwright runs need `BETTER_AUTH_URL=http://localhost:3100` (`.env.local` points it at :3000, which makes sign-up fail).

## Spec Change Log

## Review Triage Log

Pass 1 (2026-11-12). Layers: blind-hunter, edge-case-hunter, verification-gap, design-fidelity.

| # | Layer | Finding | Verdict | Route | Evidence |
|---|-------|---------|---------|-------|----------|
| 1 | blind, edge | In-paste duplicate notes go stale after the earlier row is removed or edited, and an edited Term that repeats another row is not flagged | medium | patch | `ReviewRow.duplicate` is set once in `toReviewRows` and only cleared by that row's own Term edit; `toSave` excludes it while the server creates it |
| 2 | blind, edge, vgap | `requestClose` closes silently at the results step while Manual rows are dirty, and the prompt names the wrong loss | medium | patch | add-cards-panel.tsx:136 returns early on `importStep === "results"` with no `manualDirty` check; the message at :142 keys on `mode` |
| 3 | vgap | No test for the Cancel/Escape discard prompts in Import mode | medium | patch | Filed evidence: no test matches "Discard the pasted"/"Discard the reviewed" |
| 4 | vgap | No test for concurrent import commits (the FOR UPDATE lock) | medium (unverified) | defer | Timing-dependent; sequential tests only |
| 5 | blind | A row shown as "No delimiter found" is reported at Results as "Definition is required" | low | reject | The server reason is accurate; aligning them means sending client parse state to the commit (new surface) |
| 6 | blind | Results cannot tell failed "new" rows apart | low | reject | Needs rows added in review that are still invalid at Save; rare, and the fix extends the result contract |
| 7 | blind | No way to recover failed rows after Done | low | reject | Feature request outside the intent |
| 8 | blind | Summary-strip aria-label ignores singular/plural | low | patch | aria-label hard-codes "rows"; trivial correction |
| 9 | blind | Tabs lack the full WAI-ARIA tabs pattern | low | reject | The buttons are tabbable and labelled; the full pattern adds complexity, and ModeSwitcher predates this story |
| 10 | blind, edge | A malformed `line` silently becomes null | low | reject | Only the app's own client sends `line`; never seen in normal use |
| 11 | blind, edge | An over-length paste reuses the 200-lines message | low | patch | import.ts `.max(MAX_IMPORT_TEXT_LENGTH, IMPORT_LINE_LIMIT_MESSAGE)`; direct correction |
| 12 | blind | No hint when the delimiter matches nothing | low | reject | Enhancement; each row already says "No delimiter found" |
| 13 | blind | `MAX_IMPORT_LINES` and `MAX_CARDS_PER_BATCH` can drift | low | patch | Two independent constants; one-line derivation |
| 14 | blind, edge | Duplicate key ignores NFC/NFD forms | low | patch | `normalizeTermKey` is trim+lowercase only; one-line fix in the key |
| 15 | blind, edge | The lock does not cover the Manual path | false | reject | Manual mode has no duplicate rule (Never: change Manual behaviour); the comment claims only that it serializes imports, which is accurate |
| 16 | blind | Import returns 200 while Manual returns 201; redundant invalidate on Done | low | patch (invalidate only) | The status split is harmless; the redundant `invalidateCards()` is a direct deletion |
| 17 | blind | No API test for an import commit without a session or with more than 200 cards | false | reject | The same route and schema run before the source branch; cards.spec.ts covers 401 and 201 rows |
| 18 | blind | The 5 s wall-clock assertion may be flaky | low | reject | It is the AC's own budget; it passes locally with margin |
| 19 | edge | "term —" at line end reads as "No delimiter found" | low | reject | The spaced delimiter is genuinely absent; the message is accurate |
| 20 | edge | Enter on the last field ignores a hiddenError expansion | low | reject | Same pattern as pre-existing Manual mode; rare |
| 21 | design | The new source switcher uses off-scale `py-1.5` | low | defer | Copies the pre-existing ModeSwitcher; fix both together |
| 22 | design | × hover darkens in dark mode | low | patch | `hover:bg-card` on a `bg-elevated` row; token swap |
| 23 | design | Discard confirm is not danger-styled | low | patch | `ConfirmBar` uses `buttonSecondary`; `buttonDanger` exists |

## Verification

**Commands:**
- `npm test` -- domain tests pass
- `npm run lint && npm run typecheck` -- clean
- `npm run test:api` and `npm run test:e2e` -- pass

**Manual checks:**
- Screenshots of the Paste, review and results views in light and dark themes.
