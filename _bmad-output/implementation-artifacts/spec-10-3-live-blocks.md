---
title: '10-3 Live blocks'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_commit: '5ef212aaf2a5941a7298999e58524de8abf9fdd6'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The calendar shows only the plan. A block stays where it was scheduled and keeps its planned length, whatever happened in the Pomodoro screen.

**Approach:** Starting a Task's first focus session writes `Task.startAt` (and `localDay`) from the session's `startedAt`. A block's length is derived on the server from what was logged plus what remains of the plan, so overrun sessions lengthen it and an early stop shortens it. A session running now draws an accent progress fill.

## Boundaries & Constraints

**Always:**
- Only the first FOCUS session of a Task (no earlier session of any kind) sets `startAt = startedAt` and `localDay` = that instant's local day (AD-8, AD-17). Later sessions, BREAK sessions and refused starts change nothing. This runs in the start route's existing transaction. A tray Task gains a start; a scheduled one moves to the real start.
- Block length = Σ `actualMinutes` of ended sessions (focus and break) + the running session's `plannedMinutes` + the plan length (`planLengthMinutes(planPomodoro(...))`) of the focus minutes still unlogged after those. A Task with no sessions keeps today's plan length. A done Task with sessions is as long as what was logged. Computed in a pure domain function; nothing is stored (one `startAt`, no second copy).
- The week response keeps `planMinutes` as this block length (calendar callers read it as before) and adds `doneMinutes` (Σ ended actual) and `running: { startedAt, plannedMinutes } | null` for the Task.
- The fill: the block shows, from its top, `(doneMinutes + min(elapsed, plannedMinutes)) / planMinutes` of its height in the accent token; elapsed comes from `startedAt` (server truth), re-rendered at least every 30 s. While any block is running the week query refetches every 30 s.
- A running block stays focusable and labelled ("…, running"). The fill is not the only signal: the label and a visible caption "Running" carry it too.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

**Never:**
- No migration, no new route, no change to the sessions API shape, XP paths or the PATCH schema. No `startAt` write on end, overrun, or drag (10.2 owns drag). No resizing blocks. No new stored length.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tray Task starts | Chip, first FOCUS at 14:07 | `startAt` 14:07, `localDay` today; chip becomes a block there | Refused start (409): no write |
| Scheduled Task starts late | Block Tue 09:00, first FOCUS Wed 10:30 | Block at Wed 10:30 | N/A |
| Second focus session | Task already has a session | `startAt` unchanged | N/A |
| Overrun added | 50 min plan, 1 overrun of 25 min ended | Block +25 min | N/A |
| Stopped early | 60 min estimate, 10 min logged, ended | Block = 10 + remaining plan | N/A |
| Running now | FOCUS 25 planned, 10 elapsed, 0 done | Fill 10/block length | N/A |
| Starts near midnight | First FOCUS 23:50 | Block at 23:50, continues next day as in 10.1 | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/pomodoro.ts` -- add pure `blockMinutes({estimateMinutes, done}, sessions, settings)` beside `planPomodoro`, `remainingMinutes`, `planLengthMinutes`; export via `index.ts`. Do not change those.
- `packages/domain/src/calendar.ts` -- `WeekTaskSummary` gains `doneMinutes`, `running`; layout untouched (it already reads `planMinutes`).
- `apps/web/lib/planner-tasks.ts` -- `toCalendarTask` takes the Task's sessions and uses `blockMinutes`; keep `taskInclude` as is for other callers, add a week-only include of sessions (`kind`, `actualMinutes`, `plannedMinutes`, `startedAt`, `endedAt`).
- `apps/web/app/api/planner/tasks/week/route.ts` -- load sessions with the rows, pass to `toCalendarTask`.
- `apps/web/app/api/planner/sessions/route.ts` -- in the transaction, after `create`: if `kind === "FOCUS"` and the Task had no sessions, `tx.task.update` `startAt`/`localDay` (`toLocalDate`, `packages/domain/src/time.ts`; user timezone is already one query away). `task.sessions` is already loaded, use it.
- `apps/web/app/(shell)/planner/calendar/calendar-block.tsx`, `calendar-view.tsx` -- fill, "Running" caption, label, clock tick, `refetchInterval` when a row is running. `WeekTaskSummary` is also mirrored near `calendar-view.tsx:63` (the optimistic drag type), keep in sync.
- `DESIGN.md` -- calendar-block rule: running fill. `tasks-view.tsx` unchanged.
- Tests: `tests/domain/pomodoro.test.ts` (extend), `tests/api/planner-sessions.spec.ts` and `tests/api/planner-week.spec.ts` (extend), `tests/e2e/planner-calendar.spec.ts` (extend).

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/pomodoro.ts`, `tests/domain/pomodoro.test.ts` -- `blockMinutes` plus unit tests for every matrix row
- [x] `apps/web/lib/planner-tasks.ts`, `apps/web/app/api/planner/tasks/week/route.ts`, `packages/domain/src/calendar.ts` -- week rows carry block length, `doneMinutes`, `running`
- [x] `apps/web/app/api/planner/sessions/route.ts`, `tests/api/planner-sessions.spec.ts` -- first FOCUS sets `startAt` and `localDay`; later, BREAK and refused starts do not
- [x] `tests/api/planner-week.spec.ts` -- overrun lengthens, early stop shortens, running exposed
- [x] `calendar-block.tsx`, `calendar-view.tsx` -- progress fill, caption, label, tick and polling
- [x] `tests/e2e/planner-calendar.spec.ts` -- start a session from a chip: block appears at the start; running block shows the fill and "Running"
- [x] `DESIGN.md` -- note the running fill

