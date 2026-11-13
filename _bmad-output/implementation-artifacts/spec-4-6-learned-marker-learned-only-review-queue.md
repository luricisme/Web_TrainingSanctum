---
title: 'Story 4.6: Learned Marker & Learned-Only Review Queue'
type: 'feature'
created: '2026-11-13'
status: 'done'
baseline_commit: 'ecdf9d6484053520f9500ac524b48f504e77509a'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Review currently pulls in every due record, so each new Card enters the daily session at once, before the user has studied it. Sprint Change 2026-11-13 moves first study into Learn (4.8). Review must therefore bring back only Cards already learned.

**Approach:** Add a nullable `SchedulingRecord.firstGradedAt`. A migration backfills it for records already graded. The grade route sets it once. The rule for "learned" lives in one shared AD-14 predicate in `packages/domain`: a Card is learned when both of its records have `firstGradedAt` set. `GET /api/review/queue` returns only due records of learned Cards. Flashcard scope is removed from Review: `?flashcardId=` now returns 400, and the "Review this flashcard" link goes away.

**Decisions (human, 2026-11-13):** spec kept whole at about 2,300 tokens, by user choice.

## Boundaries & Constraints

**Always:**
- **Migration:**
  - Add the column `"firstGradedAt" TIMESTAMP(3)` (nullable, UTC) to `scheduling_records`.
  - Backfill `"firstGradedAt" = "updatedAt"` where `"interval" > 0`. This is safe because `applyGrade` never returns interval 0.
  - No other data changes.
- **Grade route:**
  - `firstGradedAt = now` is written only when it is currently null, inside the existing transaction. A later grade never changes it.
  - It is added to the AD-4 single-write-path field list in the route's doc comment.
- **New Cards:** `createCardWithSchedulingRecords` returns both records with `firstGradedAt: null`. Every creation path (manual, paste, file import) therefore starts the Card unlearned.
- **Predicate:**
  - `learnedCardWhere()` / `unlearnedCardWhere()` are plain Card-`where` objects with no Prisma import:
    - learned is `{ schedulingRecords: { none: { firstGradedAt: null } } }`;
    - unlearned is `{ schedulingRecords: { some: { firstGradedAt: null } } }`.
  - They are exported from `packages/domain` and unit-tested.
  - The queue route composes the learned predicate into `card: { userId, ...learnedCardWhere(), ... }`.
- **Queue:** 4.3's other behavior is unchanged: due rule, ordering, snapshot, class/folder scope, 404 for a foreign scope, 400 for two scopes.
- **`?flashcardId=` returns 400 `VALIDATION_ERROR`:**
  - It returns 400 even when it is the only parameter.
  - The message is "Flashcard review moved to Learn."
  - `/review` still forwards it, so a stale link lands on the existing "This review link isn't valid." state.
- **Copy:** the 404 line becomes "This class or folder does not exist."
- **Visual:** UI conforms to DESIGN.md tokens and the Design DNA design_style, and passes the anti-generic UI rules. It is checked against a screenshot in both dark and light themes.

**Never:**
- No Learn route, Learn page or Learn button (4.8).
- No card viewer (4.7).
- No change to focus mode or the empty state (4.5).
- Never derive "learned" from `interval`, `repetitions` or the existence of any grade.
- No new dependencies.
- No change to SM-2 math.
- The grade route keeps 409 `NOT_DUE`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Unlearned due | New Card, both records due, `firstGradedAt` null | Absent from the default, class and folder queues | N/A |
| Half-learned | One record graded, the other null | The Card is still unlearned; neither record appears | N/A |
| Learned due | Both records set, both due | Both entries appear, ordered as in 4.3 | N/A |
| Again after learned | A learned record graded Again (repetitions 0) | Stays learned; reappears when due | N/A |
| First grade | Record with `firstGradedAt` null, POST grade | `firstGradedAt` equals the grade time | N/A |
| Later grade | Record with `firstGradedAt` T1, due, POST grade | `firstGradedAt` is still T1 | N/A |
| Flashcard scope | `?flashcardId=x` | 400 | envelope |
| Backfill | Pre-migration rows: one with interval 6, one with interval 0 | interval 6 → `firstGradedAt = updatedAt`; interval 0 → null | N/A |

