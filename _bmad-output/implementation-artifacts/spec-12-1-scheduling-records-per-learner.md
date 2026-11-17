---
title: 'Story 12.1: Scheduling Records per Learner'
type: 'feature'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
baseline_commit: '795d7c26503629e934ab92acf4b5d5f42d8c30f8'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A Scheduling Record belongs to a Card, and the Card's owner is implicitly its only learner. Shared Classes (Epic 12) need two people to study the same Card on independent schedules.

**Approach:** Give `SchedulingRecord` a required `userId`, backfilled from `Card.userId`, and make every write and read of records learner-aware. Behaviour for a single learner (the Owner) stays identical; `learnerIds` is always `[ownerId]` until Story 12.2.

## Boundaries & Constraints

**Always:** One additive migration, hand-written SQL: add `userId` nullable, backfill `UPDATE scheduling_records sr SET "userId" = c."userId" FROM cards c WHERE c.id = sr."cardId"`, `SET NOT NULL`, FK to `users` with `ON DELETE CASCADE`, drop unique `(cardId, direction)`, create unique `(userId, cardId, direction)` and index `(userId, nextReviewDate)`; keep the old `nextReviewDate` index unless unused. `createCardWithSchedulingRecords(input, learnerIds, context)` returns two records (T2D, D2T) per learner at the existing defaults. The AD-14 predicates take `userId` as an explicit argument and put it in the record-level filter. `POST /api/review/grade` selects the record by `id` and `userId = caller`; 404 otherwise (including a record that exists but is another user's). Queue, learn, stats, cultivation-day, cultivation-settle, unlearned and flashcard-detail counts filter records by the caller. Restore sets `userId` to the restore target on every record. Every existing test fixture that creates records sets `userId`. The migration is deployed to Neon with the code. **Decision (human, 2026-11-17):** the dry run is rehearsed on the local test database only, with before/after row counts recorded in Implementation Notes; the human runs the Neon-branch dry run before deploying, so that acceptance criterion stays open until then and Neon is never touched by the agent.

**Never:** No Class membership, invitation, guard or UI (Stories 12.2+). No change to `backupExportSchema` (no `userId` in the backup JSON). No change to SM-2 maths, XP, or any response shape. No dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Backfill | existing rows, each with a Card | every record's `userId` = its Card's `userId`; row count unchanged | migration fails on any NULL, nothing applied |
| Create, 1 learner | `learnerIds=[a]` | Card + 2 records, both `userId=a` | N/A |
| Create, 3 learners | `learnerIds=[a,b,c]` | Card + 6 records, 2 per learner | N/A |
| Two users, one Card | records for a and b | a's queue, counts, grade touch only a's records | N/A |
| Grade | caller owns the record | graded as today | N/A |
| Grade, not caller's | record id of another user | 404 `NOT_FOUND`, record unchanged | N/A |
| Single learner | owner only | all existing suites pass unchanged | N/A |

</frozen-after-approval>

## Code Map

- `packages/db/schema.prisma` (SchedulingRecord ~216, User ~34, Card ~182) -- add `userId` + `user` relation (Cascade), `User.schedulingRecords`, swap `@@unique` and add `@@index([userId, nextReviewDate])`.
- `packages/db/migrations/` -- new `20261117000000_add_scheduling_record_user_id/migration.sql`; precedent for a backfill: `20261113000000_add_first_graded_at` and `tests/api/first-graded-backfill.spec.ts`.
- `packages/domain/src/cards.ts` (:99-141) -- `createCardWithSchedulingRecords`; `NewSchedulingRecord` gains `userId`; result becomes an array of records, not a 2-tuple.
- `packages/domain/src/learned.ts` (:38-74) -- `learnedRecordWhere`, `unlearnedRecordWhere`, `learnedCardWhere`, `unlearnedCardWhere`; `tests/domain/learned.test.ts` asserts exact shapes (:56-65).
- `apps/web/app/api/cards/batch/route.ts` (:36-55) -- sole creation caller; pass `[session user id]`; `createMany` spreads records.
- `apps/web/app/api/review/grade/route.ts` (:46-75) -- raw `FOR UPDATE` SQL and `findFirst {id, card:{userId}}` become `userId` on the record.
- `apps/web/app/api/review/queue/route.ts` (:32), `.../unlearned/route.ts` (:35), `apps/web/lib/learn-queue.ts` (:19-120), `apps/web/app/api/stats/route.ts` (:38-47), `apps/web/lib/cultivation-day.ts`, `apps/web/lib/cultivation-settle.ts` (:99) -- replace `card:{userId}` record filters and pass `userId` to predicates; `GET /api/flashcards/[id]` uses `countLearn`.
- `apps/web/app/api/admin/users/[id]/restore/route.ts` (:119-189) -- set `userId` on every created record.
- `apps/web/lib/backup-export.ts` (:32, :80) -- reads `card.schedulingRecords`; no change expected (only the owner has records until 12.2).
- Delete routes (`flashcards/[id]`, `folders/[id]`, `classes/[id]`) and admin user delete -- cascade via Card/User; no change.
- Tests needing `userId`: `tests/api/{admin-delete,admin-export,admin-restore,classes,flashcards,folders,cultivation-claim,cultivation-settle,first-graded-backfill,stats}.spec.ts`; `tests/e2e/{admin-restore,admin-user-view,flashcards,card-viewer,cultivation,learn,review}.spec.ts`; domain: `tests/domain/{cards,learned}.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/schema.prisma` + migration SQL -- as in Boundaries; regenerate client (`npm run db:generate`)
- [x] `packages/domain/src/cards.ts` -- `learnerIds` parameter, 2 records per learner; unit tests for 1 and 3 learners
- [x] `packages/domain/src/learned.ts` -- `userId` argument on all four predicates; unit tests with two users on one Card
- [x] `apps/web` routes and libs listed in the Code Map -- filter by caller `userId`; grade returns 404 for another user's record
- [x] `apps/web/app/api/admin/users/[id]/restore/route.ts` -- set `userId`
- [x] test fixtures listed in the Code Map -- add `userId`
- [x] `tests/api/review-grade.spec.ts`, `review-queue.spec.ts`, `review-learn.spec.ts`, `stats.spec.ts` -- add two-learner cases (user b's records exist on a's Card; a's grade/queue/counts ignore them; b's record id gives 404 for a)
- [x] `tests/api/scheduling-record-backfill.spec.ts` -- backfill and new unique/index behaviour
- [x] Record the dry-run row counts in Implementation Notes
- [x] Run typecheck, lint, vitest, api and e2e suites

**Acceptance Criteria:**
- Given the migration, then `SchedulingRecord.userId` is required, equals the Card's `userId` for all pre-existing rows, the unique is `(userId, cardId, direction)`, the index `(userId, nextReviewDate)` exists, and the dry-run before/after counts are recorded here.
- Given two users with records on one Card, when either studies, then the other's records, queue and counts do not change.
- Given any single-learner scenario, then the full existing unit, API and e2e suites pass with unchanged behaviour.

## Implementation Notes

- Local dry run (test DB `training_sanctum_test` only; Neon not touched). Before `migrate deploy`: 53,950 scheduling_records. After: 53,950 records, 0 with NULL `userId`, 0 where `userId` differs from the Card's `userId`. The Neon-branch dry run and deploy remain for the human (acceptance criterion stays open until then).
- Kept the old `(nextReviewDate)` index. `createCardWithSchedulingRecords(input, learnerIds, context)` now returns `schedulingRecords: NewSchedulingRecord[]` (2 per learner). Record filters no longer go through `card: { userId }`; Card-level count filters keep `Card.userId` (owner) plus the `userId`-scoped predicates.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Empty or duplicate learnerIds in createCardWithSchedulingRecords | low | Unreachable: the only caller passes [userId]. Rejected (a guard adds complexity). |
| Batch route may mis-map records | false | Route spreads each record (incl. userId) with cardId; cards and API suites pass. |
| Queue route Card filter undefined | false | userId comes from the session (string) and sits in learnedRecordWhere. |
| Card.userId scoping would exclude Members | medium | Real once 12.2 adds Members, not this story. defer (deferred-work.md). |
| No two-learner test for unlearned | medium | patch: added to review-unlearned.spec.ts. |
| No two-learner test for cultivation-day / settle | medium | defer with the Card-scoping entry; no Members until 12.2. |
| No assertion that restore and batch set userId | medium | patch: restore asserted in admin-restore.spec.ts; batch asserted in review-unlearned.spec.ts. |
| learned.ts formatting | low | patch: reformatted. |
| Backfill test cleanup without try/finally, SQL string-splitting | low | Rejected: unlikely to matter; fix adds structure. |
| Old nextReviewDate index kept | low | Rejected: spec decision, negligible cost. |
| Migration safeguards, dry-run counts not reproducible | false | About 54k rows, additive swap in one migration; counts are the manual local rehearsal the spec asked for. |
| Predicate argument order risk | low | Rejected: speculative. |
| Spec and sprint-status statuses differ, empty logs | false | Sprint status syncs in step 5. |

## Verification

**Commands:**
- `npm run db:generate && npm run db:migrate:deploy` (against the test DB, PowerShell) -- expected: migration applies
- `npm run typecheck && npm run lint` -- expected: clean
- `npm test` -- expected: all pass
- `npm run test:api` and `npm run test:e2e` (PowerShell, test DB env vars) -- expected: all pass