**Acceptance Criteria:**
- Given a Task with no sessions, when its first focus session starts, then the calendar shows its block at the real start and no second start is stored.
- Given a finished overrun session, when I open the calendar, then the block is longer by it.
- Given a session running now, then its block shows an accent fill and "Running" without relying on colour alone.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Fill drawn on the first segment only but sized over the whole block; a midnight-spanning block overstates progress and the continuation shows none; "Running" caption on both segments but fill on one (edge, blind, claim) | medium | Verified: `running && !block.continued` with fraction over `planMinutes`. Route: patch (per-segment fill, drawn on both, unit tests). |
| text-secondary on tint plus 25% accent fill is below AA; 25% opacity and 2px leading edge not in DESIGN.md (design) | medium | Measured 2026-11-18: text 5.3-9.2 passes, text-secondary 3.1-4.3 fails; title of a continued block is secondary. Route: patch (running blocks use text colour; record opacity, edge and ratios in DESIGN.md). |
| Matrix row "Scheduled Task starts late" untested; only unscheduled Tasks start in tests (verification-gap, edge, blind) | medium | Pre-verified gap. The overwrite itself is the frozen intent (matrix row 2), so no code change. Route: patch (API test). |
| No test with a non-UTC user timezone for `localDay` (verification-gap, blind) | medium | Pre-verified. Route: patch (two zones 26 h apart). |
| `useNow` holds a stale `now` until the first tick when a block turns running later (edge, verification-gap) | low | Verified: interval runs only while active, initial value is mount time. Route: patch (one-line resync). |
| XP assertion compares with `new Date()` after the request, flakes at UTC midnight (edge, blind) | low | Verified. Route: patch. |
| Block shrinks by one break when a session starts (55 to 50); stopped-early length misses the break between logged and remaining focus (blind) | low | Verified, and it is exactly the frozen formula the human approved with this caveat in Design Notes. Fix would change frozen intent. Route: reject; flagged at the checkpoint for renegotiation. |
| Stale or abandoned running session shows "Running" forever and polls forever; several open sessions (edge, blind) | false | `requirePlannerSession` sweeps an expired session on every planner route, the week read included; partial unique index allows one open session per user. |
| Ended session with null `actualMinutes`, or `endedAt` and `actualMinutes` disagreeing (edge) | false | `endSessionTx` sets both in one update. |
| Break-first Task never anchors `startAt` (edge) | false | `planNextSession` refuses a BREAK before a focus session. |
| `runningFillFraction` NaN on bad `startedAt`; invalid timezone throws (edge) | false | `startedAt` is an ISO string from the server; `timezone` is validated when stored. |
| Running BREAK counts as worked; done Task with a running session; overtime caps the fill (edge) | low | A break is part of the block; a done Task cannot run (start refused). Not reachable in everyday use and the fix adds branches. Route: reject. |
| Hydration mismatch of `useNow` (edge, verification-gap) | false | The view renders from `useQuery` data, so blocks exist only on the client after load. |
| Concurrent PATCH versus first start, last write wins (edge) | low | Rare, matches every other Task write. Route: reject. |
| Week read loads every session of the week's Tasks (blind) | low | Bounded by one week of sessions; an aggregate query adds complexity. Route: reject. |
| `refetchInterval` and `useNow` ticks have no test; e2e rewrites `startedAt` without `startAt` and does not assert block position; refused-start test covers BREAK only (verification-gap, edge, blind) | low | Timing-only path; position and `startAt` are pinned by the API test. Fix needs a fake clock. Route: reject. |
| Tray chip shows "running" only in its label (blind) | low | A running Task always has a start, so it is a block; reachable only by dragging it to the tray while running. Route: reject. |
| `planPomodoro(0)` assertion, `.working/design-dna-profile.json` missing, DESIGN.md `status` field (blind, design) | low | `blockMinutes` clamps `unlogged` at 0 and the existing plan tests cover empty plans; the missing profile is not a code defect; `status` now also names Story 10.3 (fixed directly). Route: reject. |

## Design Notes

Decided without asking, change at approval if wrong: only the **first** focus session moves `startAt` (later sessions extend the block instead of re-anchoring it); `localDay` follows `startAt` (AD-17); a done Task is drawn at its logged length. The break that would sit between logged and remaining focus is not counted in the remaining plan, so a stopped-early block can be a few minutes short of a literal timeline.

## Verification

**Commands:**
- `pnpm -r test` and `pnpm -r typecheck` (PowerShell; see memory on Vitest) -- expected: pass
- `pnpm --filter web lint` -- expected: clean

**Manual checks (if no CLI):**
- Calendar in dark and light: running block fill uses the accent token, caption legible, no layout jump at tick.
