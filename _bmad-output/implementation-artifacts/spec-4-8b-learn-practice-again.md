---
title: 'Story 4.8b: Study All Cards Again (unsaved practice)'
type: 'feature'
created: '2026-11-13'
status: 'done'
baseline_commit: '250dd39d7e65c1658402c5d2d0dd361faf25de86'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-8-learn-session.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/history/focus-indigo/working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Once a Flashcard has nothing waiting, Learn only says "Nothing left to learn in {Flashcard} right now." There is no way to run through all its Cards again, as Quizlet's restart allows.

**Approach:** The Learn complete state gains a secondary **"Study all cards again"** button. It starts a practice run over **every** Card of the Flashcard:
- **Order:** oldest-created first, each Card's two directions together, Term→Definition first.
- **Behavior:** the same flip, keys, swipe and grade buttons as Learn. An entry graded Again repeats at the end until it is graded Hard, Good or Easy.
- **Saving:** **no grade is saved.** Nothing is POSTed to the grade route and SM-2 scheduling never changes.
- **Header:** "Practicing {Flashcard} · grades aren't saved".
- **When the run ends:** "You've gone through every card in {Flashcard}." with "Study all cards again" (which starts a fresh run) and "Back to {Flashcard}".

**Decision (human, 2026-11-13):** option 1, practice that is not saved. A real reset of SM-2 was rejected because it would erase the review schedule of learned Cards.

**Acceptance:**
- UI conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.
- The button is secondary, never the accent.
- An e2e test proves a full practice run makes zero grade POSTs and leaves Scheduling Records unchanged.

</frozen-after-approval>

## Implementation Notes

- **`grading-session.tsx`:** new `practice` prop. Every slot starts as `practice`, so the existing local path grades it. It never calls `mutate`, and Again appends a copy. Review and Learn are unchanged, since the prop defaults to false.
- **`learn-session.tsx`:**
  - **Round counter:** a `round` counter. Each "Study all cards again" click starts a fresh practice `GradingSession` keyed `practice-{n}`.
  - **Where the Cards come from:** the Cards come from the existing `["flashcard", id]` query, enabled only when a run is asked for. It returns newest first, so the list is reversed for oldest-first order.
  - **Practice entries:** they use synthetic `practice:{cardId}:{direction}` ids, which only key the slots.
  - **End-state actions:** both end states (Learn complete and practice complete) show the same two secondary actions.
- **Space on the end-state buttons:** GradingSession's key handler ignores Space when no slot is current, so Space presses a focused end-state button natively.
- **Tests:** `tests/e2e/learn.spec.ts` has a new practice-run test, covering the order, Again repeat, zero POSTs, an unchanged Scheduling Record snapshot, a restart from Card 1, and the button not being the accent. The screenshot test also captures `learn-practice-*` and `learn-practice-complete-*` in both themes at 1280 and 390.
- **Verification:**
  - Typecheck and lint are clean.
  - Learn and Review e2e pass, 23/23.
  - I checked the screenshots: the restart button is the neutral secondary style, and the practice header uses the same body-sm secondary style as "Learning {Flashcard}".

## Review Triage Log

Layer: blind. Everything passed afterwards: typecheck, lint, 165 unit, 117 API and 112 e2e tests.

**Patched:**
- **The cards-load error had no way out (blind):** low, with a direct fix. Added "Back to {Flashcard}" beside Try again, which also covers a 404 from a Flashcard deleted mid-session.
- **Stale comments, and `practice` silently implying Again repeats (blind, two findings):** low. Updated the `Slot` and `GradingSession` JSDoc: practice slots, "Again always repeats", and the props being read once on mount (key to restart).
- **The zero-POST assertion could race a background POST (blind):** medium for the test's purpose. A 500ms settle now runs before asserting.
- **The card order was barely checked (blind):** low. The test now asserts the direction and prompt of every slot.
- **The usual entry point was untested (blind):** low. The idle-Flashcard test now starts a practice run.

**Rejected:**
- **An empty Flashcard says "You've gone through every card" (blind):** low and unlikely. The only way in is a hand-typed URL, since an empty Flashcard has no Learn button. The fix would add a branch.
- **A practice run may start from cached Cards (blind):** low. It snapshots the same `["flashcard", id]` data the detail page and viewer show, including saved edits. A mid-run refetch being ignored is the intended one-snapshot-per-session behavior, as in Review and Learn.
- **No focus move or announcement when a run starts (blind):** low. Learn and Review sessions don't manage focus on start either, and keys work at window level. An app-wide focus pattern belongs with Story 5.5 (accessibility pass).
- **Fake `ReviewQueueEntry` fields (blind):** low. Practice slots take the local path in `grade()` and never reach `mutate`. A separate type would add API surface for no current caller.
- **Remaining test ideas (blind):** low. Pressing Again twice on one entry is already covered by 4.8's full-session test. Clicking the back link adds nothing over its asserted href.
