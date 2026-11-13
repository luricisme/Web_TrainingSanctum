# Epic 4 Context: Spaced Repetition Review Engine

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give the user a fast, keyboard-first daily study loop that is mathematically correct: due Scheduling Records are shown one at a time per Recall Direction, graded with a single keystroke, and rescheduled by classical SM-2, inside a distraction-free focus mode. New Cards are never pushed into Review automatically. The user meets them on purpose: first by flipping through a Flashcard's Cards in a non-graded card viewer, then by grading them in a per-Flashcard Learn session. Review only brings back Cards already learned. This is the product's highest-frequency interaction and the core of the daily-habit goal. A Sprint Change on 2026-11-13 removed the daily new-card cap (Story 4.4 is retired and its number is not reused), added the learned/unlearned model, and added the viewer and Learn.

## Stories

- Story 4.1: SM-2 Scheduling Engine
- Story 4.2: Grade a Card & Persist Scheduling Update
- Story 4.3: Due-Queue Review Session (keyboard-first)
- Story 4.4: REMOVED (daily new-card batch cap retired)
- Story 4.5: Focus Mode
- Story 4.6: Learned Marker & Learned-Only Review Queue
- Story 4.7: Flashcard Card Viewer
- Story 4.8: Learn Session

## Requirements & Constraints

- **SM-2 per direction:** new records start at `ease_factor = 2.5`, `repetitions = 0`. Learning steps are 1 day, then 6 days, then `round(prev_interval × prev_EF)`. Again resets `repetitions` to 0 and interval to 1 and leaves EF unchanged. EF floors at 1.3. At equal repetitions, Hard, Good and Easy give the same next interval and differ only in EF. Grades map to quality as Again=1, Hard=3, Good=4, Easy=5. Grading one direction never touches the other. The PRD addendum's worked fixtures must pass as exact-match tests.
- **Learned / unlearned:** a Card is learned once both of its records have been graded at least once (`firstGradedAt` set). A Card that an Again grade sends back to `repetitions = 0` stays learned. Unlearned Cards never appear in Review, even when their records are due.
- **Review queue:** due records of learned Cards only, one entry per direction (a Card due both ways is two independent entries), oldest-due-first. The default scope is all Classes. Optional Class or Folder scope ("Review this class/folder") behaves the same, and its grades count toward the same streak. Flashcard scope is gone: `?flashcardId=` on the queue route returns 400.
- **Learn queue (per Flashcard):** first the unlearned Cards' records that have `firstGradedAt` null (Cards in creation order, each Card's two directions together, Term→Definition first), then that Flashcard's due records of learned Cards, oldest-due-first. The response includes counts `{ newCards, due }`. 401/400/404 behave as on the queue route. Learn grades use the same grade route and count toward the streak. **Repeat until correct:** an entry graded Again goes back to the end of the Learn session and is shown again until it is graded Hard, Good or Easy. Only its first grade is POSTed and that grade sets the SM-2 schedule. The repeats are client-side practice and never call the grade route, so the not-due 409 is never triggered. Review does not repeat entries.
- **Card viewer:** shows every Card in list order, whatever its scheduling state, with no grading, shuffle, autoplay or wrap-around. Viewing never changes a Scheduling Record. It is hidden on an empty Flashcard.
- **Keyboard:** Space or click flips either way. 1–4 or J/K/L/; grade once the answer has been shown, and grading stays available after flipping back. In the viewer, ← / → move between Cards. Keys are ignored while focus is in a field or a panel/modal is open, and Space never scrolls the page. No mouse is needed anywhere in the loop.
- **Performance:** grade→next-card transition must feel sub-100ms under rapid input. App open → due-queue paint must take at most 200ms (cold serverless start excluded).
- **Concurrency:** multi-device last-write-wins on Scheduling Records is acceptable. No locking.
- **Success criteria for the learned model:** API and e2e tests prove Review never shows a record of an Unlearned Card. A Card created today stays out of Review until both directions are graded in Learn, and then it appears on its SM-2 due date. A test verifies the backfill keeps every Card graded before the migration learned. The viewer never changes scheduling. All three suites (unit, API, e2e) pass.

## Technical Decisions

