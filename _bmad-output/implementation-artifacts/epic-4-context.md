# Epic 4 Context: Spaced Repetition Review Engine

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give the user a fast, keyboard-first daily study loop that is mathematically correct: due Scheduling Records are shown one at a time per Recall Direction, graded with a single keystroke, and rescheduled by classical SM-2, inside a distraction-free focus mode. New Cards are never pushed into Review automatically; the user meets them on purpose, first in a non-graded card viewer on the Flashcard page, then in a graded per-Flashcard Learn session. The user also chooses which Recall Directions they study (Both by default, or one only), and "learned" is tracked per direction, so a graded direction joins Review without waiting for the other. This is the product's highest-frequency interaction and the core of the daily-habit goal. Sprint Change 2026-11-13 retired the daily new-card cap (4.4, number not reused) and added the learned model, viewer and Learn; Sprint Change 2026-11-13b added the study-directions setting and made "learned" per direction (Story 4.9).

## Stories

- Story 4.1: SM-2 Scheduling Engine
- Story 4.2: Grade a Card & Persist Scheduling Update
- Story 4.3: Due-Queue Review Session (keyboard-first)
- Story 4.4: REMOVED (daily new-card batch cap retired)
- Story 4.5: Focus Mode
- Story 4.6: Learned Marker & Learned-Only Review Queue
- Story 4.7: Flashcard Card Viewer
- Story 4.8: Learn Session (plus 4.8b "Study all cards again" practice run)
- Story 4.9: Study Directions Setting & Per-Direction Learned Model

## Requirements & Constraints

