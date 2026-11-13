---
title: 'Story 4.8: Learn Session'
type: 'feature'
created: '2026-11-13'
status: 'done'
baseline_commit: '3ecbef97ff0080d234aa38e818e02ba7815e2965'
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

**Problem:** New Cards never reach Review, because they stay Unlearned, and nothing exists yet that lets the user learn them (FR-17).

**Approach:**
- Add a primary "Learn" button under the card viewer. It starts a graded session for that Flashcard: first its Unlearned Cards (both directions), then its due records of learned Cards.
- The session runs on Review's session screen, keys, swipe and optimistic grade path.
- An entry graded Again is re-shown at the end of the session until it is graded Hard, Good or Easy. Only its first grade is saved.

**Decisions (agent, recorded):**
- **Counter:** "X / N". N includes the repeats added so far, so it grows when an entry is graded Again.
- **Counts:** `GET /api/flashcards/[id]` gains `learn: { newCards, due }`. These counts come from the same server helper that builds the Learn queue.
- **Header:** the session header reads "Learning {Flashcard}" and links back to the Flashcard.

## Boundaries & Constraints

**Always:**
- **Learn queue:** `GET /api/review/learn?flashcardId=`.
  - **Unlearned part:** first, the records with `firstGradedAt` null of the Flashcard's Unlearned Cards. Cards come oldest-created first (`createdAt asc, id asc`), each Card's two directions together, Term→Definition first.
  - **Due part:** then the Flashcard's due records of learned Cards (`learnedCardWhere`, `nextReviewDate <= now`), oldest-due first.
  - **Response:** `{ flashcard: {id,name}, counts: {newCards, due}, entries: ReviewQueueEntry[] }`. `newCards` counts Cards, not records.
  - **Errors:** Session required (401). `flashcardId` missing or blank → 400 `{ error }`. Not owned or not found → 404.
  - **Helper:** both "unlearned" and "learned" come from the AD-14 builders in `packages/domain/src/learned.ts`.
- **Grading:** grades go only through `POST /api/review/grade`.
  - **Again first:** if the first grade is Again, it is POSTed, and a practice copy is appended to the end of the session. Grading a practice copy never POSTs: Again appends another copy, and Hard, Good or Easy completes it.
  - **Other first grades:** a first grade of Hard, Good or Easy is POSTed and completes the entry.
  - **Rollback:** a failed POST rolls the entry back as the current card, removes its practice copies, and shows the existing error line.
  - **NOT_DUE:** a 409 NOT_DUE is dropped, as in Review.
- **Shared session:** extract Review's `Session` into one shared grading session.
  - It takes `entries`, a header, a finished state, and `repeatAgain: boolean`.
  - Review uses `repeatAgain=false`, and its behavior and DOM are unchanged.
  - Each slot has a unique key (record id, plus a repeat suffix), so a repeated card mounts unflipped.
- **Learn complete:** the calm line "Nothing left to learn in {Flashcard} right now." with a secondary link "Back to {Flashcard}". No confetti.
- **Flashcard detail:**
  - The Learn button sits centered, directly under the viewer's nav row, using `buttonPrimary`. It links to `/flashcards/{id}/learn`.
  - Its label is "Learn · N new · M due". Zero parts are left out, and it reads just "Learn" when nothing is waiting.
  - "Add cards" becomes `buttonSecondary` while the viewer shows. It stays primary on an empty Flashcard, where no viewer or Learn button shows.
- **Freshness:** the Learn session invalidates `["flashcard", id]` after grades settle, so the counts are current on return.
- **Visual:** UI conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

**Never:**
- No schema or migration change.
- No change to the grade route or the Review queue.
- No focus mode or sidebar hiding (4.5).
- No streak work: it is Epic 5, and it counts grades from this same route.
- No new dependencies.
- No practice repeat ever calls the grade route.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Order | 2 new Cards A (older), B; 1 learned Card due T→D | A T→D, A D→T, B T→D, B D→T, then learned record; counts {2,1} | N/A |
| Half-learned | Card with only T→D graded | Only its D→T entry; counts newCards 1 | N/A |
| Not due | Learned Card due tomorrow | Absent; due 0 | N/A |
| Again repeat | Grade A T→D Again, later Good on repeat | 1 POST (again); repeat shown at end; session completes; Card stays unlearned until D→T graded | N/A |
| Learned after Learn | Both directions graded | Card leaves Learn and appears in Review on its SM-2 due date | N/A |
| Empty | Nothing waiting | Button reads "Learn"; session shows Learn complete | N/A |
| Bad input | No flashcardId / other user's id | 400 / 404 | `{ error }` |
| Save fails | POST 500 on first Again | Entry back as current, its practice copy removed, error line | Rollback |

