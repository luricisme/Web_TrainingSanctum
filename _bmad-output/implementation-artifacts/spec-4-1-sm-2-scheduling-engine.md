---
title: 'Story 4.1: SM-2 Scheduling Engine'
type: 'feature'
created: '2026-11-13'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-Web_TrainingSanctum-2026-10-29/addendum.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Review (Epic 4) has no scheduling engine yet. Every grade path in Stories 4.2–4.5 needs one pure, exactly-tested classical SM-2 function, so that `interval`, `repetitions`, `ease_factor` and `next_review_date` are computed in exactly one place (AD-4) and never diverge from the PRD formula.

**Approach:** Add a framework-free `applyGrade` to `packages/domain` (`src/sm2.ts`, AD-1). It maps Again/Hard/Good/Easy to quality 1/3/4/5 and returns a new scheduling state, including a timezone-correct `nextReviewDate`, without mutating its input. Prove it with Vitest tests covering both PRD-addendum sequences as exact matches, plus the FR-8 checklist: interval reset on Again, the EF floor of 1.3, EF unchanged on Again, identical Hard/Good/Easy intervals, direction independence and the grade-to-quality mapping.

</frozen-after-approval>

## Implementation Notes

**Planned shape (decided at planning, not user-visible):**
- `packages/domain/src/sm2.ts` exports:
  - `REVIEW_GRADES` (`["again","hard","good","easy"] as const`), the `ReviewGrade` type and `GRADE_QUALITY` (again 1, hard 3, good 4, easy 5).
  - The constants `DEFAULT_EASE_FACTOR = 2.5`, `MIN_EASE_FACTOR = 1.3`, `FIRST_INTERVAL = 1` and `SECOND_INTERVAL = 6`.
  - `SchedulingState { interval; repetitions; easeFactor }`.
  - `applyGrade(state, grade, { now, timeZone }) → SchedulingState & { nextReviewDate: Date }`.
  - Re-export it from `src/index.ts`. Update the barrel comment that says SM-2 "lands in later stories".
- **EF rounding:** the result EF is rounded to 2 decimals. Every SM-2 delta (+0.10, 0, −0.14) is a multiple of 0.01, so this loses nothing and stops float drift (2.5−0.14 = 2.3600000000000003). Without it, the PRD's exact-match fixtures and the stored `Float` column would accumulate noise.
- **Interval:** `repetitions` before the grade is 0 → 1, 1 → 6, and 2 or more → `Math.round(prev.interval × prev.easeFactor)`, using the EF from before this update. Again → `repetitions` 0 and interval 1, with EF returned unchanged.
- **`nextReviewDate`:** take the start of the local day for `now` from `toLocalCalendarDay(now, timeZone)` (AD-8, reused, not duplicated), then add `interval` calendar days DST-safely. Add `interval × 24h + 12h` to local midnight, then snap back with `toLocalCalendarDay`. This matches how creation sets `next_review_date` to the start of a local day, so the queue's "due if ≤ start of today" filter in 4.3 stays correct across DST changes.
- **No Zod schema and no DB/API code here:** request validation and persistence belong to Story 4.2.
- **Tests:** `tests/domain/sm2.test.ts`, run by the root `vitest.config.ts`. Imports come from `@training-sanctum/domain`, following the style of `tests/domain/cards.test.ts`.

**Built:**
- Changed `packages/domain/src/sm2.ts` (new), `packages/domain/src/index.ts` (barrel export and comment) and `tests/domain/sm2.test.ts` (new, 19 tests).
- `npm test` passes 151/151. Domain typecheck and lint are clean.
- Review fixes:
  - The mature interval is now computed in integer hundredths of EF. The float `Math.round(i × EF)` missed exact .5 cases: 25 × 2.3 gave 57, not 58, and 77 pairs fail in the 1–399 × 1.30–4.00 range.
  - The grade guard uses `Object.hasOwn`. A plain lookup let through inherited keys like "toString" and returned EF NaN.
  - `GRADE_QUALITY` keeps its literal types (`as const satisfies`).
  - Added tests for real dual-direction independence (one Card, two records, either order), the Easy-from-floor case, and a chained, multi-month New York test across DST changes and a year end.

## Review Triage Log

- Float error in `round(interval × EF)` at .5 products: **medium**. Confirmed in Node (25 × 2.3 = 57.49999999999999). Patched with a regression test.
- Unknown-grade guard misses prototype keys: **low**. Confirmed (`GRADE_QUALITY["toString"]` is a function). One-line fix, so patched.
- No validation of input state or clock: **maybe-false (medium if true)**. Only applyGrade and the creation defaults write these fields, so a corrupt state can't happen today. Deferred to Epic 5 restore validation. A bad timeZone or Invalid Date already fails loudly.
- Direction-independence test was trivial: **low**. Confirmed, and the test was rewritten.
- Fixtures don't assert nextReviewDate or chained gradings: **low**. Patched with the chained New York test.
- Missing DST-at-midnight, non-whole-hour and long-interval date tests: long intervals and year ends are covered by the chained test. The DST-at-midnight concern is about the pre-existing `toLocalCalendarDay`, so it's **maybe-false (medium)** and deferred.
- EF floor upper side and sub-floor input: Easy from the floor is **low** and a test was added. Again keeping a sub-floor EF is **false**: every EF comes from the 2.5 default or applyGrade, so it is always ≥ 1.3.
- `GRADE_QUALITY` typing loses literals: **low**, and patched (`as const satisfies`).
- No exported "never graded" helper: **defer** to Story 4.4, which owns the new-card cap definition.
- Spec lacks AC or verification sections: **false**. The oneshot route deliberately keeps only Intent and Implementation Notes, and the status was still in-progress before finalizing.
