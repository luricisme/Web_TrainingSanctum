# Change request: Flashcard viewer + "Learn" entry, separate new-card learning from Review

- **Date:** 2026-11-13
- **Requested by:** product owner
- **Input for:** `bmad-correct-course`
- **Status:** proposed

## What the user wants

When the user opens a Flashcard, its page shows two new things.

1. **Card viewer.** One large card that shows the Flashcard's Cards one at a time.
   - Click/tap or Space flips the card between Term and Definition.
   - ← and → buttons, plus the arrow keys, move to the previous or next Card.
   - A mono "X / N" counter shows the position.
   - It shows **all** Cards of the Flashcard, whatever their schedule.
   - There is no grading, no shuffle and no autoplay. Viewing never changes scheduling (AD-4).
2. **"Learn" button below the viewer.** It starts a graded session (Again / Hard / Good / Easy) for that Flashcard. This is where a Card is first learned. Its grades decide when the Card later appears in the Review tab.

## Decision taken (option b)

New-card learning is **separate** from due-card review.

- **Review tab:**
  - The Review tab (the default due queue and scoped Class/Folder sessions) shows only Scheduling Records that are **due and have been graded at least once**.
  - A never-graded record is "not yet learned". It does not appear in Review.
- **Learn session:** the Learn session of a Flashcard shows that Flashcard's not-yet-learned records, and possibly its due records too (open question 2). It grades them through the existing single write path, `POST /api/review/grade`.
- **Viewer:** flipping in the viewer is **not** learning. Only a grade counts.

## Conflicts with current planning (to resolve)

- **UX decision.** The UX reconcile file says "Training Sanctum has exactly one review mode … no mode switcher" (`ux-designs/ux-Web_TrainingSanctum-2026-10-29/reconcile-quizlet-flashcard-view.md`, "Deliberately NOT taken"). This request adds a non-graded viewer and a Learn entry. Update EXPERIENCE.md, DESIGN.md (viewer component) and the reconcile note.
- **PRD.**
  - UJ-2 and FR-9/FR-10 describe one daily due-queue session in which new cards appear capped at 20/day.
  - FR-10 (daily new-card cap) needs to be redefined or dropped. New cards no longer enter Review automatically.
  - A new FR is needed for the viewer and Learn.
  - The PRD §2.2/§5 non-goals (Quizlet Test mode, Match game) stay excluded.
- **Story 4.3 (built, on branch `story/4.3-due-queue-review-session-keyboard-first`, not yet merged).**
  - The queue query must exclude never-graded records for the Review tab.
  - "Review this flashcard" becomes, or is replaced by, Learn.
  - Decide whether "Review this class / folder" stay as they are (due-only, learned-only).
- **Story 4.4 (backlog).** The daily new-card cap: redefine it as a cap on the Learn session, or remove it.
- **Story 4.5 (backlog).** The Empty due-queue state currently offers "+ Add card". With option b it probably should point to Flashcards that have unlearned Cards.
- **Epic 5.** Streak (5.1) must decide whether Learn grades count toward the streak. They go through the same grade route, so by default they would. Stats (5.4) may want a "learned / not yet learned" count.
- **Data.**
  - "Never graded" today is only a convention (`interval === 0`, see the deferred-work entry from spec-4-1).
  - Option b makes it a core rule. Decide whether a convention is enough or whether to add an explicit marker such as `firstGradedAt`, which would need a migration.

## Decisions (product owner: "base it on Quizlet")

The model follows Quizlet's set page. A Flashcards viewer sits on top of the set, the term list is below it, and Learn is a graded mode that tracks each term's progress. Training Sanctum keeps its own visual system (DESIGN.md tokens). Only the interaction pattern is borrowed, not Quizlet's look or branding. Quizlet's social and gamified modes (Test, Match, live games, Study with Friends) remain non-goals.

1. **Learned is tracked per Card, like a Quizlet term.**
   - The Learn session presents both Recall Directions of each unlearned Card.
   - A Card counts as **learned** once both of its Scheduling Records have been graded at least once.
   - Each record keeps its own SM-2 schedule, so direction independence is unchanged.
   - The Review tab shows due records of learned Cards only.
2. **Learn covers the whole Flashcard, like Quizlet Learn on a set.**
   - The session shows the Flashcard's unlearned Cards first, then the Flashcard's due records.
   - Every grade goes through `POST /api/review/grade`.
3. **Existing never-graded Cards become "not yet learned".** They leave Review, which matches Quizlet's "not studied" terms. This is accepted.
4. **When Learn has nothing left:**
   - It shows a calm completion line and a way back to the Flashcard page and its viewer.
   - There is no confetti and no cheer copy (PRD §7).
5. **Viewer placement and keys:**
   - The viewer sits at the top of the Flashcard page, above the Cards list (Quizlet: study card on top, term list below).
   - ← and → move between Cards.
   - Space or click/tap flips the card.
   - Keys are ignored while focus is in a field or a panel/modal is open, and Space never scrolls the page.
   - The "Learn" button sits directly below the viewer as the page's one accent (primary) action.
6. **Daily new-card cap (FR-10 / Story 4.4):** Quizlet has no daily cap, so FR-10 is dropped and Story 4.4 is removed. **Flag:** this reverses a PRD in-scope item. correct-course must confirm it with the product owner.
7. **Streak (FR-12):** any grade counts toward the day's streak, Learn grades included, because they share the one grade route.
8. **Empty Review state (Story 4.5):** "+ Add card" is replaced by a pointer to Flashcards that still have unlearned Cards. If none exist, it shows "+ Add card".
9. **Data:** "learned" must not rest on the `interval === 0` convention. Add an explicit `SchedulingRecord.firstGradedAt` (nullable), set only by the grade route.
   - This needs one migration, with a backfill of `firstGradedAt = updatedAt` where `interval > 0`.

## Open questions for correct-course (answered above, kept for traceability)

1. **Per record or per Card.** Is a Card "learned" per Scheduling Record, so one direction can be learned and the other not? Or per Card, so it counts as learned once either direction (or both) is graded?
2. **Contents of Learn.** Does Learn on a Flashcard show only unlearned records, or unlearned plus that Flashcard's due records?
3. **Existing users.** After the change, Cards created before it but never graded become "unlearned" and disappear from Review. Is that acceptable?
4. **Learn when finished.** What does Learn show when a Flashcard has nothing left to learn: an empty state, or the viewer only?
5. **Placement and keys.**
   - Viewer placement on the Flashcard page: above the Cards list, or replacing the top of the page?
   - Keyboard: while the viewer is focused, ← and → are free, but Space would conflict with page scroll.