</frozen-after-approval>

## Code Map

- `apps/web/app/(shell)/review/review-session.tsx`:
  - `Session` (lines 154–309) is the session to extract: `live` ref, `update`, the `useMutation` with `onMutate` advance and `onError` rollback (it finds entries by `schedulingRecordId`, so this must switch to slot keys), keys, grade row, error line and counter.
  - `ReviewSession` keeps its query, loading and error states, `ScopeHeader` and the empty copy.
- `apps/web/app/(shell)/review/review-card.tsx`:
  - `ReviewCard` is reused unchanged.
  - Its overline already shows `flashcardName · direction`.
- `apps/web/app/api/review/queue/route.ts`:
  - Pattern to mirror: `requireSession`, Zod parse, `fail` / `ok`.
  - Reuse the exact `select` and the `ReviewQueueEntry` mapping.
  - Do not edit this file.
- `packages/domain/src/review.ts`:
  - Add `learnQueueQuerySchema` (`flashcardId` required, min 1).
  - Add `LearnCounts` and `LearnQueueResponse`.
  - Export them via `index.ts`.
- `packages/domain/src/learned.ts`: `learnedCardWhere` and `unlearnedCardWhere`.
- `packages/domain/src/cards.ts:120`: new records get `nextReviewDate` = the start of today's local day and `firstGradedAt` null. Unlearned records are therefore always due, so the grade route never sends 409 for them.
- `apps/web/app/api/flashcards/[id]/route.ts`:
  - Add `learn` to the response.
  - Add `learn` to `FlashcardCardsResponse` in `packages/domain/src/flashcards.ts`.
- `apps/web/app/(shell)/flashcards/[id]/flashcard-detail-view.tsx:135-153`:
  - Mount point of the viewer, and the "Add cards" button to demote.
  - The Learn button goes between the viewer and the Cards section, or inside `CardViewer` via a `footer` prop, whichever keeps it directly below the nav row.
