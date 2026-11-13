---
title: 'Story 4.9: Study Directions Setting & Per-Direction Learned Model'
type: 'feature'
created: '2026-11-13'
status: 'done'
baseline_commit: 'f143304ca56583be7d1dc0f47c7749527d9b61a6'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-13b.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every Card is always studied in both Recall Directions. A half-graded Card's graded direction also waits for the other direction before it reaches Review, because "learned" is tracked per Card (FR-18, AD-14 as amended 2026-11-13b).

**Approach:**
- Add an account-wide `User.studyDirections` setting: `BOTH` (default), `TERM_TO_DEFINITION` or `DEFINITION_TO_TERM`. It is edited on Settings.
- Make "learned" per Scheduling Record (`firstGradedAt` set).
- Filter every queue and count to the studied directions through one set of domain builders.

**Decisions (human, 2026-11-13):**
- Keep the full spec, about 2,900 tokens, with no split.
- The Theme toggle's selected option becomes neutral: an elevated pill with `foreground` text, like Import's sub-tabs. The Study directions selection is then the only accent element on Settings, as DESIGN.md requires.

## Boundaries & Constraints

**Always:**
- **Migration:** additive only. `StudyDirections` enum, plus `User.studyDirections` non-null with default `BOTH`. No Scheduling Record is touched.
- **`packages/domain/src/learned.ts`:**
  - **`studiedDirections(setting)`:** returns `RecallDirection[]`. BOTH returns T→D then D→T.
  - **Record builders:** `learnedRecordWhere(dirs)` and `unlearnedRecordWhere(dirs)` return record `where` objects: `firstGradedAt` not null / null, and `direction in dirs`.
  - **Card builders:** `learnedCardWhere(dirs)` and `unlearnedCardWhere(dirs)` are built from the record builders and are used only for counts.
  - **Rules:** no Prisma import (AD-1). Nothing else may test `firstGradedAt` for queue or count purposes.
- **Review queue:** learned, due records in studied directions. Scope handling and ordering are unchanged.
- **Learn queue and `countLearn`:**
  - **Unlearned part:** unlearned records in studied directions, ordered as today.
  - **Due part:** then learned, due records in studied directions.
  - **Counts:** `newCards` = Cards with at least one unlearned record in studied directions. `due` = the learned, due records in studied directions.
- **`/api/settings`:**
  - `GET` returns `{ studyDirections }`.
  - `PATCH` body `{ studyDirections }` is Zod-validated: an invalid body returns 400 `{ error }`, no session returns 401. It returns the saved value.
- **Client data:** `GET /api/flashcards/[id]` also returns `studyDirections`, so the viewer and the practice run need no extra fetch.
- **Card viewer:** when the setting is `DEFINITION_TO_TERM`, the front is the Definition and the back is the Term plus details. Otherwise the viewer is unchanged.
- **Practice run:** `practiceEntries` emits only studied directions, keeping today's order.
- **Settings control:**
  - **Placement and options:** a "Study directions" section between Theme and Account. Three options: "Both directions", "Term → Definition", "Definition → Term".
  - **Style:** `components.mode-switcher` pill, stacked full-width below 640px.
  - **Keyboard:** a `role="radiogroup"` with arrow-key roving focus.
  - **Saving:** saves on change with an optimistic select.
    - On success, an `aria-live` "Saved" status, and invalidate the `["flashcard"]`, `["learn"]` and `["review"]` query prefixes.
    - On failure, roll back with an inline `formErrorClass` error.
  - **Helper text:** "Which way cards are asked in Learn and Review. Turning a direction off keeps its progress." in `body-sm`, `foreground-secondary`.
- **Running sessions:** a session already running keeps its snapshot.
- **Visual:** UI conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

**Never:**
- No change to the grade route or to card creation. Every Card keeps both records.
- No writes to Scheduling Records of unstudied directions.
- No focus mode (4.5).
- No export/restore (Epic 5).
- No new dependencies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Half-learned, BOTH | Card: T→D graded and due, D→T ungraded | Review shows T→D only; Learn shows D→T (newCards 1) and T→D in its due part | N/A |
| T→D only | New Card A; learned Card B, both directions due | Learn: A T→D, then B T→D; Review: B T→D; counts {1,1} | N/A |
| D→T only, T→D-learned Card | Card with T→D graded, D→T not | Learn offers D→T; Review empty for it; card counts as new | N/A |
| Switch back to BOTH | From T→D only, with D→T graded+due records | Those D→T records reappear in Review; nothing previously in Review disappears | N/A |
| Viewer D→T only | Setting DEFINITION_TO_TERM | Viewer front = definition; practice entries D→T only | N/A |
| Bad PATCH | `{studyDirections:"SIDEWAYS"}` / no session | 400 / 401 | `{ error }` |
| Save fails | PATCH 500 | Choice rolls back, inline error, no "Saved" | Rollback |

</frozen-after-approval>

## Code Map

