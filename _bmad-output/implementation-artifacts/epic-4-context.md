# Epic 4 Context: Spaced Repetition Review Engine

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give the user a daily, keyboard-first review session that is the product's core habit loop and its algorithmic showpiece. Due Scheduling Records are shown one at a time, per Recall Direction (a Card has two: Term→Definition and Definition→Term). The user grades each one with a single keystroke, and the record is rescheduled by a pure, exactly-tested classical SM-2 engine (not an Anki variant). The session must feel instant (no perceptible lag under rapid input), must cap how many new Cards are introduced per day without ever holding back already-due Cards, and must hide all chrome while it runs (focus mode). If review is slow, distracting or scheduled wrongly, the user skips days and the product fails its main test of still being used 60 days later.

## Stories

- Story 4.1: SM-2 Scheduling Engine
- Story 4.2: Grade a Card & Persist Scheduling Update
- Story 4.3: Due-Queue Review Session (keyboard-first)
- Story 4.4: Daily New-Card Batch Cap
- Story 4.5: Focus Mode

## Requirements & Constraints

- **Classical SM-2 (binding):** grade-to-quality mapping is fixed at Again=1, Hard=3, Good=4, Easy=5.
  - Pass (q ∈ {3,4,5}): `repetitions += 1`. `EF' = EF + (0.1 − (5−q) × (0.08 + (5−q) × 0.02))`, floored at 1.3. The interval depends on `repetitions` *before* the increment: 1st = 1 day, 2nd = 6 days, 3rd and later = `round(previous_interval × previous_EF)`, using the EF from before this update.
  - Again (q=1): `repetitions = 0` and `interval = 1`. `ease_factor` is **not changed at all**.
  - At equal `repetitions`, Hard, Good and Easy give the same next interval and differ only in the resulting EF.
  - New-record defaults are `ease_factor = 2.5` and `repetitions = 0`.
- **Binding test fixtures.** Each must pass as an exact-match unit test:
  - Sequence A, Good, Good, Hard, Again: intervals 1 → 6 → 15 → 1, EF 2.5 → 2.5 → 2.36 → 2.36 (unchanged by Again).
  - Sequence B, Good, Easy, Easy: intervals 1 → 6 → 16, EF 2.5 → 2.6 → 2.7.
  - The checklist also needs a dedicated test for each of these: interval reset on Again, EF floor under repeated low grades, EF unchanged on Again, identical Hard/Good/Easy intervals, dual-direction independence, and the grade-to-quality mapping. Passing this checklist is the goal, not a coverage percentage.
- **Direction independence:** grading one direction never changes the other direction's record. A Card due in both directions appears as two separate queue entries that can be graded in any order.
- **Queue:**
  - The queue holds due Scheduling Records, ordered oldest-due-first (`next_review_date` ascending). No other ordering or interleaving rule is required.
  - The default scope is all Classes. A session can be scoped to one Class, one Folder (all Cards under it) or one Flashcard. Scoped sessions follow every other rule, and their grades count toward the same streak.
- **Daily new-card cap:**
  - The default is 20, and the user can change it in Settings.
  - It counts Cards, not Scheduling Records, so one New Card counts as 1 even though it produces 2 entries.
  - A New Card is one where neither of its records has ever been graded. A Card that "Again" reset to `repetitions = 0` is not new: it is uncapped.
  - Already-due Cards are never withheld. When the cap is reached, the session simply continues with due Cards only, with no blocking message.
- **Keyboard:** Space reveals the answer, and 1–4 or J/K/L/; grade (Again/Hard/Good/Easy). Nothing in the loop requires a mouse.
- **Performance:**
  - Grade → next card: under 100 ms perceived.
  - App open → due queue painted: 200 ms, measured from navigation start and excluding a cold serverless start.
- **Concurrency:** last write wins on a Scheduling Record across devices. No locking or conflict UI.
- **Non-goal:** no manual editing of interval, EF or due date, and no "reset progress" action. Scheduling state changes only through grading.

## Technical Decisions

