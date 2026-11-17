---
title: '10-1 Week grid and unscheduled tray'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_commit: '6aadc82a2f06e6c9c64002bdd3af249df665158a'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Planner → Calendar is a placeholder ("Coming with Epic 10"). A user cannot see whether a week of Tasks fits, because nothing shows each Task as a block as long as its whole Pomodoro plan.

**Approach:** Read-only week view. A new week read endpoint returns the week's Tasks with `planMinutes` (focus plus breaks, from the user's Pomodoro settings). A pure domain layout helper turns them into per-day blocks with overlap and conflict flags. The page draws a 7-day grid with a tray of timeless Tasks above each day. No writes.

## Boundaries & Constraints

**Always:**
- Week = Monday–Sunday containing the browsed day, with ← / → / "Today" week navigation. Day keys are `YYYY-MM-DD` via `tasks-key.ts` helpers; times are in `User.timezone` (AD-8) through `startTime` from `toTaskSummary`.
- Block length is `planLengthMinutes(planPomodoro(estimateMinutes, settings))` (AD-17). The server computes it; the client never re-plans. Settings via `parsePomodoroSettings(User.pomodoroSettings)`.
- Grid shows 06:00–24:00, scrollable up to 00:00, 1 min = fixed px via a CSS variable; a 2px accent now-line on today's column only.
- Overlapping blocks sit side by side (equal width) with a 2px `error` border and a "Conflict" caption on both. Nothing moves, nothing is blocked.
- A block past midnight continues into the next day's column (muted continuation, no second copy of data) but belongs to its start day. A Task with no `startAt` shows only as a tray chip above its day column. Done Tasks: block and chip at 0.5 opacity.
- Under 640px: one day with ← / →, tray as a horizontal chip row.
- Every block and chip is a focusable, labelled element (title, time, minutes, category, conflict). Colours and sizes only from tokens in `globals.css`.
- The conflict-border contrast on each of the five tints, both themes, is measured and recorded in DESIGN.md (UX-DR13), meeting 3:1 or accepted in writing; flip `calendar-block` / `calendar-grid` status to built.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

**Never:**
- No drag, no keyboard move, no PATCH (Story 10.2); no `Task.startAt` rewrite on session start, no progress fill, no overrun lengthening (Story 10.3). No migration, no new dependency, no effects.
- No change to existing Tasks routes or XP paths. Domain code stays pure (AD-1).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plain block | Tue 19:00, estimate 90, defaults | Block 19:00, length 105 min, title and "105 min" inside, category tint | N/A |
| Overlap | 19:00/105 min and 20:00/60 min same day | Both side by side, error border, "Conflict" on both | N/A |
| Touching | 19:00/60 min and 20:00/30 min | Not a conflict | N/A |
| Past midnight | Sun 23:00, 90 min | Block in Sun to 24:00; continuation in Mon 00:00–00:30 of the next week's column only if that day is shown | Week edge: continuation clipped |
| No start | Task without start time | Chip in that day's tray, no block | N/A |
| Done | `done: true` | Muted block or chip | N/A |
| Empty week | No Tasks | Grid with hour lines, empty trays, one line "Nothing planned this week." | N/A |
| Bad query | `start` missing or not a date | 400 VALIDATION_ERROR envelope | `validationFailure` |

</frozen-after-approval>

## Code Map