- `packages/db/schema.prisma:34`: the `User` model. Add `studyDirections StudyDirections @default(BOTH)`. Add the enum beside `RecallDirection` (line 179).
- `packages/db/migrations/`: add `20261114000000_add_study_directions/migration.sql`, an additive `CREATE TYPE` plus `ALTER TABLE "users" ADD COLUMN ... DEFAULT 'BOTH'`. Write it by hand, mirroring `20261113000000_add_first_graded_at`.
- `packages/domain/src/learned.ts`: today it has zero-arg Card builders. Rewrite them per Always, and update the module JSDoc.
- `packages/domain/src/settings.ts` (new): `studyDirectionsSchema` (a Zod enum), `updateSettingsSchema` and `SettingsResponse`. Export it from `index.ts`.
- `packages/domain/src/flashcards.ts:96`: add `studyDirections` to `FlashcardCardsResponse`.
- `apps/web/lib/study-directions.ts` (new): `getStudiedDirections(userId)` reads `User.studyDirections` via Prisma and returns `{ setting, dirs }`.
- `apps/web/lib/learn-queue.ts`: it has local `unlearnedRecordWhere` / `dueLearnedRecordWhere` helpers. Replace them with domain builders plus `{ card: { userId, flashcardId } }`. `countLearn` and `buildLearnQueue` take `dirs`.
- `apps/web/app/api/review/queue/route.ts:71-74`: change the `where` to `{ nextReviewDate: { lte }, ...learnedRecordWhere(dirs), card: { userId, ...flashcardScope } }`. Update the JSDoc.
- `apps/web/app/api/review/learn/route.ts` and `apps/web/app/api/flashcards/[id]/route.ts`: pass `dirs`. The flashcard GET adds `studyDirections`.
- `apps/web/app/api/settings/route.ts` (new): mirror the `requireSession`, `readJson`, `fail`/`ok`/`validationFailure` pattern of `api/flashcards/[id]/route.ts`.
- `apps/web/app/(shell)/settings/page.tsx`: the server component. Insert the section and mirror the Theme section markup.
- `apps/web/app/(shell)/settings/study-directions.tsx` (new): the client control.
  - **Reuse:** ThemeToggle's pill classes from `apps/web/app/components/theme-toggle.tsx`.
  - **Data:** TanStack Query, `["settings"]`.
- `apps/web/app/(shell)/flashcards/[id]/card-viewer.tsx:126-165`:
  - Add a `definitionFirst` prop and swap the faces.
  - The aria-label becomes "Show the term for: {definition}".
  - Pass it from `flashcard-detail-view.tsx:149`.
