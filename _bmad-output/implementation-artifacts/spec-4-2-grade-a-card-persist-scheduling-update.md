---
title: 'Story 4.2: Grade a Card & Persist Scheduling Update'
type: 'feature'
created: '2026-11-13'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The SM-2 engine from Story 4.1 exists, but nothing calls it yet. A grade cannot change a Scheduling Record. Story 4.3's review session needs one authenticated endpoint that applies a grade and saves the result durably. Under AD-4, that endpoint is the only code allowed to write `interval`, `repetitions`, `easeFactor` and `nextReviewDate`.

**Approach:** Add `POST /api/review/grade`, which takes `{ schedulingRecordId, grade }`. Zod validates the body with a schema in `packages/domain`. Inside a single Prisma `$transaction`, the route:

- locks the record, which the user must own through its Card;
- confirms it is due;
- calls `applyGrade` with `now` and `User.timezone`;
- writes back only that one record.

It answers with the updated record in the `{ data }` envelope and logs one structured line. It rejects a missing session with 401, bad JSON or a bad body with 400, an unknown or another user's record with 404, and a record that is not due with 409 `NOT_DUE`. The 409 means a retried or double submit can never advance the schedule twice.

</frozen-after-approval>

## Implementation Notes

**Planned shape (decided at planning, not user-visible):**
- `packages/domain/src/review.ts` (new) exports:
  - `gradeRequestSchema`: `schedulingRecordId` is a non-empty string, and `grade` is `z.enum(REVIEW_GRADES)`. Both use user-facing messages.
  - `GradeRequest`.
  - `GradeResult { id, cardId, direction, interval, repetitions, easeFactor, nextReviewDate: string }`, with `nextReviewDate` as an ISO string.
  - It is re-exported from `src/index.ts`, and the barrel comment mentions it.
- `apps/web/app/api/review/grade/route.ts` (new) follows `cards/batch/route.ts`:
  - It uses `requireSession`, `readJson`, `validationFailure`, `HttpError` inside `$transaction`, and a `console.info(JSON.stringify({ operation: "review.grade", ... }))` log line for success, rejection and failure.
  - `SchedulingRecord` has no `userId`, so ownership is `card: { userId }`.
  - Inside the transaction:
    1. Run `SELECT … FOR UPDATE` on `scheduling_records`, as the import route does on `flashcards`, so concurrent grades of one record are serialized.
    2. Read the record, scoped to the owner.
    3. If `nextReviewDate > now`, throw 409.
    4. Call `applyGrade`.
    5. Run `update` by id.
  - Only that record is written, which keeps the two directions independent.
- **"Due"** means `nextReviewDate <= now`. Stored dates are always local midnights, so this is the same as "≤ start of the local day".
- **Tests:**
  - `tests/domain/review.test.ts` covers the schema.
  - `tests/api/review-grade.spec.ts` covers 401, bad JSON, bad grade, missing id, someone else's record (404), Good on a new record (interval 1, reps 1, EF 2.5, next local midnight), the other direction left untouched, the 1/3/4/5 mapping observed through the stored EF, and a second grade getting 409.

**Built:**
- **Files:**
  - `packages/domain/src/review.ts` (new). It also exports `RECALL_DIRECTIONS` and `RecallDirection`, a string union matching the Prisma enum, because the domain cannot import Prisma.
  - `packages/domain/src/index.ts`
  - `apps/web/app/api/review/grade/route.ts` (new)
  - `tests/domain/review.test.ts` (new, 3 tests)
  - `tests/api/review-grade.spec.ts` (new, 6 tests)
- **Results:**
  - `npm test` passes 154/154. Typecheck and lint are clean.
  - `npm run test:api` passes 90/90 against a local Postgres (`postgres:postgres@localhost:5432/training_sanctum_test`, the same as CI) with `BETTER_AUTH_URL=http://localhost:3100`.
- **Surprises:**
  - `apps/web/.env.local` points at a remote Neon DB and at `BETTER_AUTH_URL=:3000`. Running the API suite with it fails every sign-up on the origin check, so the env has to be overridden as shown above.
  - Playwright JSON-encodes a string `data`. A malformed-JSON test must send a `Buffer`, as the existing suites do.
- Review fixes:
  - The `FOR UPDATE` lock now joins `cards` and filters by `userId`, so a user can no longer lock someone else's row.
  - Every log line now carries `userId`.
  - Added a concurrent double-grade test, which expects one 200, one 409 and `repetitions` 1.
  - Expected due dates now come from the record's own creation midnight, which removes the test-clock flake around 17:00Z.
  - The mapping test now asserts the 15-day `nextReviewDate`.
  - `npm run test:api` passes 91/91.

## Review Triage Log

- **409 `NOT_DUE` vs the epic's "last write wins, no locking or conflict UI":** medium.
  - It is real: a stale second device's grade is refused instead of being applied on top.
  - Applying it on top would compound two grades, so the refusal was a deliberate intent decision.
  - Deferred for human confirmation. Story 4.3 must treat `NOT_DUE` as "already applied": drop the entry and show no error.
- **Lost-response retry gets 409 and the client would wrongly roll back:** medium.
  - It is real, but it's client handling. Deferred to Story 4.3 (same handling as above).
- **Row lock taken before the ownership check:** low, patched. The owner filter is now in the `FOR UPDATE` query.
- **Rejections not logged / no `userId`:** partly real.
  - `userId` was added (low, patched).
  - 400 and 401 never reach a write. The epic requires logging on the write, and the other routes don't log them either, so that part is false.
- **No concurrency test:** low, patched.
- **"Good" test repeats the engine's maths and depends on the test clock:** low, patched.
- **No multi-day `nextReviewDate` assertion:** low, patched.
- **No 500-path test:** low, rejected. A DB fault is hard to induce in the API suite, and the rollback is Prisma `$transaction` semantics.
- **Schema allows any id length and non-strict extras:** low, rejected.
  - The id is a bound parameter, so there is no injection.
  - Extra fields are dropped, never written.
  - Non-strict matches every other schema in the repo.
- **Schema messages not unit-tested:** low, rejected. The API test asserts the `fields` keys.
- **`RECALL_DIRECTIONS` can drift from Prisma:** low, rejected.
  - Assigning the Prisma result to `GradeResult` fails to compile if Prisma adds a value.
  - A removed value is harmless.
- **`sprint-status.yaml` shows 4.1 as `review` though it is merged:** real but pre-existing, and not caused by this change. Deferred.
- **404 says "Card not found." for a record:** false as a defect. User-facing copy talks about cards, not Scheduling Records.
