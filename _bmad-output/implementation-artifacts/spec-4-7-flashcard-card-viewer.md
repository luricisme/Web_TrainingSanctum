---
title: 'Story 4.7: Flashcard Card Viewer'
type: 'feature'
created: '2026-11-13'
status: 'done'
baseline_commit: '13293748c27f791d3c1b134244c8d09143f025c2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/history/focus-indigo/working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A Flashcard page lists its Cards, but you can't flip through them to get familiar with them before you're graded (FR-16).

**Approach:** Add a non-graded card viewer at the top of Flashcard detail. It uses the same flip card as Review (DESIGN.md `components.card-viewer`). It shows one Card at a time, Term side first, in list order. Space or click flips it. ← / → (keys, buttons or a horizontal swipe) move between Cards, with no wrap. It reads only the already-loaded `GET /api/flashcards/[id]` data and never touches scheduling.

**Decisions (human, 2026-11-13):**
- **Learn button deferred to 4.8.** 4.7 ships the viewer only. "Add cards" stays `buttonPrimary`, the page's one accent action. 4.8 adds the primary "Learn" button below the viewer and demotes "Add cards" to secondary.
- **Spec size:** kept whole at about 1,900 tokens, by user choice.

## Boundaries & Constraints

**Always:**
- **Shared flip card:** the flip surface is shared, not duplicated.
  - Extract the faces, flip and fixed-bounds grid from `ReviewCard` into one presentational flip card.
  - The faces arrive as props, and pointer and click handlers are passed through.
  - `ReviewCard` (Review) and the viewer both render it. Review's look and behavior must not change.
- **Card faces:**
  - Front: overline "Term", then the term in the `display` role.
  - Back: overline "Definition", then the definition in `heading-1` **foreground (not accent)**. Below it, `body-sm` tertiary shows part of speech, example and context when they are present.
  - The accent is reserved for the page's one primary action.
- **Navigation:**
  - The order is the order of the Cards list (`cards` array).
  - Moving shows the new Card Term side up, with no reverse animation: key the card by Card id.
  - ← is disabled on Card 1 and → on Card N.
  - The counter is mono "X / N", centered between outline circular arrow buttons (`rounded-full`, `border`, neutral). A disabled arrow sits at `opacity-40`.
  - Every control has a visible `focus-ring`, and the arrows have aria-labels ("Previous card" / "Next card").
- **Keys:** a `window` keydown listener handles Space (flip; `preventDefault` so the page never scrolls) and ArrowLeft / ArrowRight. It ignores:
  - a held modifier;
  - focus in a text field (reuse the `isTextField` logic, moved to a shared helper);
  - any open modal or panel (Add cards, Edit, Delete);
  - `event.repeat` for Space.
- **Mobile:** a touch or pen swipe of 48px or more on the horizontal dominant axis moves the viewer: left → next, right → previous. A mouse drag never moves it, and tap still flips.
- **List changes:** when the Cards list changes (add, edit, delete), the viewer clamps its index into range. Edited text shows immediately.
- **Empty Flashcard:** the viewer is not rendered, and the existing empty state shows.
- **Visual:** UI conforms to DESIGN.md tokens and the Design DNA `design_style`, and passes the anti-generic UI rules. It is checked against a screenshot in both dark and light themes.

