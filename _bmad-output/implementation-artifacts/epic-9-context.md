# Epic 9 Context: Planner — Pomodoro

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A user starts a Pomodoro from a Task and the app builds a binding plan from the Task's remaining estimate (focus sessions, breaks, a final remainder session), runs it on a server-truth timer that survives reloads and devices, asks "Done?" when the plan ends, allows at most two extra ("overrun") sessions per Task, and logs every focus session and awards passive XP for it. It makes the estimate a real budget, and it makes the plan one shared source of truth for the timer screen, the calendar block (Epic 10) and the Done prompt.

## Stories

- Story 9.1: Pomodoro Plan Engine and Settings
- Story 9.2: Server-Truth Sessions
- Story 9.3: Pomodoro Screen
- Story 9.4: Planner in Export and Restore

## Requirements & Constraints

- The plan is built only from remaining minutes = max(estimate − Σ actual focus minutes, 0); the last focus session is the remainder and is never rounded up; a long break follows every N focus sessions. Defaults 25/5/15/every 4: 90 min → 25·5·25·5·25·5·15.
- Settings per user: focus, short break, long break 5–90 min, long-break-every 2–8; saved on change with a quiet "Saved" and rollback on error.
- One running session per user. A second start is refused (409). Breaks never start automatically.
- Overrun: at most two overrun focus sessions per Task over its whole life, enforced in domain and route, never only in the UI.
- Focus-session XP is passive: +1 / 2 / 4 / 4 by Bộ, written when a FOCUS session ends with ≥ 1 actual minute; breaks earn nothing. No quest and no penalty reads Planner tables.
- Every planner route returns 401 without a session and is scoped to the user; Zod validation before domain/db code; standard error envelope.

## Technical Decisions

- `packages/domain/pomodoro.ts` is pure (no next/react/prisma/http imports, AD-1): `planPomodoro`, `remainingMinutes`, `overrunSessionsUsed`, `planLengthMinutes`, `plannerXp`. Unit-tested with Vitest, no network/DB/browser (AD-12). Route Handlers pass facts in; the domain decides.
- Migration for this epic (additive): `PomodoroSession (userId, taskId, kind FOCUS|BREAK, plannedMinutes, actualMinutes?, startedAt, endedAt?, overrun bool)` with partial unique index `(userId) WHERE endedAt IS NULL`, and `User.pomodoroSettings` JSON with default `{ focus: 25, shortBreak: 5, longBreak: 15, longBreakEvery: 4 }`. Cascades on user delete; deleting a Task removes its sessions. Must be deployed to Neon together with the code, or every page returns 500.
- Server truth: the client renders `now − startedAt` and never sends elapsed time. Any `/api/planner/**` call first closes a session whose planned end has passed, at its planned end (`actualMinutes = plannedMinutes`). Session end: `actualMinutes = min(elapsed, planned)`.
- XP write paths grow to four (claim, settlement, session end, task done): one `XpEvent(FOCUS_SESSION, questKind null, localDay = the Task's day)` plus the `User.cultivationXp` update in one transaction; the AD-15 ledger invariant is unchanged.
- Only Route Handlers under `app/api/planner/**` write Planner tables and `User.pomodoroSettings`. `backupExportSchema` is untouched until Story 9.4.
- The sleep/offline rule (an expired session counts as completed at planned length) is a proposed assumption recorded in `deferred-work.md`; record it in the 9.2 spec.

## UX & Interaction Patterns

- Pomodoro segment of Planner: Plan strip (pill per session; focus pills in the Task's tint with mono minutes, breaks neutral; current pill ink-bordered, done ticked, overrun marked "+"), large mono countdown, Start / Stop; Done card is inline, not a modal ("Done?" → **Done** / **Not yet**; then "+1 session (n of 2 left)" or "Edit the estimate to continue.").
- "A session is running on {Task} — {m:ss} left." with a link; Start disabled on other Tasks. Space starts/stops, Esc closes the Done card; countdown re-syncs on visibility change. Task row "actual / estimate" turns `warning` when over estimate. Settings gets a Pomodoro card styled like the Study directions control.
- Follow DESIGN.md tokens (plan-strip, countdown) in both themes; CSS only, no effects.

## Cross-Story Dependencies

- Build order 9.1 → 9.2 → 9.3 → 9.4. 9.1 carries the epic's migration and the pure engine every later story and Epic 10 consume.
- Depends on Epic 8: Task, category and `TASK_DONE` XP path (8.3), and the Task row "Start pomodoro" menu entry (8.3).
- Story 9.4 touches Stories 5.2, 5.3 (export/restore), 7.3 (read-only user page) and 7.6 (user delete). Epic 10 reads `planLengthMinutes`; Epic 11 adds the music player to the Pomodoro screen.