- `apps/web/app/(shell)/flashcards/[id]/learn/learn-session.tsx:40`: `practiceEntries` takes the studied directions from `cardsQuery.data.studyDirections`.
- **Prompt side in the client:** derive it from `studiedDirections()` (`dirs` equals `["DEFINITION_TO_TERM"]`), not a raw enum compare.
- **Tests:**
  - **Domain:** `tests/domain/learned.test.ts`, whose assertions use the old zero-arg shapes and must be rewritten.
  - **API:** `tests/api/review-queue.spec.ts` and `tests/api/review-learn.spec.ts`. Half-learned expectations change: the graded direction is now in Review and in Learn's due part.
  - **E2E:** `tests/e2e/learn.spec.ts`, `card-viewer.spec.ts`, and `app-shell.spec.ts`, which holds the Settings screenshot.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/schema.prisma` + new migration: enum and column, then run `npm run db:migrate:dev` locally and regenerate the client.
- [x] `packages/domain/src/learned.ts`, `settings.ts`, `flashcards.ts`, `index.ts`: builders, schemas and the response field.
- [x] `tests/domain/learned.test.ts`, `tests/domain/settings.test.ts`: every builder for all three settings; the schema accepts the 3 values and rejects others.
- [x] `apps/web/lib/study-directions.ts`, `learn-queue.ts`, `api/review/queue`, `api/review/learn`, `api/flashcards/[id]`: route through the builders with the user's dirs.
- [x] `apps/web/app/api/settings/route.ts`: GET and PATCH.
- [x] `settings/page.tsx` + `settings/study-directions.tsx`: the control. Also, in `apps/web/app/components/theme-toggle.tsx`, make the selected option neutral (the Decisions entry).
- [x] `card-viewer.tsx`, `flashcard-detail-view.tsx`, `learn-session.tsx`: definition-first and the filtered practice run.
- [x] `tests/api/settings.spec.ts` (new), plus updates to `review-queue.spec.ts` and `review-learn.spec.ts`: every matrix row except the viewer and Save-fails rows; a new account defaults to BOTH.
- [x] `tests/e2e/settings.spec.ts` (new), plus `card-viewer.spec.ts` and `learn.spec.ts`:
  - save, Saved, reload persistence;
  - arrow keys;
  - rollback on a routed 500;
  - viewer and practice run definition-first under D→T only;
  - Settings screenshots in both themes at 1280px and 390px.

**Acceptance Criteria:**
- Given an existing database, when the migration deploys, then every user reads BOTH and the `scheduling_records` row count and contents are unchanged.
- Given a grep for `firstGradedAt` in `apps/web`, when it runs, then it matches only the grade route (`firstGradedAt` set on first grade) and no queue or count code.
- Given the existing unit, API and e2e suites, when they run, then they pass, except for half-learned expectations deliberately updated per the matrix.

## Implementation Notes

- **Query key:** the Review session's query key is `["review-queue", ...]`, not `["review"]`, so a save invalidates `["review-queue"]`, `["learn"]` and `["flashcard"]`.
- **New helper:** `isDefinitionFirst(dirs)` was added to `packages/domain/src/learned.ts`. Both the viewer and the practice run use it, through `studiedDirections()`.
- **Settings screenshots:** they moved from `tests/e2e/app-shell.spec.ts` to the new `tests/e2e/settings.spec.ts`, at 1280px and 390px.
- **Migration:** applied to the local test database only. **Neon still needs `npm run db:migrate:deploy` before merge.**
- **Verification:**
  - Typecheck and lint are clean. Unit tests pass, 194/194.
  - The subagent reported 246/246 API + e2e passing.
  - `npm test` must run in PowerShell, because Git Bash fails in every file, the baseline commit included.

## Spec Change Log

## Review Triage Log

Pass 1. Layers: blind, edge, verification-gap and design-fidelity.

**Patch:**
- **Overlapping saves (edge ×3, blind ×2, including the flaky wrap-around e2e):** medium. TanStack mutations run in parallel by default, so a late `onSuccess` overwrites a newer choice, and `onError` restores a `previous` that was never confirmed. The final DB value depends on the order requests arrive. Fixed by serializing the saves with a mutation `scope` and refetching on error.
- **Stacked options use `py-2.5`, 10px (design):** low, and the fix is a direct correction. It is off the 4px scale; now `py-3`.
- **`schema.prisma` not aligned (blind):** low, and the fix is a direct correction. Fixed with `prisma format`.
- **`countLearn` new count not tested in a one-direction setting (verification-gap, pre-verified):** medium. Added assertions on the detail route's `learn` to the T→D-graded test and the D→T test.

**Defer:**
- **The settings invalidation is never exercised through in-app navigation (verification-gap, pre-verified):** low to medium. The stale window is 15s; logged in deferred-work.

**Rejected:**
- **A failed GET leaves the control disabled with no message (blind):** low and unlikely. The fix adds an error branch.
- **"Saved" never clears (blind):** false. The component remounts when the user navigates back, which resets the status. Showing it until the next change is the intended quiet status.
- **newCards counts Cards while due counts records, so one Card can be in both (blind):** intended. Spec 4.8 decided the units, and FR-17 per direction puts a half-learned Card's graded direction in the due part. Changing it means editing the spec.
- **Extra `users` read per request (blind):** low. It is one indexed primary-key read, with no budget at stake.
- **A deleted user gets a 500 (blind):** false. Sessions cascade on User delete (`schema.prisma:63`), so `requireSession` returns 401 first.
- **`learnedCardWhere` has no caller and no DB test (blind):** the frozen Always and the epic AC require it in the domain for counts and Stats. Its shape is unit-tested.
- **Grading an unstudied direction from a running session (blind):** false. The frozen intent says a running session keeps its snapshot, and the grade route is in Never.
- **Viewer flip state kept when `definitionFirst` changes (edge, blind):** low and unlikely, since it needs a settings change in another tab followed by a focus refetch. The fix adds an effect.
- **`practiceEntries` rebuilt from live data (blind):** false. GradingSession reads `entries` once on mount (4.8b notes).
- **A practice run from a cached flashcard query in another tab (edge):** low and unlikely. It is the same one-snapshot behavior accepted in 4.8b. A same-tab save invalidates `["flashcard"]`.
- **The `isDefinitionFirst(studiedDirections(...))` indirection (blind):** the Code Map requires deriving the prompt side from `studiedDirections()`.
- **The layout test pins the width to 390-32 (blind):** low, and the test passes today.
- **Long accessible name in definition-first mode (blind):** low. It mirrors the existing Review pattern "Reveal the answer to: {prompt}", which already reads definitions.
- **Track `rounded-lg` when stacked (design):** low. DESIGN.md says nothing about the stacked track. `rounded.lg` is a token, and `rounded.full` on a three-row box gives semicircle ends.
- **`min-h-5` off scale (design):** false. 20px reserves one body-sm line (14px × 1.45), so "Saved" causes no layout shift. It is a line height, not spacing.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test`: expected clean, all pass.
- `npm run test:api && npm run test:e2e` with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/training_sanctum_test` and `BETTER_AUTH_URL=http://localhost:3100`: expected all pass.

**Manual checks:**
- Look at the Settings screenshots (both themes, 1280px and 390px): one accent element, and the options stacked at 390px.
- Before merging, remind the human that `npm run db:migrate:deploy` must run against Neon.
