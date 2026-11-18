# Epic 10 Context: Planner — Calendar

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A user sees the week as a time grid where each scheduled Task is a block as long as its whole Pomodoro plan (focus plus breaks), drags Tasks between times and days, and watches a block move to the real start when its Pomodoro begins. The calendar becomes a record of what happened rather than a wish, and it reuses the one plan computation from Epic 9 instead of keeping its own copy of planned time.

## Stories

- Story 10.1: Week Grid and Unscheduled Tray
- Story 10.2: Drag to Reschedule
- Story 10.3: Live Blocks

## Requirements & Constraints

- Block length always equals the plan length including breaks (e.g. 90 min estimate → 105 min block); title and "90 min" shown inside, fill in the Task Category's tint.
- Grid: 7 days, 06:00–24:00 shown by default, scrollable to 00:00, with a now-line. A block crossing midnight continues into the next column but belongs to its start day.
- Start time is optional: Tasks without one sit in an unscheduled tray above their day column. Done Tasks are muted.
- Collisions are drawn, never resolved: overlapping blocks render side by side with an `error` border and a "Conflict" caption; nothing moves, blocks or prompts.
- Under 640px: a single day with ← / → replaces the week, and the tray becomes a horizontal chip row.
- Rescheduling snaps to 15 minutes; optimistic with rollback and an inline error on failure. Drag to a time/day sets day + start; tray to grid gains a start; block to tray clears it. A moved Task keeps its estimate, sessions and overrun count.
- Keyboard: every block and chip is reachable; arrows move 15 min / one day, Enter commits, Esc cancels.
- Live behavior: starting a Pomodoro sets the Task's start to the session's real start (a tray Task gains one); an overrun session lengthens the block; a running session shows an accent progress fill; a plan stopped early is as long as logged time plus what remains of the plan. Planned time is intentionally lost on start (accepted for v1).
- Conflict-border contrast is already measured and recorded (all pairs meet 3:1 on every tint in both themes); the "Conflict" caption means no information depends on the border alone.
- Planner routes return 401 without a session, are user-scoped, validate with Zod first, and use the standard error envelope.

## Technical Decisions

- Length comes from `planLengthMinutes` in the pure `packages/domain/pomodoro.ts` (AD-17); do not recompute plan or length in the UI or route. Domain stays free of next/react/prisma/http imports and is Vitest-tested.
- Rescheduling goes through `PATCH /api/planner/tasks/[id]`. `Task.startAt` is the single source of time; no second copy of planned time is stored anywhere. `Task.localDay` is the local day of `startAt` when set (`toLocalCalendarDay`, AD-8), else the user-chosen day; a plan crossing midnight does not move it.
- Session start (Epic 9 route) is where `Task.startAt` is set to the session's `startedAt`; Story 10.3 adds that behavior there. Only Route Handlers under `app/api/planner/**` write Planner tables.
- Overrun sessions and logged actual minutes are read from `PomodoroSession`; remaining-plan length uses `remainingMinutes`.
- Any new migration must be deployed to Neon with the code, or every page returns 500 (none is anticipated by the epic text).

## UX & Interaction Patterns

- Planner is one nav item with a Tasks / Calendar / Pomodoro segment switcher; the segment is in the URL.
- Calendar block: the whole block is the drag handle; keyboard is select, then arrows. Tray chips are compact, per day. Conflicts: no modal.
- Design tokens `calendar-block` (tint fill and border, `done-opacity` 0.5, accent progress fill, `error` conflict border, move states) and `calendar-grid` (divider lines, caption hour labels, accent now-line) exist; one hour is `--calendar-hour` (3.5rem, a minute is a sixtieth). Both are marked built through Story 10.2; progress fill (10.3) is the remaining piece. Support light and dark themes; CSS only.
- Move states: the lifted item uses `elevation.low` and the accent focus-style ring; the drop slot is a dashed `border` ghost; the target tray fills with `row-hover`.
- If the grid proves too heavy, a month view is the documented fallback; Epics 8–9 do not depend on the grid.

## Cross-Story Dependencies

- Build order 10.1 → 10.2 → 10.3; 10.2's drag uses the PATCH route and block rendering from 10.1; 10.3 layers live behavior onto the blocks.
- Depends on Epic 8 (Task, Category tints, task PATCH, `startAt`/day fields) and Epic 9 (`planLengthMinutes`, sessions, session-start route, overrun).
- Epic 11 (music) is independent of the grid.
