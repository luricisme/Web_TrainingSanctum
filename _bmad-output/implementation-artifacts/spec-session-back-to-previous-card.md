---
title: 'Back to the previous card in a study session, with a real SM-2 undo'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: '141541041f737ab9f3e5f1555beaac6fa1ebc4d7'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** During a study session a grade cannot be taken back. A mis-press of Again/Hard/Good/Easy is final, because the grade route moves `nextReviewDate` into the future and rejects a second grade (409 NOT_DUE).

**Approach:** Add a Back control to the shared grading session. It returns to the previous card and truly undoes that card's grade: the SM-2 state of its Scheduling Record is restored, so grading it again never counts twice.

**Decisions (agent, recorded):**
- **Scope:** Back lives in the shared `GradingSession`, so Learn, Review and the unsaved practice run all get it. Practice undo is local only.
- **Key:** `ArrowLeft`. Back is disabled on the first slot.
- **Quests and XP:** they derive from the records, so a restored record un-counts itself. Quest XP already claimed is not revoked.

## Boundaries & Constraints

**Always:**
- **History:** the session keeps a stack of its state from before each grade. Back pops one entry, which restores slots, index and counter, and removes any practice copy that grade appended. The card returns unflipped, to be graded again.
- **Server undo:** `POST /api/review/undo` takes `{ schedulingRecordId, previous, expectedNextReviewDate }`.
  - `previous` holds `interval`, `repetitions`, `easeFactor`, `nextReviewDate`, `firstGradedAt` (nullable) and `updatedAt`, all validated by a Zod schema in `packages/domain/src/review.ts`.
  - It runs in the same locked transaction pattern as the grade route.
  - It writes only when the record's current `nextReviewDate` equals `expectedNextReviewDate`, otherwise 409 CONFLICT. It writes `previous.updatedAt` explicitly so "reviewed today" facts are not inflated.
  - The record must be the session user's, else 404.
- **Previous state source:** `GradeResult` gains `previous`, read in the grade route before it writes. SM-2 values still come from `applyGrade` alone (AD-4), and the grade route's existing behavior is unchanged.
- **Ordering:** Back never races the grade it undoes. If that grade's POST is still pending, the undo is sent only after it settles. If it failed, nothing is sent.
- **Failure:** a failed undo shows the existing error line and keeps the card on screen. It never shows a card whose server state is unknown.
- **Visual:** UI conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes. Back is a quiet secondary control that never takes the accent.
- **Freshness:** a settled undo triggers `onGradeSettled` so Learn's Flashcard counts refresh.

**Never:**
- No schema or migration change.
- No new dependencies.
- No client-side computation of SM-2 values.
- No change to queue ordering or to the Again-repeat rules.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Undo a saved grade | Card 3 graded Good, Back | Card 3 shown unflipped, counter drops one, record restored, regrade posts once | N/A |
| First slot | index 0 | Back disabled, `ArrowLeft` ignored | N/A |
| First-ever grade | Record had `firstGradedAt` null | Restored to null, so the Card is Unlearned again | N/A |
| Again repeat | Card graded Again (copy appended), Back | Copy removed, undo POSTed, total shrinks | N/A |
| Practice slot | Practice run, Back | Local only, no request | N/A |
| Fast Back | Back while the grade POST is pending | Undo waits for it, then sends | N/A |
| Stale state | Record graded again in another tab | Undo 409 CONFLICT, error line, card stays | Error line |
| Grade failed | POST 500, then Back | No undo sent, existing rollback applies | Existing |
| Bad input | Invalid `previous` or other user's record | 400 / 404 | `{ error }` |

</frozen-after-approval>

## Code Map

- `apps/web/app/(shell)/review/grading-session.tsx`: `GradingSession`, `SessionState`, `advance`, the `useMutation` rollback, `GRADE_KEYS` and the keydown handler. Add the history stack, Back button, `ArrowLeft` and the undo mutation. Do not change `ReviewCard`.
- `apps/web/app/api/review/grade/route.ts`: select the previous values and return them as `previous`. The `applyGrade` call stays untouched.
- `apps/web/app/api/review/undo/route.ts` (new): mirror the grade route's `requireSession`, Zod parse, `FOR UPDATE` lock and `HttpError`/`fail`/`ok` shape.
- `packages/domain/src/review.ts` and `index.ts`: `undoRequestSchema`, `GradePrevious`, and `previous` on `GradeResult`.
- `apps/web/app/(shell)/flashcards/[id]/learn/learn-session.tsx` and `review/review-session.tsx`: callers; they need no change unless props change.
- `apps/web/lib/cultivation-day.ts`: reads `firstGradedAt` and `updatedAt`, which is why `updatedAt` is restored.
- Tests: `tests/api/review-grade.spec.ts` (helpers), `tests/e2e/learn.spec.ts` and `tests/e2e/review.spec.ts` (session patterns, held-POST test), `tests/domain/review.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/review.ts`, `index.ts` -- add `undoRequestSchema`, `GradePrevious`, `GradeResult.previous` -- shared contract
- [x] `tests/domain/review.test.ts` -- cover valid, missing and out-of-range `previous` -- schema guard
- [x] `apps/web/app/api/review/grade/route.ts` -- return `previous` -- source of the snapshot
- [x] `apps/web/app/api/review/undo/route.ts` -- new restore route with the conflict guard -- server undo
- [x] `apps/web/app/(shell)/review/grading-session.tsx` -- history stack, Back button, `ArrowLeft`, ordered undo, error handling -- session behavior
- [x] `tests/api/review-undo.spec.ts` -- restore of every field, `firstGradedAt` back to null, 409, 404, 400 -- API matrix
- [x] `tests/e2e/learn.spec.ts`, `tests/e2e/review.spec.ts` -- Back after a grade, after Again, on the first slot, with a held POST, and with the keyboard; screenshots in both themes at 1280px and 390px -- UI

