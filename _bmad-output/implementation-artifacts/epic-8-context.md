# Epic 8 Context: Planner — Tasks & Categories

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A user gets a **Planner** destination in the nav and keeps free-form tasks per day, each with a category (coloured), an estimate and an optional start time. Open tasks from past days are brought to today only by one explicit manual action, and marking a task done passively earns XP. This is module 2 of the product (Phase 1b), sharing account, XP ledger and the Pastel Frame look with flashcards; it lays the shell, data model and XP path that the later Pomodoro, Calendar and Music epics build on.

## Stories

- Story 8.1: Planner Shell and Navigation
- Story 8.2: Task Categories
- Story 8.3: Tasks per Day
- Story 8.4: Overdue Tasks and Move to Today

## Requirements & Constraints

- A Task is free-form: title, one Category, local day, optional start time, estimate in whole minutes (>= 5). It never references a Card, Flashcard, Folder or Class.
- Categories: name unique per user (case-insensitive), one of the five tints, create/rename/recolour/delete. Deleting a category that has tasks must offer "move tasks to another category" or "delete tasks too".
- The estimate is a budget the user owns; the app never changes it. Logged ("actual") minutes survive any move.
- Rollover is manual only: no job, no on-open prompt, no auto-move. Overdue = open tasks on past days.
- XP is passive: marking done awards once (+5 / 10 / 20 / 20 by Bộ), reopening keeps it, a second done never re-awards. No quest, no penalty.
- Nav grows to five items (six for an admin) at every breakpoint; the dock has five buttons. Focus mode is unaffected; the Planner never enters it.
- Every planner route returns 401 without a session and is scoped to the user.
- With `JAMENDO_CLIENT_ID` unset the app must still boot (Config changes only in Epic 11).

## Technical Decisions

- One additive Prisma migration for this epic: `TaskCategory`, `Task`, `XpEvent.questKind` made nullable, `XpEventReason` gains `FOCUS_SESSION` and `TASK_DONE`. It must be deployed to Neon together with the code, or every page returns 500. Existing XpEvents are unchanged; the AD-15 ledger invariant (event deltas in order, floored at 0, equal `User.cultivationXp`) must still hold.
- Only Route Handlers under `app/api/planner/**` write Planner tables. Routes: `categories`, `tasks` (CRUD, `GET ?day=`), `tasks/[id]` PATCH, `tasks/[id]/done` POST, `tasks/move-overdue` PATCH. Pages under `app/(routes)/planner/`, one nav item with Tasks / Calendar / Pomodoro as URL segments.
- Every route validates body/query with Zod before domain/db code and returns the standard error envelope with field-level errors (AD-6).
- Task done: one `XpEvent(reason TASK_DONE, questKind null)` written once (guarded by `Task.xpAwardedAt`) in the same transaction as the `User.cultivationXp` update. Settlement never reads Planner tables.
- `plannerXp(bộ, kind)` is a pure function in `packages/domain/pomodoro.ts` (unit-tested at all four Bộ).
- Task day: `Task.localDay` is the local day of the start time when set (via `toLocalCalendarDay`, AD-8), else the day the user chose. A plan crossing midnight does not move it (23:30 start with 90 min stays on that day).
- Category delete (move or delete tasks) and "move overdue" are each one `$transaction` (AD-11) and log a structured line. Move-overdue keeps start time, estimate and logged minutes.
- Deleting a Task removes its sessions; user deletion already cascades to the new tables.

## UX & Interaction Patterns

- Nav: fifth item **Planner** (sixth for admin) linking to `/planner`; label and icon-only rules follow the existing app bar and dock rules.
- Segment switcher (`components.mode-switcher`): Tasks (default), Calendar, Pomodoro; segment in the URL (`/planner/calendar`), survives reload, arrow keys move between options. Calendar and Pomodoro show a one-line "Coming with Epic 9/10" placeholder with no broken controls.
- Tasks segment: day header with previous/next arrows and a date field (today default). Task row: Category chip, title, optional time, mono "actual / estimate" (in `warning` when actual > estimate), done checkbox, "..." menu (Edit / Start pomodoro / Delete); done rows muted and last. Delete confirm names the Task.
- Overdue strip: "N overdue" with a single "Move all to today"; hidden entirely when nothing is overdue.
- Categories modal: name plus tint radio reusing the Class-colour picker, new category defaults to the next tint in order; delete modal has "Move tasks to ..." (default, with picker) and "Delete tasks too" (danger). First task creation with no categories offers to create one inline.
- Empty day: "Nothing planned for {day}." with primary "+ Add task". Follow DESIGN.md in both themes.

## Cross-Story Dependencies

- Build order is 8.1 -> 8.2 -> 8.3 -> 8.4; 8.2 carries the epic's migration, 8.3 depends on it and on the XP ledger from the cultivation epic.
- Epic 12 (Shared Classes) is built before this epic.
- Later epics build on this one: Epic 9 (Pomodoro: sessions, "Start pomodoro" menu action, planner export/restore), Epic 10 (Calendar uses `PATCH tasks/[id]` for day/start changes), Epic 11 (music field on categories and tasks). Story 5.5 audits Planner surfaces last.
- The nav e2e tests change in 8.1 to expect five items (six for admin).
