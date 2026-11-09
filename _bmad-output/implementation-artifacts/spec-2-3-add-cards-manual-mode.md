---
title: 'Add Cards: Manual Mode'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_commit: 'd79be9046c6afb368231f1b6f6be8e3b815a9448'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Web_TrainingSanctum-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Folders exist but hold no Cards: a user cannot open a Folder or add words to it (FR-3), and nothing yet creates Scheduling Records.

**Approach:** Add a minimal Folder page at `/folders/[id]` (breadcrumb, plain Card list, "Add cards" button), the Add cards panel in Manual mode, `POST /api/cards/batch`, and the shared domain function `createCardWithSchedulingRecords` (AD-9) that Epic 3 reuses.

## Boundaries & Constraints

**Always:**
- Handlers call `requireSession`, validate with Zod (AD-6), return AD-10 envelopes, scope to the session user; a foreign or unknown Folder id returns `404`.
- `createCardWithSchedulingRecords` and `toLocalCalendarDay` (AD-8, keyed on `User.timezone`) live in `packages/domain` (AD-1, no framework imports). It takes the five Card fields and returns the Card fields plus exactly two Scheduling Records (`TERM_TO_DEFINITION`, `DEFINITION_TO_TERM`; `easeFactor 2.5`, `repetitions 0`, `interval 0`, `nextReviewDate` = start of today in the user's timezone). No handler builds a Scheduling Record by hand.
- Card fields: Term and Definition required, trimmed, non-empty; Example, Context, Part of Speech optional (blank stored as `null`). Only trim; never normalize or strip Unicode (IPA, accents, non-Latin).
- The batch runs in one `$transaction` (AD-11) and logs one structured line (operation, row count, outcome). Server is strict: any invalid row returns `400` with `details` `[{line (1-based), reason}]` and creates nothing. Max 200 rows per request.
- Per-row tolerance is client-side: the panel validates with the shared schema, shows inline field errors on bad rows, sends only the valid rows, and keeps the bad rows open.
- Panel: target Folder named in the header ("Add cards to {Folder}"), pill switcher Manual (default) and Import (shown, disabled, not functional). Starts with 3 empty rows; fully empty rows are ignored; "More fields" per row reveals Example, Context/Collocation, Part of Speech; Tab moves field to field; Enter in the last field of the last row adds a row and focuses its Term; "+ Add row"; closing with unsaved text asks before discarding. On success the panel closes and `["folder", id]`, `["class-folders"]`, `["classes"]` are invalidated.
- Panel takes an optional Folder picker (Class, then Folder) used when it is opened without a specific Folder, preselecting the last-used Folder remembered in `localStorage` (guarded by try/catch). The Folder page opens it without the picker.
- Folder rows on the Class page become links to `/folders/[id]`. The Unsorted Folder is reachable the same way.
- UI uses DESIGN.md tokens via `globals.css`, the Design DNA `design_style` and the anti-generic rules; reuse `Modal`, `PageHeader`, `SectionMarker`, shared button and input classes.

**Never:**
- No edit, delete, move, search or sort of Cards (2.4 to 2.6), no Import mode behavior (Epic 3), no Empty due-queue state or its button (Epic 4), no schema change or migration, no Server Actions, no new dependencies, no raw SQL.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Save valid rows | `POST /api/cards/batch {folderId, cards[]}` | `201`, `{created: n}`; each Card has 2 Scheduling Records at defaults; Folder page lists them | N/A |
| Mixed rows in panel | 2 valid, 1 with empty Term | 2 Cards created; the bad row stays with a field error on Term | Inline field error, no modal |
| All rows empty | Save with nothing filled | Nothing sent; inline "Fill in at least one row." | N/A |
| Invalid row sent to API | Empty Term or Definition, over-length field, 0 or over 200 rows | `400` `details` with line numbers; nothing created | Rollback |
| Unicode | `/ˈkɒl.ə.keɪt/`, `café`, `日本語` | Stored and rendered unchanged | N/A |
| Foreign or unknown Folder | Other user's `folderId` | `404` | N/A |
| Unauthenticated | No session | `401` | N/A |
| Empty Folder | Folder with no Cards | Empty state with primary "Add cards" | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/time.ts`, `cards.ts`, `src/index.ts` -- new: `toLocalCalendarDay`, `cardInputSchema`, `createCardsBatchSchema`, `createCardWithSchedulingRecords`, `CardSummary`, `FolderCardsResponse`; barrel export. Patterns: `folders.ts`.
- `packages/db/schema.prisma` -- `Card`, `SchedulingRecord`, `RecallDirection` exist already; do not change.
- `apps/web/app/api/cards/batch/route.ts` -- new POST. `app/api/folders/[id]/route.ts` -- add GET (Folder, its Class, Cards, newest first). Patterns: `app/api/classes/[id]/folders/route.ts`, `lib/api-response.ts` (`HttpError`, `fail`, `ok`, `readJson`, `validationFailure`). Read `User.timezone` from the session user or the DB.
- `apps/web/app/(shell)/folders/[id]/page.tsx` + `folder-detail-view.tsx` -- new; pattern: `classes/[id]/class-detail-view.tsx` (breadcrumb "Classes / {Class} / {Folder}", loading, 404, empty states).
- `apps/web/app/(shell)/folders/[id]/add-cards-panel.tsx` -- new: panel, row editor, picker. `classes/modal.tsx` -- add a `wide` size option.
- `apps/web/app/(shell)/classes/[id]/class-detail-view.tsx` -- `FolderRow` name becomes a link; remove the "not a link yet" note.
- `tests/domain/`, `tests/api/`, `tests/e2e/` -- patterns: `folders.test.ts`, `folders.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/time.ts`, `cards.ts` + barrel -- helper, schemas, shared creation function -- AD-8, AD-9
- [x] `app/api/cards/batch/route.ts`, `app/api/folders/[id]/route.ts` GET -- batch create in a transaction, Folder detail -- every matrix row
- [x] `(shell)/folders/[id]/*`, `classes/modal.tsx`, `class-detail-view.tsx` -- Folder page, panel, picker, row links, focus handling
- [x] `tests/domain/cards.test.ts` -- timezone day boundaries (incl. a non-UTC zone), defaults, Unicode untouched, validation
- [x] `tests/api/cards.spec.ts` -- every matrix row, cross-user `404`, two Scheduling Records per Card, rollback on a bad row
- [x] `tests/e2e/cards.spec.ts` -- open Folder, add rows with keyboard only, mixed rows, Unicode, discard prompt, light and dark screenshots

**Acceptance Criteria:**
- Given a Folder page, when "Add cards" is pressed, then a panel opens in Manual mode naming the Folder, with Manual and Import in a switcher.
- Given filled rows, when Save is pressed, then one Card per filled row exists in that Folder with two Scheduling Records at SM-2 defaults, and the Folder page, Folder counts and Class counts update.
- Given a half-filled row, when saving, then it shows a field-level error and is not created while valid rows are created.
- Given the editor, when using Tab and Enter, then focus and row creation behave as in the Always rules.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| nextReviewDate carries ms of `now` (time.ts) | medium | patch | Reproduced: `05:30:12.345Z` gave `17:00:00.345Z`; floored `now` to seconds, regression test added. |
| Error in collapsed "More fields" is hidden, save silently blocked (add-cards-panel) | medium | patch | Errors are only rendered when `row.more`; rows with a hidden-field error now force-show the fields. |
| `hover:border-accent` on card rows (folder-detail-view) | low | patch | Spends the accent decoratively; DNA hover is row-hover. Changed to `hover:bg-row-hover`. |
| API test orders by `createdAt` only; batch rows tie | low | patch | Added `id` tiebreak to the test's orderBy. |
| Within-batch list order is by id desc, not entry order | low | defer | Needs a position field or schema change, which the spec forbids. |
| Folder picker / last-folder restore has no caller and no test | medium | defer | Only exercised once a global Add cards entry exists. |
| No test for client-side navigation refreshing `class-folders` / `classes` counts | low | defer | Invalidation exists in code; e2e only uses full page loads. |
| Zod optional over-length message lost to `invalid_union` | false | rejected | Probed: issue is `too_big` "Use 1000 characters or fewer." |
| Invalid `User.timezone` throws RangeError (500) | low | rejected | Value comes from the browser's Intl at registration; fix adds guard branches. |
| Server `details` not mapped to rows in panel | low | rejected | Spec makes per-row tolerance client-side; server rejection is the strict fallback. |
| Escape bypasses dirty check | false | rejected | `Modal` routes `onCancel` to `onClose`, which is `requestClose`. |
| createManyAndReturn order vs `built[i]` | low | rejected | Records are identical per Card; no observable harm. |
| FK race on folder delete returns 500 not 404 | low | rejected | Same transaction re-checks the Folder; narrow race, guard adds complexity. |
| Unpaginated folder GET, no idempotency key, batch-count `line` shape, log content, unrouted logging of 400 count errors, discard focus, picker error states, 200-row Enter feedback, rollback test is pre-validation | low | rejected | Cosmetic or out of intent for this story; fix is more than a direct correction. |
| Screenshot tests have no assertions | low | rejected | The spec asks for screenshots as a manual check, not comparisons. |
| Card row structure/labels/strip, `py-1.5`, modal calc widths, Discard not styled as danger | low | rejected | Design interpretation or cosmetic; fix is more than a direct correction. |

## Verification

**Commands:**
- `npm run typecheck` and `npm run lint` -- expected: clean
- `npx vitest run` -- expected: all pass
- `npx playwright test` -- expected: api and e2e pass

**Manual checks:**
- Screenshots of the Folder page (empty, populated) and the panel (with a field error) in dark and light.
