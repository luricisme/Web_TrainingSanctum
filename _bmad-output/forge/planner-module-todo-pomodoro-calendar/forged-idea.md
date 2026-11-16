# Forged idea: Planner module (Todo + Pomodoro + Calendar + Music)

Outcome: HARDENED — 2026-11-16. Module 2 of Training Sanctum. Replaces the PRD non-goal at prd.md §5 ("Pomodoro timer, task manager must not be scaffolded"). Precedent: Epic 7 was added via Sprint Change 2026-11-14d — do the same.

## Locked decisions

- **Task is free-form** (title, category, day, optional start time, estimate minutes). No link to Class/Folder. No auto-estimate from due cards.
- **Pomodoro plan is binding; estimate is a budget.** 90 min → exactly 25/25/25/15 focus with breaks between; the last block is the remainder, not rounded up. After the last block the timer stops and asks "done?".
- **Overrun is bounded.** "+1 session" (one more focus block) at most 2× per task lifetime (≤ +50 min). Then only "not done". To continue, edit the estimate and restart. Estimate keeps its entered value; overrun is logged for recalibration.
- **Restarting a task with prior actual** builds the plan from `remaining = max(estimate − actual, 0)`; if 0, only the two buffer sessions remain.
- **Calendar is a time grid.** Start time optional; timeless tasks sit in an "unscheduled" area. Block length = full plan incl. breaks (90 min estimate → 105 min block) so conflicts are real. When a pomodoro starts late the block moves to the actual start — the plan is overwritten by reality; no two-layer calendar.
- **Collisions (C1):** overlaps are allowed and drawn as a conflict. No auto-push, no blocking.
- **Rollover (R1):** unfinished tasks stay on their day as overdue. Todo page shows an "N overdue" badge and one manual "move all to today" action. Estimate unchanged; logged actual stays on the task.
- **Timer truth (T2):** server-side. Start writes `PomodoroSession{taskId, kind, startedAt, plannedMinutes, endedAt=null}`; client renders `now − startedAt`. At most one running session per user, enforced in DB.
- **XP (E1):** passive only. Completed focus session = X XP, task done = Y XP, via new `XpEventReason` values. No quest, no settlement, no penalty. X, Y set in PRD.
- **Music (M2 on Jamendo):** single source v1. Free `client_id`, tags lofi/chillout, full-track stream URL in `<audio>` so per-session fade works. Assignable per category (overridable per task), choice remembered, per-track CC attribution shown. `MusicSource` is a small interface so Audius/Radio Browser can be added later.
- **Build order:** Epic 8 Task & Category → Epic 9 Pomodoro → Epic 10 Calendar → Epic 11 Music.

## Rejected, and why

- Task linked to Class/Folder — gold-plating; tasks are mostly outside the flashcard content.
- Descriptive progress (estimate as a meter, timer runs forever) — user wants the budget to cut.
- Unlimited "+1 session" — would make the budget meaningless.
- Auto-rollover / ask-on-open — conflicts with the "tool I control" stance taken everywhere else.
- Chain-push or block on collision — pushes hide changes; blocking stops the user from starting.
- Client-only or heartbeat timer — reload/device loss; heartbeat is worst of both.
- Quests + penalties for pomodoro — exploitable via "+1" and fake tasks; XP mechanic itself unproven.
- Bundled files, YouTube embed, Spotify, uploads — user wants an API; embed lacks volume control and has ads; Spotify needs Premium + OAuth; uploads need file storage the app lacks.

## Assumptions carried (proposed, not explicitly confirmed)

- A task belongs to the local day of its start time even if its block ends after midnight; Day Settlement (5.7) ignores tasks.
- A session found already expired on reconnect (laptop asleep) counts as completed, actual = plannedMinutes.
- "+1" sessions and reconnect-completed sessions also earn session XP.
- Planned start time is lost once a task is started; only estimate-vs-actual minutes survive.

## Open cracks

- User never described the "Sunday night" calendar scene; the time-grid choice was made without a stated use scene.
- Jamendo terms page is dated 2013; lofi catalog quality unchecked. Verify both before Epic 11 starts.

## Hand-off

Input for `/bmad-correct-course` (PRD §4.10 + §5 edit, Epics 8–11, ARCHITECTURE-SPINE models: TaskCategory, Task, PomodoroSession, PomodoroSettings on User, new XpEventReason values, sprint-status entries).