</frozen-after-approval>

## Code Map

- `packages/db/schema.prisma` -- `SchedulingRecord` gets `firstGradedAt DateTime?`. Card relation name: `schedulingRecords`.
- `packages/db/migrations/<ts>_add_first_graded_at/migration.sql` -- new migration, created with `prisma migrate dev --create-only`, plus a hand-written backfill `UPDATE`. `vercel.json` runs `migrate deploy` on build.
- `packages/domain/src/cards.ts` -- `NewSchedulingRecord` and `createCardWithSchedulingRecords` (AD-9). `apps/web/app/api/cards/batch/route.ts` spreads the record into `createMany`, so the new field flows through without a route change.
- `packages/domain/src/review.ts` -- `reviewQueueQuerySchema` and `ReviewScopeKind`/`ReviewScope`. Drop `"flashcard"`. Add the predicate builders here or in a new `learned.ts` re-exported from `index.ts`.
- `apps/web/app/api/review/grade/route.ts` -- select `firstGradedAt` and add it to `update.data` when it is null. Its doc comment lists the write-path fields.
- `apps/web/app/api/review/queue/route.ts` -- `resolveScope` (remove the flashcard branch), the `flashcard` filter and `findMany.where`.
- `apps/web/app/(shell)/review/review-session.tsx` -- `SCOPE_HREF` (remove `flashcard`) and the 404 copy, around line 126. `page.tsx` `SCOPE_KEYS` stays as is.
- `apps/web/app/(shell)/flashcards/[id]/flashcard-detail-view.tsx:140` -- remove the "Review this flashcard" `Link`. Check whether the `Link`/`buttonSecondary` imports become unused.
- Tests to update, because API-created Cards are now unlearned. Seed `firstGradedAt` to make Cards learned:
  - `tests/api/review-queue.spec.ts` (`addCard` helper, flashcard-scope rows at about lines 190–211 and line 223)
  - `tests/e2e/review.spec.ts` (`seedCard` at about line 36, the flashcard-link test at line 213, the 404 test at line 330)
  - `tests/domain/review.test.ts` (lines 36–56)
  - `tests/api/review-grade.spec.ts`
  - `tests/domain/cards.test.ts`

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/schema.prisma` + new migration -- add the column and the backfill `UPDATE … WHERE "interval" > 0`, then regenerate the client.
- [x] `packages/domain/src/cards.ts` -- add `firstGradedAt: Date | null` to `NewSchedulingRecord` and set it to `null`.
- [x] `packages/domain` -- add `learnedCardWhere` / `unlearnedCardWhere` with a doc comment citing AD-14.
  - Schema: remove `flashcardId` from scope, reject it explicitly with "Flashcard review moved to Learn.", and narrow `ReviewScopeKind` to `"class" | "folder"`.
- [x] `apps/web/app/api/review/grade/route.ts` -- write `firstGradedAt` once and update the doc comment.
- [x] `apps/web/app/api/review/queue/route.ts` -- apply the learned predicate and drop the flashcard scope.
- [x] `apps/web/app/(shell)/review/review-session.tsx` and `flashcards/[id]/flashcard-detail-view.tsx` -- per the Code Map.
- [x] `tests/domain/learned.test.ts` -- check the exact shape of both builders. Check that the query schema rejects `flashcardId` alone and with another scope.
- [x] `tests/api/review-queue.spec.ts` -- cover every queue row of the matrix (unlearned, half-learned, learned, Again-after-learned, 400). Seed learned Cards by setting `firstGradedAt`.
- [x] `tests/api/review-grade.spec.ts` -- cover the first-grade and later-grade rows.
- [x] `tests/api/first-graded-backfill.spec.ts`:
  - Seed records with `firstGradedAt` null: one with interval 6, one with interval 0.
  - Run the `UPDATE` statement read from the migration file.
  - Assert the Backfill row.
- [x] `tests/domain/cards.test.ts` -- both records have `firstGradedAt` null.
- [x] `tests/e2e/review.spec.ts`:
  - Seed learned records.
  - Replace the flashcard-link test: the Flashcard page has no "Review this flashcard" link, and `/review?flashcardId=x` shows "This review link isn't valid."
  - Add a test: a Card added through the UI does not appear on `/review`.

**Acceptance Criteria:**
- Given the migration has run on a database with graded records, when Review opens, then the Cards graded before the migration (both directions) still appear when due.
- Given a Card created by manual entry, paste or file import, when it is saved, then both records have `firstGradedAt = null`.
- Given the Flashcard page, when it renders, then there is no "Review this flashcard" link, and the Class and Folder "Review this …" links still work.
- Given both themes, when the Flashcard page action row is screenshotted, then it conforms to DESIGN.md tokens and the anti-generic rules.

## Spec Change Log

## Review Triage Log

Pass 1. Layers: blind, edge, verification-gap, design-fidelity. The design-fidelity and verification-gap layers found nothing.

**Patch** (low):
- **Backfill timestamp (blind):** the backfill stores `updatedAt` (the last write), not the true first-grade time, and nothing says so. Fixed with a note in the `schema.prisma` doc comment. The applied migration file is not edited, because that would change its checksum.
- **No end-to-end unlearned→learned test through the grade route (blind):** the queue tests seed `firstGradedAt` with Prisma. Added an API test that grades both directions of an API-created Card and checks that it then appears in the queue.
- **Vacuous e2e assertion (blind):** the `"squall"` count 0 check runs on the done screen, where it can never fail. Deleted. The "1 / 2" counter is the real check.

**Rejected:**
- **No UI path to learn a new Card until 4.8 (edge, blind):** real. The frozen intent and the Sprint Change build order (4.6 → 4.7 → 4.8) accept it, and Design Notes records it as a known interim gap. Raised to the human: do not deploy 4.6 to production ahead of 4.8.
- **Pre-migration half-graded Cards leave Review (edge, blind):** false as a defect. The frozen matrix row "Half-learned" requires it, and Learn (4.8) will show the remaining ungraded direction.
- **"Flashcard review moved to Learn." never shown in the UI (edge, blind):** false as a defect. The frozen Boundaries require a stale link to land on "This review link isn't valid."
- **Empty `?flashcardId=` on `/review` opens a full session (blind):** low and unlikely. No link produces an empty id.
- **A Card with zero records counts as learned (blind):** false in practice. `cards/batch` creates Cards and their records in one transaction through AD-9, so the state can't occur.
- **Import paths untested for `firstGradedAt` null (blind):** low. Every path shares `createCardWithSchedulingRecords`, and the batch route spreads its records (the verification-gap layer confirmed this).
- **`GradeResult` lacks `firstGradedAt` (blind):** false as a defect. Nothing needs it yet; 4.8 decides.
- **Backfill test is brittle and only cleans up when it passes (blind):** low. It deliberately runs the real migration statement, and the test database is disposable.
- **Visual AC lacks evidence (blind):** false. Dark and light screenshots at 1280 and 390 were captured in step 3.
- **Class and Folder Review links untested (blind):** false as a defect of this change. The diff doesn't touch them.

## Design Notes

**Why `none: { firstGradedAt: null }`:** a Card always has exactly two records (AD-9, unique `(cardId, direction)`). "No unlearned record" is therefore the same as "both graded", it is a single relation filter, and it composes into the existing `card:` where.

**Known interim gap:** between this story and 4.8, the UI has no way to learn a new Card. New Cards stay out of Review until Learn ships. This follows the planned build order (4.6 → 4.7 → 4.8).

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: clean, all pass.
- `npm run test:api` and `npm run test:e2e`, with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/training_sanctum_test` and `BETTER_AUTH_URL=http://localhost:3100` -- expected: all pass. Apply the migration to the test database first.

**Manual checks:**
- Screenshot the Flashcard page action row in dark and light themes.