- **Domain engine:** `applyGrade` lives in `packages/domain` (sm2 module). It is a pure function of the current state plus the grade, with no next, react, Prisma or HTTP imports. Vitest unit tests for it need no DB, network or browser.
- **Single write path (AD-4):** only `POST /api/review/grade` (and, later, the Epic 5 restore route) may write `interval`, `repetitions`, `ease_factor` or `next_review_date`. The grade route loads the current state, calls `applyGrade`, and persists the result inside one Prisma `$transaction`. No other code computes these values.
- **Due queue:** `GET /api/review/queue` takes an optional `?classId=`, `?folderId=` or `?flashcardId=`. Due filtering converts UTC "now" to `User.timezone` through the shared `toLocalCalendarDay` helper. Never use a raw client `Date` or the server's local time. Streak attribution in Epic 5 must use the same clock.
- **Client flow (AD-7):** the review screen uses TanStack Query optimistic updates. Grading advances locally at once, POSTs the grade in the background, and on failure rolls back and shows the error. Only this screen uses the pattern.
- **Conventions:**
  - Validate the body and query with Zod before calling domain or db code.
  - Authenticate with the Better Auth session cookie. A missing session gets 401 plus the error envelope.
  - Scope all data to `userId`.
  - Success responses are `{ data: T }`. Errors are `{ error: { code, message, fields?, details? } }`.
  - Use only routes under `app/api/**`. No Server Actions.
- **Observability:** the grade write logs one structured line (operation, record counts, outcome) on success and on failure.
- **Data:** each `SchedulingRecord` has a unique `(cardId, direction)`, and timestamps are stored in UTC. Storing the daily new-card limit needs a per-user setting. Planning does not specify how that setting is stored.
- **Tests:**
  - Vitest for the engine.
  - Playwright API tests for the grade and queue endpoints, including the auth and validation rejections.
  - Playwright E2E for the keyboard review loop.

## UX & Interaction Patterns

- **Review card:**
  - Large, `rounded.lg`, centered and capped at 640px wide at every screen size.
  - Its bounds stay fixed between the prompt and the answer.
  - Click, tap or Space triggers a 3D Y-axis flip (520 ms, ease-out). It is never a content swap.
  - Grading resets the card to the unflipped prompt for the next entry.
  - The top-right pin/audio/star icon row is inert.
- **Grade buttons:**
  - They appear only after the flip, and each shows its keyboard shortcut.
  - Again uses the `error` color, never the accent.
  - Hard, Good and Easy have **equal visual weight**. No affordance may suggest that Hard shortens the next interval.
- **Progress counter:** mono-font "X / Y" beneath the card. The session header names the scope when a session is scoped.
- **Mobile (<640px):** tap flips the card, and swiping left, right, up or down maps to the four grades. Swipe is added on top of the grade buttons' tap targets, not instead of them. The grade-button row wraps.
- **Focus mode:** during a session the sidebar, nav, streak badge and other chrome are hidden entirely, not minimized. They come back when the queue clears or the user navigates away.
- **Empty due-queue state:**
  - Centered and shown in place of the review card.
  - Shows the streak count prominently (mono) with a calm line ("You're all caught up — nothing is due for review right now.").
  - Has a primary "+ Add card" button that opens Manual mode for the last-used Flashcard, with a Flashcard picker.
  - In a scoped session it names the scope.
  - It is never a bare message and never falls through to Classes.
- **Entry points:**
  - Review is the default landing page when cards are due.
  - "Review this class", "Review this folder" and "Review this flashcard" are on the Class, Folder and Flashcard detail pages.
  - The daily limit is set in Settings.
- **No gamification:** no confetti, badges, sounds or cheerleading copy. Every element needs a visible focus ring.

## Cross-Story Dependencies

- **4.1 is the base:** 4.2 calls `applyGrade`, and 4.3 depends on 4.2's grade endpoint for its optimistic POST. 4.4 changes the queue query from 4.3 and adds a Settings control. 4.5 wraps the 4.3 session screen and adds the Empty due-queue state.
- **Builds on Epics 1–3:**
  - Every Card already gets two Scheduling Records from `createCardWithSchedulingRecords`, with `next_review_date` = start of today in the user's local time, so new Cards are due immediately.
  - `User.timezone` and `toLocalCalendarDay` already exist and must be reused, not duplicated.
  - The sidebar shell from Epic 1 needs the review-mode hide logic added here.
  - The Flashcard level from Story 2.7 is what makes the flashcard scope possible.
- **Feeds Epic 5:**
  - Streak tracking attributes graded records to local days with the same `toLocalCalendarDay` clock.
  - Restore is the only other writer of the scheduling fields.
  - Stats reads the intervals that grading produces.