**Never:**
- No grading, shuffle, autoplay or wrap-around.
- No API, schema or Scheduling Record change.
- No Learn button, route or session (4.8).
- "Add cards" is not demoted to secondary yet (4.8).
- No new dependencies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open | Flashcard with 3 Cards | Viewer shows list Card 1, Term side, "1 / 3"; ← disabled | N/A |
| Flip | Space or click | Card flips to Definition; Space again flips back; page does not scroll | N/A |
| Move | → on 1 / 3 | Card 2, Term side, "2 / 3" | N/A |
| Last | → on 3 / 3 | → disabled; key does nothing | N/A |
| Typing | Add cards panel open, press → or Space | Viewer unchanged | N/A |
| Delete current last | On 3 / 3, delete that Card | Viewer shows 2 / 2 | N/A |
| Empty | 0 Cards | No viewer; empty state shown | N/A |
| Viewing | Any flips and moves | Scheduling Records unchanged | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/app/(shell)/review/review-card.tsx` -- flip surface to extract: `faceClass`, the `perspective-review` / `review-flip` / `rotate-y-180` / `backface-hidden` utilities from `globals.css`, the one-grid-cell faces, and the swipe pointer logic (`SWIPE_MIN_PX = 48`, touch and pen only).
  - `ReviewCard` keeps its grade-swipe mapping and its accent answer.
- `apps/web/app/(shell)/review/review-session.tsx:58` -- `isTextField`. Move it to a shared module (e.g. `apps/web/lib/keyboard.ts`) and import it in both places. Lines 237–254 are the window keydown pattern to mirror.
- `apps/web/app/(shell)/flashcards/[id]/flashcard-detail-view.tsx` -- the page.
  - Insert the viewer between `PageHeader` and the Cards `<section>`, only when `cards.length > 0`.
  - The `adding`, `editing` and `deleting` state flags tell the viewer to ignore keys.
  - `cards` comes from the React Query `["flashcard", id]` cache, so edits and deletes flow in.
- `apps/web/app/api/flashcards/[id]/route.ts:49` -- list order is `createdAt desc, id desc`. The viewer follows it, so make no change.
- `packages/domain/src/cards.ts:144` -- `CardSummary`: term, definition, example, context, partOfSpeech.
- `apps/web/app/components/ui.ts` -- `overlineClass`. `classes/ui.ts` has `buttonPrimary` and `buttonSecondary`.
- `tests/e2e/review.spec.ts` -- `register` / `seedCard` helpers to copy. Its flip, keyboard and swipe tests guard the Review refactor.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/app/components/flip-card.tsx` (new) + `apps/web/app/(shell)/review/review-card.tsx` -- extract the shared flip card and rebuild `ReviewCard` on it, with identical DOM and classes for Review.
- [x] `apps/web/lib/keyboard.ts` (new) + `review-session.tsx` -- move `isTextField` and import it.
- [x] `apps/web/app/(shell)/flashcards/[id]/card-viewer.tsx` (new) -- the viewer: index, flipped state, keys, swipe, nav row and counter.
- [x] `apps/web/app/(shell)/flashcards/[id]/flashcard-detail-view.tsx` -- mount the viewer and pass `cards` plus `inactive = adding || !!editing || !!deleting`.
- [x] `tests/e2e/card-viewer.spec.ts` -- cover every matrix row.
  - For Viewing, snapshot the DB scheduling rows before and after flips and moves.
  - Also cover: click flips; the arrow buttons; a touch swipe via `dispatchEvent` pointer events (as in `review.spec.ts`); a mouse drag doesn't move.

**Acceptance Criteria:**
- Given the Review session, when it runs after the refactor, then every existing `tests/e2e/review.spec.ts` test passes unchanged.
- Given any viewer control, when focused by keyboard, then a visible focus ring shows.
- Given both themes at 1280px and 390px, when the viewer's front, back and last-card states are screenshotted, then they conform to DESIGN.md `components.card-viewer` and the anti-generic rules, and the viewer adds no accent color.

## Spec Change Log

## Review Triage Log

Pass 1. Layers: blind, edge, verification-gap, design-fidelity. The design-fidelity layer found nothing.

**Patch:**
- **Space takes over focused controls (blind, edge, verification-gap other):** medium. The window handler `preventDefault`s Space and flips the viewer even when focus is on Add cards, Edit or Delete card N, or the arrow buttons, so those can't be pressed with Space. The fix: skip interactive targets other than the flip card.
- **Focus is lost when an arrow key reaches either end (blind, edge):** low. The rescue only ran in `onClick`, so it is moved into `move()`.
- **A swipe at either end swallows the next tap (blind, edge):** low. `onSwipe` returned true when nothing moved, which left `swiped` set. The fix: return whether `move()` actually moved.
- **Test gaps (verification-gap, pre-verified):** id-following on add, the Edit and Delete modal key gate, the arrow focus handoff, and Review's swipe before reveal. A Space-on-a-focused-button test is added too.

**Rejected:**
- **Space doesn't scroll even when the viewer is off screen (blind):** low. The frozen Boundaries require "the page never scrolls"; changing that would edit the spec.
- **Pointer input while a modal is open (edge):** false. The Add, Edit and Delete overlays are native modal `<dialog>`s, which make the page behind them inert.
- **A trailing click after a mid-list swipe (edge):** maybe-false, low. This matches 4.3's triage: the key remount removes the old node before any click.
- **Stale clamp index after an add and then a delete (blind):** low and unlikely. It needs an add, then a delete of the viewed Card.
- **`defaultPrevented` is ignored (blind):** low. Nothing on the page consumes keys today.
- **The counter reads "1 slash 3" to screen readers (blind):** low. The same pattern was accepted in 4.3.
- **Screenshot tests assert nothing, and the theme switches after load (blind):** low. They produce the evidence for the visual AC.
- **Long selectors repeated in older tests (blind):** low. Lint passes.
- **Back-face details have no labels (blind):** false as a defect. The frozen card faces match Review's.
- **The spec is missing from the diff (blind):** false. Planning artifacts are left out of the diff on purpose, and the Review tests were run unchanged (45 passed).

## Design Notes

**Why the back face isn't accent here:** in Review the accent answer is the screen's focal element. On Flashcard detail, DESIGN.md makes the primary action the one accent element while the viewer shows, so the viewer stays neutral.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: clean, all pass.
- `npm run test:e2e` with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/training_sanctum_test` and `BETTER_AUTH_URL=http://localhost:3100` -- expected: all pass, including the unchanged Review tests.

**Manual checks:**
- Screenshot the Flashcard page with the viewer (front, back, last card) in dark and light themes, at 1280px and at 390px width.