- `packages/domain/src/calendar.ts` -- NEW pure: `weekDays(day)`, `CalendarTask` type, `layoutCalendarDay(tasks)` → blocks `{ taskId, startMin, lengthMin, lane, lanes, conflict, continued }`; export from `index.ts`.
- `packages/domain/src/pomodoro.ts` -- reuse `planPomodoro`, `planLengthMinutes`, `parsePomodoroSettings`; do not change.
- `packages/domain/src/tasks.ts` -- `TaskSummary`, `localDaySchema`; add `weekQuerySchema` here or in calendar.ts.
- `apps/web/app/api/planner/tasks/week/route.ts` -- NEW GET `?start=`; `requirePlannerSession`, `userTimezone`, `taskInclude`, `toTaskSummary` (see `tasks/route.ts` for the pattern); add `planMinutes`; envelope via `ok`.
- `apps/web/lib/planner-tasks.ts` -- reuse; add `toCalendarTask`.
- `apps/web/app/(shell)/planner/calendar/page.tsx` -- replace placeholder; new `calendar-view.tsx`, `calendar-block.tsx` beside it; reuse `tasks-key.ts` (`shiftDay`, `localToday`, add `plannerWeekKey`), `tintFor` from `app/components/ui`, `useSyncExternalStore` today pattern from `tasks-view.tsx`.
- `apps/web/app/globals.css` -- add only tokens the grid needs (hour height); check against `card`, `bg` and tints.
- `_bmad-output/planning-artifacts/ux-designs/.../DESIGN.md` -- record conflict-border ratios, status built.
- Tests: `tests/domain/calendar.test.ts` (new), `tests/api/planner-week.spec.ts` (new), `tests/e2e/planner-calendar.spec.ts` (new; the stale placeholder assertion in `planner-shell.spec.ts` was fixed in cb69ac3).

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/calendar.ts` -- pure week/day layout and conflict detection -- logic testable without UI
- [x] `tests/domain/calendar.test.ts` -- every I/O matrix row -- locks overlap, touching, midnight, empty
- [x] `apps/web/app/api/planner/tasks/week/route.ts`, `apps/web/lib/planner-tasks.ts` -- week read with `planMinutes` -- server owns the plan length
- [x] `tests/api/planner-week.spec.ts` -- 401, 422, scoping by user, week bounds, `planMinutes` -- API contract
- [x] `calendar/page.tsx`, `calendar-view.tsx`, `calendar-block.tsx`, `globals.css` -- grid, now-line, tray, mobile day view, keyboard focus -- the feature
- [x] `DESIGN.md` -- measured conflict-border ratios, status built -- UX-DR13
- [x] `tests/e2e/planner-calendar.spec.ts` -- block, tray, conflict, mobile day, keyboard Tab reach -- end-to-end

**Acceptance Criteria:**
- Given Planner → Calendar with Tasks, when the page loads, then each timed Task is a tinted block of plan length with its title and minutes, and timeless Tasks are chips in their day's tray.
- Given a viewport under 640px, then one day shows with ← / → and the tray is a horizontal chip row.
- Given another user's Tasks, then none appear.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Bad `start` returns 400, matrix says 422 (blind, verification-gap) | medium | `validationFailure` returns 400 on every Planner route; the matrix row is in the frozen block. Route: intent_gap; human chose to amend the matrix row to 400, no code change. |
| Now-line and today column use the browser clock, not `User.timezone` (all reviewers) | low | Same pattern as `tasks-view.tsx` `localToday`; timezone is captured from the browser at signup. Route: defer. |
| Today frozen while the page stays open past midnight | medium | `today` is a one-time snapshot while `nowMinutes` wraps. Route: patch. |
| Short blocks clip the Conflict caption; tiny blocks collapse | medium | Verified: 5-25 min blocks are under about 25px. Route: patch (minimum height). |
| Block height and top never asserted in e2e | medium | Verification-gap evidence. Route: patch. |
| Done muting has no test | medium | Route: patch. |
| Midnight continuation not rendered-tested | low | Layout is unit-tested. Route: patch (one e2e case). |
| aria-label omits the day | medium | Route: patch. |
| `formatWeek` drops the start year across a year boundary | low | Route: patch. |
| `font-mono` on "continues, N min" prose; dashed border not in the spec | low | DESIGN.md reserves mono for numerics. Route: patch (drop both). |
| `--calendar-hour` missing from DESIGN.md spacing | low | Route: patch (document it). |
| Previous-week Sunday carry-in not fetched | low | Rare and the spec clips at the week edge. Route: reject (unlikely, fix adds route behaviour). |
| No loading or stale-error state | low | Cosmetic; fix adds branches. Route: reject. |
| `py-0.5`, `z-[5]`, `44rem` off-token layout values | low | Layout dimensions, not colour, shadow or radius. Route: reject. |
| Scroller height 11h shows 06:00-17:00 on load | low | Spec leaves the viewport height open. Route: reject. |
| Blocks before 06:00 have no cue | low | Reject, same reason. |
| `findUniqueOrThrow` unhandled 500 | false | Existing `userTimezone` helper used by every Planner route. |
| Zero or NaN `lengthMin` guard | false | Estimate has a 5-minute minimum; `startTime` is regex-validated. |
| Scroll effect with `offsetHeight` 0 | maybe-false | Needs a hidden-mount case to reproduce; low. Reject. |
| Contrast ratios not reproducible; `start` param naming; e2e depends on the date; unchecked spec boxes | low | Documentation and hygiene; reject. |

## Design Notes

Overlap lanes: sort a day's blocks by start; greedily assign the first lane whose last end ≤ start; a cluster's `lanes` is the max lane count of connected overlapping blocks, so widths stay equal within a cluster. `conflict` is true when a block overlaps any other. Continuations are produced by the layout, not stored.

## Verification

**Commands:**
- `pnpm -r typecheck` and `pnpm lint` -- expected: clean
- `pnpm vitest run tests/domain/calendar.test.ts tests/api/planner-week.spec.ts` (PowerShell; see memory) -- expected: pass
- `pnpm playwright test tests/e2e/planner-calendar.spec.ts` -- expected: pass

**Manual checks (if no CLI):**
- Screenshot Calendar in light and dark at desktop and 390px width.