- `apps/web/app/classes/ui.ts` (`buttonPrimary`, `buttonSecondary`) and `apps/web/app/components/ui.ts` (`linkClass`, `formErrorClass`).
- `apps/web/lib/query-provider.tsx`: default `staleTime` is 15s, so invalidate explicitly.
- Tests: `tests/api/review-queue.spec.ts` has the `newUser`, `addCard({learned})` and prisma helpers; `tests/e2e/review.spec.ts` and `tests/e2e/card-viewer.spec.ts` have the `register` / `seedCard` helpers.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/review.ts`, `flashcards.ts`, `index.ts`: add the Learn schema and types, plus the `learn` counts on `FlashcardCardsResponse`.
- [x] `tests/domain/review.test.ts`: test `learnQueueQuerySchema` (missing, blank and valid).
- [x] `apps/web/lib/learn-queue.ts` (new): `buildLearnQueue(userId, flashcardId, now)` and `countLearn(...)`, using Prisma and the AD-14 builders.
- [x] `apps/web/app/api/review/learn/route.ts` (new): the GET route.
- [x] `apps/web/app/api/flashcards/[id]/route.ts`: add `learn` counts.
- [x] `apps/web/app/(shell)/review/grading-session.tsx` (new), plus `review-session.tsx`: extract the shared session and add `repeatAgain`; Review renders through it.
- [x] `apps/web/app/(shell)/flashcards/[id]/learn/page.tsx` + `learn-session.tsx` (new):
  - query `["learn", id]`, with the same snapshot options as Review;
  - header, complete state, and loading, 404 and error states;
  - invalidate `["flashcard", id]`.
- [x] `flashcard-detail-view.tsx` (and `card-viewer.tsx` if a footer slot is used): the Learn button, its label, and the "Add cards" demotion.
- [x] `tests/api/review-learn.spec.ts`: cover every API matrix row, plus the counts on `GET /api/flashcards/[id]`.
- [x] `tests/e2e/learn.spec.ts`:
  - cover the button label, the full session with an Again repeat (assert the DB shows exactly one grade write per record), the complete state and its back link, and the keyboard;
  - add screenshots in both themes at 1280px and 390px.

**Acceptance Criteria:**
- Given the Review session after the refactor, when the existing `tests/e2e/review.spec.ts` and `tests/api/review-*.spec.ts` run, then they pass unchanged.
- Given Flashcard detail with Cards, when it renders, then Learn is the only accent element and "Add cards" is secondary.
- Given a Card created today, when both directions are graded in Learn, then it is absent from Review today and appears in Review when its SM-2 date comes due.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Pass 1. Layers: blind, edge, verification-gap, design-fidelity.

**Patch:**
- **No test for a late rollback (verification-gap, pre-verified; blind):** medium. The `onError` rebuild was only tested with an immediate failure, so a practice copy never sat in the graded region.
  - Added a `tests/e2e/learn.spec.ts` test. It holds the first Again POST, grades the other direction and the practice copy, then fails the held POST. It asserts the entry is restored unflipped at "2 / 2" with no practice copy, and that re-grading posts once. It passes.

**Defer:**
- **A permanent 404 on the grade route restores the slot forever (edge):** low. It predates this change: Review's rollback since 4.3 behaves the same. It happens when the Card is deleted in another tab. Logged in deferred-work.

**Rejected:**
- **The sidebar is not hidden during Learn, and the sidebar plus the answer give two accent elements (design-fidelity, two findings):** out of scope. The frozen Never says "No focus mode or sidebar hiding (4.5)", and Review has the same layout today.
- **A half-learned Card's graded direction is in neither queue (blind):** false. The epic context defines the Learn unlearned part as records with `firstGradedAt` null, and frozen matrix row "Half-learned" says only D→T is offered. That direction returns once the Card is learned.
- **NOT_DUE is silently dropped for future-dated unlearned records (blind):** low and unlikely. The only creation path, `createCardWithSchedulingRecords`, sets `nextReviewDate` to the start of the local day, so it is always due. The fix would add a guard.
- **`entrySelect` / `toEntry` duplicate the queue route (blind):** low. The spec forbids editing the queue route, and `ReviewQueueEntry` typing makes any new field a compile error in both places.
- **The button counts Cards while the counter counts records and grows (blind):** the spec decisions say so on purpose. Fixing it would mean editing the spec.
- **`counts` in `LearnQueueResponse` is unused by the client (blind):** the frozen Boundaries require it in the response. Fixing it would mean editing the spec.
- **The spec is missing from the diff (blind):** false. Planning artifacts are left out of the review diff on purpose.
- **Unit tests for `advance` and rollback (blind):** grouped with the patched gap above, which the new e2e test closes.
- **Nothing proves Review is unchanged (blind):** false. The unchanged `tests/e2e/review.spec.ts` covers the immediate failure, the 409, the keyboard, swipe and rapid input, and it passed (68/68, then 111/111 e2e).
- **The flashcard query is refetched once per graded record (blind):** false. `invalidateQueries` refetches only active queries, and the detail page is unmounted during Learn, so the query is only marked stale. Classes and folder views show no Learn counts.
- **`aria-keyshortcuts` lists only the digits (blind):** low. It predates this change: the markup moved unchanged from Review.
- **`countLearn` runs after the flashcard lookup (blind):** low. One extra round trip on detail load, and no budget applies to this page.
- **`learnQueueQuerySchema` has no max length (blind):** false as a defect. It matches `reviewQueueQuerySchema`'s id validation (min 1 only), and Prisma parameterizes the value.
- **"Learn" with nothing waiting opens an empty session (blind, edge):** false. Frozen matrix row "Empty" requires exactly this, and EXPERIENCE.md says "just 'Learn' when nothing waits".
- **Review grades leave the Flashcard counts stale (edge):** low and unlikely. It needs a cached detail query that is less than 15s old (staleTime) when the user returns after Review.
- **The label drifts while the page stays open past a due time (edge):** low and unlikely. The fix would add polling.
- **The "only accent element" claim ignores the SectionMarker (edge):** false. DESIGN.md sanctions the section marker as a non-actionable accent motif. The claim concerns actions.
- **`countLearn` and `buildLearnQueue` share no code path (edge):** low. Both use the same where builders and AD-14 predicates (Card count with `unlearnedCardWhere` equals the distinct cardIds of `unlearnedRecordWhere`), and the API test "match the Learn queue's counts" asserts they agree.

## Design Notes

**Repeat bookkeeping:** session slots are `{ entry, key, practice }`. On the first Again, `onMutate` advances and appends `{ entry, key: id#1, practice: true }`. Practice grades are handled locally, without calling `mutate`. `onError` locates the slot by `key`, re-inserts it at `index - 1`, and filters out later slots that have the same record id and `practice`.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test`: expected clean, all pass.
- `npm run test:api && npm run test:e2e` with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/training_sanctum_test` and `BETTER_AUTH_URL=http://localhost:3100`: expected all pass.

**Manual checks:**
- Screenshot Flashcard detail (Learn button) and the Learn session (card, grades, complete state) in both themes at 1280px and 390px.
