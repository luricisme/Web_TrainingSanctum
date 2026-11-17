---
title: 'Story 12.2: Class Membership and Access Guards'
type: 'feature'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
baseline_commit: 'edce0f5b6b499eb48d7c9a99ed95056ec04028d5'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every route authorises with a bare `userId` equality filter, so a second person can never read or study a Class. Shared Classes need one ownership check, one access check, and Card creation that serves every learner.

**Approach:** Add `ClassMember`, pure access helpers in `packages/domain`, and two route guards (`requireClassOwner`, `requireClassAccess`); apply them to every class-scoped route; fan Card creation and Flashcard moves out to all learners. No invitation or UI yet: Members exist only via the database until Story 12.3.

## Boundaries & Constraints

**Always:** One additive migration `ClassMember (id, classId, userId, createdAt)`, both FKs `ON DELETE CASCADE`, unique `(classId, userId)`, index `(userId)`; hand-written SQL, applied to the local test DB only (Neon is deployed by the human with the code, as in 12.1). `packages/domain/src/access.ts` (exported from the barrel): `classAccess(userId, cls, members)` returns `'owner' | 'member' | null`; `classLearnerIds(cls, members)` returns the owner first, then members, no duplicates. Guards live in `apps/web/lib/class-access.ts` and resolve a Class from a class, folder, flashcard or card id: stranger or missing `404 NOT_FOUND`, Member on a write `403 FORBIDDEN`, standard envelope. Writes: all POST/PATCH/DELETE under classes, folders, flashcards (incl. move), cards (batch, import commit, edit, delete), class colour, and `import/parse`. Reads and study: GETs on those, `review/queue|learn|unlearned` (scoped by `classId`/`folderId`/`flashcardId`), `review/grade`, `flashcards/[id]`. Card-level filters in those review routes stop using `Card.userId`; they use the Class's access plus the caller's `SchedulingRecord.userId`. `Card.userId` stays the Owner's. `createCardWithSchedulingRecords` is called with `classLearnerIds` for every creation path. A move to a Folder in another Class runs in one `$transaction`: delete records of learners absent from the target, create default records (2 per learner) for target learners lacking them. Deleting a Folder, Flashcard, Class or Card removes every learner's records (via existing cascades). `GET /api/classes`, `GET/PATCH /api/classes/[id]` add `memberCount` (Members, excluding the Owner) to `ClassSummary`. Every membership-affecting write (card fan-out, move re-seeding) logs one structured JSON line `{operation, classId, ...}` through a small shared logger. Restore keeps writing owner-only records.

**Never:** No invitation, bell, Share modal, Leave/Remove, UI, or "shared classes in unscoped Review/Learn/quests" (Stories 12.3, 12.4). No export/restore/admin change (12.5). No change to SM-2, XP, or response shapes beyond `memberCount`. No dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Owner write | owner PATCH class | as today | N/A |
| Member write | member PATCH/POST/DELETE any write route | nothing changes | `403 FORBIDDEN` |
| Stranger | non-member, any route | nothing changes | `404 NOT_FOUND` |
| Member read | member GET class, folders, flashcard | `200` with owner's data | N/A |
| Member study | member grades own record, scoped queue | works on own records only | grading another's record `404` |
| Fan-out | owner adds cards, class has 2 Members | each Card gets 6 records, 2 per learner | N/A |
| Move | flashcard to a Class lacking learner m | m's records dropped, target learners without records get defaults | transaction rolls back on failure |
| Delete | owner deletes a Class with Members | every learner's records and memberships gone | N/A |

</frozen-after-approval>

## Code Map

- `packages/db/schema.prisma` (Class ~130, User ~34) -- add `ClassMember`, `Class.members`, `User.classMemberships`; new migration `20261117010000_add_class_members`.
- `packages/domain/src/access.ts` (new), `index.ts` -- pure helpers; tests in `tests/domain/access.test.ts`. `classes.ts` -- `ClassSummary.memberCount`.
- `apps/web/lib/class-access.ts` (new) -- guards; reuse `requireSession` (`lib/session.ts`) and `fail` (`lib/api-response.ts`). `apps/web/lib/log.ts` (new) -- structured logger replacing the local `logGrade` pattern.
- `A/classes/route.ts`, `A/classes/[id]/route.ts`, `A/classes/[id]/folders/route.ts`, `A/folders/[id]/route.ts`, `A/folders/[id]/flashcards/route.ts`, `A/flashcards/[id]/route.ts`, `A/flashcards/[id]/move/route.ts`, `A/cards/batch/route.ts` (createCards L33-45, import L185), `A/cards/[id]/route.ts`, `A/import/parse/route.ts` -- replace `{id,userId}` filters with guards (`A/` = `apps/web/app/api/`).
- `A/review/queue|unlearned|learn|grade/route.ts`, `apps/web/lib/review-scope.ts`, `lib/learn-queue.ts` -- class-access scope; unscoped queries unchanged.
- Do not touch: `lib/backup-export.ts`, `A/admin/**` (12.5), stats/cultivation routes.
- Deferred-work entry from 12.1 (Card-scoping would exclude Members) is resolved here for review routes.

## Tasks & Acceptance