- **Domain isolation:** `packages/domain/sm2.ts` (`applyGrade`) is pure, with no next/react/prisma/HTTP imports, and is reachable only from `app/api/**`. It is unit-tested with Vitest and no DB, network or browser.
- **Single SM-2 write path:** only `POST /api/review/grade` (and later `POST /api/restore`) may write `interval`, `repetitions`, `ease_factor`, `next_review_date` and `first_graded_at`. The grade route loads state, calls `applyGrade` and persists inside one Prisma `$transaction`. It sets `first_graded_at = now` only when the field is null and never changes it after that. It logs a structured single-line summary.
- **AD-14 learned predicate:** it lives once in `packages/domain` as Prisma-`where`-shaped builders (`learnedCardWhere` / `unlearnedCardWhere`): plain objects with no DB import. It is unit-tested and used by `GET /api/review/queue`, `GET /api/review/learn` and later `GET /api/stats`. Never derive "learned" from `interval === 0`, `repetitions`, or the existence of any grade. This replaces the old "never graded = interval 0" convention.
- **Schema:** add `SchedulingRecord.firstGradedAt DateTime?` (UTC) through a Prisma migration in `packages/db`. The migration backfills `firstGradedAt = updatedAt` where `interval > 0`, which is safe because `applyGrade` never returns interval 0. Each Card has exactly two records (unique `(cardId, direction)`).
- **Card creation:** `createCardWithSchedulingRecords` stays the only creation path. It now also sets `first_graded_at = null`, so every new Card starts unlearned.
- **Local day:** due filtering converts UTC now to `User.timezone` through `toLocalCalendarDay`. This is the same helper that Epic 5's streak attribution uses.
- **Routes:** `api/review/queue` (`?classId=` / `?folderId=`), `api/review/learn` (`?flashcardId=` required), `api/review/grade`. Pages are `(routes)/review` and `(routes)/flashcards/[id]/learn`. The viewer on `(routes)/flashcards/[id]` reads the existing `GET api/flashcards/[id]`.
- **Conventions:** every handler validates its input with Zod first, responds `{ data }`, and returns errors as `{ error: { code, message, fields?|details? } }`. A Better Auth session is required, otherwise the response is 401.
- **Client flow:** Review and Learn share one session component that uses TanStack Query optimistic updates. It advances immediately, POSTs the grade in the background, and rolls back and shows an error only on failure. No other screen uses this pattern.

## UX & Interaction Patterns

- **Review card:** a large `rounded.lg` surface, at most 640px wide, `elevation.medium`. Its bounds stay fixed between sides, and it flips with a 520ms ease-out 3D Y-axis flip (not a content swap). It has no icon row in v1. It is shared by Review, Learn and the viewer, and the next Card always shows on its prompt side.
- **Grade buttons:** sit below the card. They appear after the first flip and stay until the entry is graded. Each is labelled with its shortcut. Again uses the error color (never the accent). Hard, Good and Easy carry equal visual weight, and no UI may imply that Hard shortens the interval. The row wraps below 640px.
- **Mobile:** in sessions, tap flips and a swipe in any of the four directions grades, alongside the buttons' own tap targets. In the viewer, tap flips and a horizontal swipe moves ← / →.
- **Focus mode:** the sidebar, streak badge and all other chrome are hidden entirely during Review and Learn and come back on exit. The session header names the scope or Flashcard.
- **Card viewer:** sits at the top of Flashcard detail. Below it, outline circular ← / → buttons (neutral, never the accent; 0.4 opacity when disabled) flank a mono "X / N" counter. The primary "Learn" button sits directly below and is the page's only accent element. "Add cards" becomes secondary.
- **Learn button label:** "Learn · 12 new · 3 due". Parts that are zero are left out, and it reads just "Learn" when nothing is waiting.
- **Learn complete:** "Nothing left to learn in {Flashcard} right now." with a link back. No confetti.
- **Empty due queue:** shows a prominent streak count and a calm line. Below that it lists up to 3 Flashcards that have Unlearned Cards ("Weather idioms · 12 new", linking to each page), or, when none exist, a primary "+ Add card" button that opens Manual mode for the last-used Flashcard. It is never a bare message. In a scoped review the empty state names the scope.
- **Voice:** direct and calm. No cheerleading, no emoji and no gamified grading feedback.

## Cross-Story Dependencies

- Build order: merge 4.3, then 4.6 → 4.7 → 4.8 → 4.5, then Epic 5.
- 4.6 changes 4.3's queue (filter to learned Cards, drop flashcard scope, remove "Review this flashcard"), the 4.2 grade route (set `firstGradedAt`) and Epic 2's card-creation function.
- 4.8 reuses 4.3's session screen, keyboard, swipe, optimistic grade and 409 handling, and depends on the 4.6 predicate. 4.7 provides the viewer that the Learn button sits under.
- 4.5 covers both Review and Learn, and its empty state needs the 4.6 unlearned query.
- Epic 5 depends on this epic: the streak reuses `toLocalCalendarDay` and counts Learn grades, export/restore carry `firstGradedAt`, and Stats shows learned/unlearned totals through the AD-14 predicate.