**Acceptance Criteria:**
- Given a Card graded and then undone, when it is graded again, then its final SM-2 state equals a single grade from the original state.
- Given the existing Review and Learn e2e and API suites, when they run, then they pass unchanged.
- Given the session UI, when it renders, then it conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Pass 1. Layers: blind, edge-case, verification-gap, design-fidelity.

**Patch:**
- **`disabled:cursor-not-allowed` on `navButton` (design-fidelity):** low. `globals.css:255` already sets `button:disabled { cursor: not-allowed }`, and DESIGN.md says never set the cursor per component. Remove the utility.
- **No test holds input while an undo is in flight (verification-gap, pre-verified):** medium. Space, a grade key and a second ArrowLeft during a pending undo are unasserted, so removing the `undoingRef` guards would pass. Extend the pending-grade e2e.
- **Multi-step Back and a grade that fails after Back was clicked are untested (verification-gap, pre-verified):** medium. Add two e2e cases: grade two cards then Back twice, and fail a held grade after clicking Back.
- **`isoInstant` accepts anything `Date.parse` accepts (blind, edge):** low. Strings like "1" pass, and an out-of-range year reaches Prisma as a 500. The fix is direct: use `z.iso.datetime()`.
- **`easeFactor` lower bound duplicates `MIN_EASE_FACTOR` (blind):** low. If `sm2.ts` changes the floor, undo rejects legitimate records with 400. Import the constant.

**Rejected:**
- **Undo trusts a client-supplied `previous` (blind, edge, verification-gap):** low. It only touches the caller's own records, and backup restore (Story 5.3) already lets a user write any SM-2 state and `firstGradedAt` for them. A server-side snapshot needs a migration, which the frozen Never forbids.
- **Conflict check compares `nextReviewDate` only (edge, verification-gap, blind):** low and unlikely. After a grade the record is not due, so another tab's grade gets 409 NOT_DUE. A same-date collision needs undo then regrade elsewhere, and the undo was already spent.
- **Permanent 409/404 shows "Try again" and Back stays stuck (blind, edge):** low and unlikely. It needs the card deleted in another tab or a response lost after the server committed. The fix adds branches.
- **Undo leaves other grade side effects (blind):** false. The grade route writes only the Scheduling Record. Quests and XP derive from `firstGradedAt` and `updatedAt`, both restored.
- **Restore and rollback ordering depends on microtasks (edge):** false. `restore` checks `history.indexOf(entry)` and the rollback handles `from >= index`, so either order ends on the card with the grade error line.
- **ArrowLeft stays active on the finished screen (edge):** false. The keydown handler returns when there is no current slot.
- **A failed grade A re-presents a saved grade B as ungraded (edge):** false. B stays in the graded region. Only B's undo history is dropped, which is rare and deliberate.
- **Offline or hung grade freezes the session (edge):** low and unlikely. Mutations default to `networkMode: "online"`, so the grade and its undo pause together and run in order on reconnect.
- **Ordered or sticky error, focus after Back disables, a11y copy, history size, log reasons, `onGradeSettled` reuse (blind, edge):** low. All are cosmetic or unlikely, and each fix adds guards or surface.
- **Screenshot tests assert nothing, and the 300 ms negative wait (blind, verification-gap):** low. It follows the existing Learn screenshot and "no request" test patterns.
- **"Suites pass unchanged" does not hold for `review-grade.spec.ts` (edge):** the strict `toEqual` on the grade response had to gain `previous`. The only fix is to edit this spec.
- **Back is keyed on empty history, not index 0 (edge):** false. It is disabled whenever nothing is left to undo, which includes index 0.

## Design Notes

**History entry:** `{ before: SessionState, slotKey, saved: Promise<GradeResult> | null }`. Back restores `before`, and if `saved` exists, chains `saved.then(r => undo(r.previous, r.nextReviewDate))`. A grade rollback drops its own history entry.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: clean, all pass
- `npm run test:api && npm run test:e2e` with the test `DATABASE_URL` and `BETTER_AUTH_URL=http://localhost:3100` (run in PowerShell) -- expected: all pass

**Manual checks:**
- Screenshot a Learn session with Back enabled and disabled, in both themes at 1280px and 390px.