**Execution:**
- [x] `schema.prisma` + migration SQL -- `ClassMember`; regenerate client; apply to the test DB
- [x] `packages/domain/src/access.ts` + `tests/domain/access.test.ts` -- owner, member, stranger, duplicate member, owner-first ids
- [x] `apps/web/lib/class-access.ts`, `lib/log.ts` -- `requireClassOwner`, `requireClassAccess`, resolvers by class/folder/flashcard/card id
- [x] class, folder, flashcard, card, import routes in the Code Map -- apply the guards; `memberCount` on class responses
- [x] `A/cards/batch/route.ts` -- fan out via `classLearnerIds`, log the line; `A/flashcards/[id]/move/route.ts` -- re-seed records in one transaction
- [x] review routes and libs -- `requireClassAccess` for scoped queue/unlearned/learn, `flashcards/[id]` counts, grade
- [x] `tests/api/class-access.spec.ts` -- Member 403 and stranger 404 on one write route per kind (class, folder, flashcard, card, import, colour); Member reads and studies; fan-out; move re-seed; delete cascade; `memberCount`
- [x] fix any existing test asserting `ClassSummary` shape; run typecheck, lint, vitest, api, e2e

**Acceptance Criteria:**
- Given the migration, then `class_members` exists with unique `(classId, userId)` and cascading FKs, and row counts of all other tables are unchanged.
- Given any single-learner scenario, then the full existing unit, API and e2e suites pass with unchanged behaviour.
- Given a Class with Members, when its Owner or a Member acts, then results match the I/O matrix on every guarded route.

## Implementation Notes

- Migration `20261117010000_add_class_members` applied to the local test DB only; Neon is for the human, together with the code (otherwise every page 500s).
- Beyond the spec: Class DELETE in "move" mode and a cross-Class Flashcard move both re-seed records via `reseedCardRecords`; a move needs ownership of the target Class too (Member 403, stranger 404). `review/grade` reads the grader's timezone. New default records use the Owner's timezone.
- Known: scoped `review/unlearned` `addCardTarget` can point a Member at a Flashcard they cannot edit (UI lands in 12.4). Unscoped Review/Learn include Shared Class records until 12.4.
- Verification: typecheck, lint, vitest (321), API (228 + 3 admin specs flaky under parallel workers, green at `--workers=1`) and e2e (199 + 1 `admin-users` 1280px flake, green alone) pass.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Class DELETE move mode with Members has no test | medium | No test uses `mode: "move"` with Members. patch: add test. |
| Scoped queue/unlearned asserted for HTTP 200 only (Member) | medium | Empty body would also pass. patch: assert bodies; `queue/route.ts` already has no `Card.userId` filter. |
| Move into a target Class where caller is only a Member (403) untested | low | Route is correct; patch: add the one test. |
| 403 body envelope never asserted | low | patch: assert `error.code` FORBIDDEN in one case. |
| Move route and Class DELETE move read learners outside the transaction | medium | `targetAccess.learnerIds` / `guard.access.members` are pre-transaction. patch: re-read members inside the tx. |
| reseedCardRecords: one large createMany (bind limit, 5 s tx) | maybe-false (would be medium) | defer: unverified whether Prisma chunks createMany; settle with a 3,000-card move. |
| Learner timezone for seeded records (Owner's tz) | low | Unlearned records do not enter Review; grade uses the grader's tz. Rejected. |
| cards/batch classId stale after concurrent move; other guard-then-write races | low | Only the same Owner can move, ownership never transfers. Rejected (adds complexity). |
| No route-inventory test for missing guards | low | Speculative, no present defect. Rejected. |
| Validation before authorisation (400 vs 403/404 with invalid body) | low | Matrix uses valid bodies, nothing leaks. Rejected. |
| Move out of shared Class drops Members' progress without warning | false | Specified behaviour (spec matrix, AC "drops the records"). |
| Guard round trips; Design Notes wording | low | Rejected, negligible. |
| `cls.color` typing, `logOperation` field order, no denial logging | low | Rejected, cosmetic. |
| Test DB rows left behind, hard-coded BASE | false | Same convention as every other API spec. |
| Dead `count === 0` checks after the guard | low | Rejected, harmless. |
| Owner row also in class_members inflates memberCount | low | 12.3 will not invite the Owner; rejected. |
| `FOLDER_NOT_FOUND` code on move | false | Pre-existing code for a missing target folder (baseline route L52, L87). |
| No GET `/api/classes/[id]` memberCount | false | The route has only PATCH and DELETE. |
| Fan-out logged only with Members | false | Owner-only writes are not membership-affecting. |
| Member with no seeded records sees an empty Learn | false | Records are seeded by 12.3 acceptance; direct DB membership is test-only. |
| skipDuplicates keeps retained learners' records | false | Intended: progress must survive. |
| Merge reseed when owners differ | false | `Card.userId` and owner are the same within one user's Classes. |
| queue route has residual Card.userId filter | false | Read: queue filters only on `SchedulingRecord.userId`. |
| Mixed responsibilities in class-access.ts | low | Rejected, style. |

## Design Notes

Resolvers map any entity id to its `classId` with a single query joining up (card -> flashcard -> folder -> class), then load the Class and its Members once and call `classAccess`; the guard returns `{ cls, members, role }` so routes reuse the loaded learners for fan-out instead of re-querying.

## Verification

**Commands:**
- `npm run db:generate && npm run db:migrate:deploy` (test DB, PowerShell) -- expected: migration applies
- `npm run typecheck && npm run lint` -- expected: clean
- `npm test` -- expected: all pass
- `npm run test:api` and `npm run test:e2e` (PowerShell, test DB env vars) -- expected: all pass