- **SM-2 per direction:** new records start at EF 2.5, repetitions 0. Intervals 1, 6, then `round(prev_interval × prev_EF)`. Again resets repetitions to 0 and interval to 1, EF unchanged. EF floor 1.3. Hard/Good/Easy give the same next interval at equal repetitions, differing only in EF. Quality map Again=1, Hard=3, Good=4, Easy=5. Grading one direction never touches the other. The PRD addendum fixtures pass as exact-match tests.
- **Study directions (per account):** Both (default), Term → Definition only, Definition → Term only. Applies to Learn, Review, the Learn practice run and the card viewer. New and existing accounts start on Both. Turning a direction off changes no record; it simply appears nowhere. Turning it on sends its unlearned records to Learn and its learned, due records to Review (possibly many at once); no Card ever leaves Review on a switch. A change takes effect at the next queue load; a running session keeps its snapshot.
- **Learned is per record (direction):** a Scheduling Record is learned once `firstGradedAt` is set; Again back to repetitions 0 stays learned. A Card is "unlearned" (for counts/Stats only) when it has at least one unlearned record in a studied direction. A graded direction joins Review on its due date regardless of the other direction's state.
- **Review queue:** learned, due records in studied directions only, one entry per direction, oldest-due-first. Default scope all Classes; optional `?classId=` / `?folderId=` scope; `?flashcardId=` returns 400. Grades count toward the same streak.
- **Learn queue (per Flashcard):** unlearned records in studied directions first (Cards in creation order, each Card's studied directions together, Term → Definition first), then the Flashcard's learned, due records in studied directions, oldest-due-first. Counts `{ newCards, due }` cover studied directions only. Repeat-until-correct: an Again entry returns at the end until graded Hard/Good/Easy; only its first grade is POSTed, repeats never POST (no 409). "Study all cards again" (4.8b) runs every Card in studied directions as unsaved practice: same keys and Again repeats, nothing persisted.
- **Prompt side:** the card viewer and the practice run show Definition first only when just Definition → Term is studied; otherwise Term first.
- **Card viewer:** every Card in list order, no grading/shuffle/autoplay/wrap-around, never changes scheduling, hidden on an empty Flashcard.
- **Keyboard:** Space/click flips either way; 1–4 or J/K/L/; grade once the answer has been shown (still available after flipping back); ← / → in the viewer. Keys ignored while focus is in a field or a panel/modal is open; Space never scrolls. No mouse needed.
- **Performance:** grade→next-card under 100ms perceived; app open → due-queue paint ≤200ms (cold start excluded). Multi-device last-write-wins, no locking.
- **4.9 success criteria:** predicates unit-tested for all three settings; API and e2e prove one-direction filtering, per-direction Review entry, no Card leaving Review on a switch, viewer and practice following the setting, Settings saving on change; existing unit/API/e2e suites still pass; migration applied to the Neon database (`npm run db:migrate:deploy` — 4.6's migration was once missed there).

## Technical Decisions

- **Domain isolation:** `packages/domain/sm2.ts` (`applyGrade`) is pure (no next/react/prisma/HTTP), reachable only from `app/api/**`, Vitest-tested without DB/network/browser.
- **Single SM-2 write path (AD-4):** only `POST /api/review/grade` (later `POST /api/restore`) writes `interval`, `repetitions`, `ease_factor`, `next_review_date`, `first_graded_at`, inside one Prisma `$transaction`; sets `first_graded_at` only when null. Unchanged by 4.9.
- **AD-14 per-direction predicate:** `studiedDirections(setting) → RecallDirection[]` plus Prisma-`where`-shaped builders `learnedRecordWhere(dirs)`, `unlearnedRecordWhere(dirs)`, `learnedCardWhere(dirs)`, `unlearnedCardWhere(dirs)` live once in `packages/domain/learned.ts` (plain objects, no DB import). Card-level builders are for counts and Stats only. They are the only predicates used by `GET /api/review/queue`, `GET /api/review/learn` (via `apps/web/lib/learn-queue.ts`), the Learn counts on `GET /api/flashcards/[id]`, and later `GET /api/stats`. Records of unstudied directions are never read into a queue and never written. The viewer and practice run take the prompt side from the same helper. Never derive "learned" from `interval`, `repetitions` or grade existence.
- **Schema:** `SchedulingRecord.firstGradedAt DateTime?` (from 4.6). 4.9 adds `User.studyDirections` enum `BOTH | TERM_TO_DEFINITION | DEFINITION_TO_TERM`, non-null, default `BOTH`, via an additive Prisma migration in `packages/db`; no data rewritten. A Card always keeps both records whatever the setting (`createCardWithSchedulingRecords` / AD-9 unchanged).
- **Routes:** `api/review/queue`, `api/review/learn` (`?flashcardId=` required), `api/review/grade`, new `api/settings` (GET/PATCH, Zod-validated). Pages: `(routes)/review`, `(routes)/flashcards/[id]`, `(routes)/flashcards/[id]/learn`, `(routes)/settings`.
- **Local day:** due filtering uses `toLocalCalendarDay` with `User.timezone` (shared with Epic 5's streak).
- **Conventions:** Zod input validation first; success `{ data }`; errors `{ error: { code, message, fields?|details? } }`; Better Auth session required, else 401.
- **Client flow:** Review and Learn share one session component with TanStack Query optimistic grading (advance immediately, POST in background, roll back with an error on failure).
- **Export/restore (Epic 5):** `backupExportSchema` carries `firstGradedAt` per record and `user.studyDirections`; restore writes both back.

## UX & Interaction Patterns

- **Study directions control (Settings, own section below Theme):** reuses `components.mode-switcher` pill, `{rounded.full}`, three options "Both directions" (default), "Term → Definition", "Definition → Term". Selected option is accent fill with `{colors.on-accent}`, the only accent element on Settings. Stacks vertically full-width below 640px. Saves on change (no Save button), quiet "Saved" status, inline error with rollback on failure. Helper line in `body-small` / `{colors.text-secondary}`: "Which way cards are asked in Learn and Review. Turning a direction off keeps its progress." Radio group operable with arrow keys. Must conform in both themes.
- **Review card:** `rounded.lg`, max 640px, `elevation.medium`, fixed bounds, 520ms ease-out 3D Y-axis flip; shared by Review, Learn and viewer; next Card always shows on its prompt side.
- **Grade buttons:** below the card, appear after first flip, labelled with shortcuts; Again uses the error color; Hard/Good/Easy equal weight; wraps below 640px.
- **Mobile:** sessions: tap flips, four-direction swipe grades. Viewer: tap flips, horizontal swipe moves.
- **Focus mode:** sidebar, streak badge and chrome hidden in Review and Learn, restored on exit; header names the scope or Flashcard.
- **Card viewer:** top of Flashcard detail; neutral outline circular ← / → (0.4 opacity disabled) around a mono "X / N" counter; primary "Learn" button below is the page's only accent; "Add cards" secondary.
- **Learn label:** "Learn · 12 new · 3 due", zero parts omitted, just "Learn" when nothing waits. Completion: "Nothing left to learn in {Flashcard} right now." with a link back, then "Study all cards again". No confetti.
- **Empty due queue:** streak count, a calm line, then up to 3 Flashcards with Unlearned Cards ("Weather idioms · 12 new") or a "+ Add card" button; scoped review names its scope.
- **Voice:** direct, calm; no cheerleading, emoji or gamified feedback.

## Cross-Story Dependencies

- Build order: 4.6 → 4.7 → 4.8 (+4.8b) → 4.9 → 4.5, then Epic 5. 4.9 starts after the 4.8/4.8b branch is merged.
- 4.9 extends (does not rework) 4.6 and 4.8: it rewires the queue, Learn and Flashcard-count routes onto the new per-direction builders, and makes the viewer (4.7) and practice run (4.8b) read the studied directions for prompt side and entries.
- 4.5's Empty due-queue list of Flashcards with Unlearned Cards uses the 4.9 predicates; 4.5 covers both Review and Learn.
- Epic 5: streak reuses `toLocalCalendarDay` and counts Learn grades (unaffected by 4.9); 5.2/5.3 export and restore `firstGradedAt` and `user.studyDirections`; 5.4 counts learned/unlearned over studied directions via AD-14.
