---
title: 'Story 8.4: Overdue Tasks and Move to Today'
type: 'feature'
created: '2026-11-17'
status: 'done'
baseline_commit: '780dabcb0ef9a1247a4c6bd2586d882a53bab7e9'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Open Tasks left on past days are invisible once the user moves to another day, and nothing lets them bring those Tasks forward, so unfinished work is silently lost from view.

**Approach:** Add `GET /api/planner/tasks/overdue` (count) and `PATCH /api/planner/tasks/move-overdue`, and an Overdue strip at the top of Planner → Tasks: "N overdue" with one button "Move all to today". Rollover is only ever this explicit action. No migration.

## Boundaries & Constraints

**Always:** Both routes return 401 without a session and are scoped to the user. "Today" is the server's `toLocalDate(now, User.timezone)` (AD-8), never a client value; overdue = `done = false` and `localDay < today`. Move is one `$transaction` (AD-11): each overdue Task gets `localDay = today`; a Task with a start time keeps its time of day (`startAt` rebuilt for today in `User.timezone`, via `formatLocalTime` and `startAtFor`); `estimateMinutes` and `loggedMinutes` are untouched, including `loggedMinutes` above the estimate. It logs one structured line (`planner.task.move-overdue`, with the count) and returns `{ moved }`. Done Tasks and Tasks of today or later never move. The strip shows only when the count is above 0 and is visible whichever day is open; after the move the Task queries (`PLANNER_TASKS_KEY`) and the overdue query are invalidated so the strip disappears. UI uses DESIGN.md tokens only, in both themes.

**Never:** No job, cron, on-open prompt or any other auto-move. No per-Task move, no "move to a chosen day" (editing a Task's day already exists). No schema or migration change. No XP or ledger change. Do not edit the Category routes, the 8.1 switcher or `focus-mode.tsx`. No hard-coded colours.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Overdue exist | 3 open Tasks on past days | GET `{ count: 3 }`; strip "3 overdue" and "Move all to today" | N/A |
| Move | PATCH | 200 `{ moved: 3 }`; all three on today; strip disappears | N/A |
| Timed Task | 09:30 yesterday | Today at 09:30 (user's timezone) | N/A |
| Over budget | logged 30, estimate 25 | Both unchanged after the move | N/A |
| Excluded | done Task on a past day; Task today or tomorrow | Not counted, not moved | N/A |
| None overdue | no matching Task | GET `{ count: 0 }`, no strip; PATCH 200 `{ moved: 0 }` | N/A |
| Other user's Tasks | another user has overdue | Never counted or moved | N/A |
| Signed out | either route | 401 | Standard envelope |
| Move fails | PATCH 5xx | Strip stays; short alert "Could not move your tasks." | Retry by pressing again |

</frozen-after-approval>

## Code Map

- `apps/web/app/api/planner/tasks/overdue/route.ts` (GET) and `tasks/move-overdue/route.ts` (PATCH) -- new; mirror `tasks/route.ts` and `tasks/[id]/done/route.ts` (`requireSession`, `$transaction`, `logOperation`, `ok`)
- `apps/web/lib/planner-tasks.ts` -- `startAtFor`, `userTimezone`; reuse; add a shared `overdueWhere(userId, today)`
- `packages/domain/src/time.ts` -- `toLocalDate`; `tasks.ts` -- `formatLocalTime`; add an `OverdueSummary` type
- `apps/web/app/(shell)/planner/tasks-view.tsx` -- add the strip above the day header; `tasks-key.ts` -- add `PLANNER_OVERDUE_KEY`
- `apps/web/app/components/ui.ts` -- `buttonSecondary`/`buttonPrimary`; `app/globals.css` -- `warning` token
- `tests/api/planner-tasks.spec.ts` (`newUser`, `add`), `tests/e2e/planner-tasks.spec.ts` -- patterns to extend

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/lib/planner-tasks.ts`, `tasks/overdue/route.ts`, `tasks/move-overdue/route.ts` -- count and move in one transaction, logged -- AD-8, AD-11
- [x] `packages/domain/src/tasks.ts` -- `OverdueSummary` type -- shared shape
- [x] `tasks-view.tsx`, `tasks-key.ts` -- Overdue strip, mutation, invalidation, error alert -- UI
- [x] `tests/api/planner-tasks.spec.ts`, `tests/e2e/planner-tasks.spec.ts` -- matrix cases, 401, cross-user, logged above estimate, timed Task in a non-UTC timezone; strip visible then gone; dark and light screenshots at 1280px and 390px

**Acceptance Criteria:**
- Given open Tasks on past days, when I open Tasks on any day, then I see "N overdue" and one "Move all to today" button
- Given I press it, when it succeeds, then those Tasks show on today with time, estimate and logged minutes intact and the strip is gone
- Given no overdue Task, when I open Tasks, then no strip or button shows, and nothing moves unless I press the button
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Overdue count not invalidated by task create/edit/done/delete (Blind, Verification, Edge) | medium | Real: only the move invalidated `PLANNER_OVERDUE_KEY`. Patch: invalidate it in task-modal, delete-task-modal and the done toggle. |
| Move updates per row; a Task done or deleted between read and write is moved or throws P2025; 5s interactive transaction timeout (Blind, Edge) | medium | Real. Patch: `updateMany` for untimed Tasks, per-row `updateMany` re-applying the overdue filter for timed ones, 30s timeout; `moved` counts rows actually updated. |
| Move error alert persists and count stale after a failed move (Edge) | low | Patch: invalidate on `onSettled`. |
| Strip uses `rounded-lg`, a hairline border, and `text-error` on `elevated` (Design) | low | DESIGN.md gives summary strips `rounded.md` and no border; `error` on `elevated` is unmeasured. Patch: `rounded-md`, no border, alert shown below the strip on the page background. |
| Overdue GET failure hides the strip silently (Blind, Edge) | low | Real but cosmetic; a retry affordance adds branches. Rejected. |
| No test for move failure alert or count change after done/delete/reschedule (Verification) | medium | Real gap, UI-only branches. Deferred to deferred-work.md. |
| DST gap, client vs server "today", midnight rollover, large backlog cap, rate limit, no undo or confirmation, brittle `getByText`, test flaking near midnight (Blind, Edge) | low | Rare or product choices the spec excludes (one explicit action, no per-task UI); fixes add complexity. Rejected. |
| Screenshots only in current theme in e2e (Edge) | low | The four dark/light, 1280/390 screenshots were produced during implementation. Rejected. |
| Strip sits below, not above, the day header (Edge) | false | The strip is rendered after the title row and before the day header, as specified. |
| No CSRF/origin check on the PATCH (Verification) | false | Matches the existing planner routes, which rely on the session guard. |

## Verification

**Commands:**
- `npm run db:generate && npm run typecheck && npm run lint` -- expected: clean
- `npm test`, `npm run test:api`, `npm run test:e2e` (PowerShell, test DB vars) -- expected: all pass
