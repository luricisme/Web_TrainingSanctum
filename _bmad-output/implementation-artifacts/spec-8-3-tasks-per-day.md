---
title: 'Story 8.3: Tasks per Day'
type: 'feature'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
baseline_commit: 'deb15c5530d62d6cff1d0b7051d4a24481c5351a'
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

**Problem:** Planner → Tasks shows only a header and a Categories button. A user cannot list what they will do on a day, give it an estimate, tick it off, or earn XP for it.

**Approach:** Add the `/api/planner/tasks` routes (list by day, create, edit, delete, done) and the Tasks day view: day header with ← / → and a date field, Task rows, an Add/Edit Task modal, and a delete confirm. Marking done awards `TASK_DONE` XP once, through a pure `plannerXp`. No migration: the `Task` model shipped in 8.2.

## Boundaries & Constraints

**Always:** Every route returns 401 without a session, is scoped to the user (another user's Task id is 404), and Zod-validates body or query first with field-level errors (AD-6). A Task is free-form: title (trimmed, 1–120), a Category the user owns, `localDay`, optional start time, `estimateMinutes` an integer ≥ 5. The client sends `localDay` as `YYYY-MM-DD` and the start time as `HH:MM`; the server builds `startAt` in `User.timezone` (`localDayStart`) and `localDay` is that day, so a 23:30 start with a 90-minute estimate stays on its day (AD-8). The estimate changes only when the user edits it. Done: one `$transaction` under a row lock on the Task — if `xpAwardedAt` is null, write one `XpEvent(TASK_DONE, questKind null, delta plannerXp(bo,"TASK_DONE"), localDay = the user's today)`, update `User.cultivationXp` with `applyXpDelta`, and set `xpAwardedAt`; always set `done = true`. A second done, or done after reopen, awards nothing. Reopen is `PATCH { done: false }` and keeps `xpAwardedAt`. Deleting a Task deletes it (its sessions arrive with Epic 9). Order: open Tasks first by start time (untimed after timed), then creation; done Tasks muted and last. After done, invalidate the `["cultivation"]` query so the Realm badge updates. UI uses DESIGN.md tokens only, in both themes.

**Never:** No overdue strip or `move-overdue` (8.4). No Start pomodoro item, sessions or logged-minute writes (Epic 9); `loggedMinutes` is read-only here and shows 0. No music field. No planner export, restore or settlement changes. No XP for reopening or penalty. Do not edit the 8.1 switcher, `focus-mode.tsx` or the Category routes. No hard-coded colours.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add | title, category, day, 25 min | 201, row appears at once | N/A |
| Invalid add | blank title, estimate 4, no category, bad time | 400 with `fields` per input | Shown under each input |
| Foreign category | `categoryId` of another user | 400 `fields.categoryId` | Field error |
| Edit | PATCH title, day, estimate, time, category | 200, row updated; estimate untouched unless sent | Other user's or unknown id: 404 |
| Done | POST `/done`, first time | `done` true, one `TASK_DONE` event (+5/10/20/20 by Bộ), `cultivationXp` raised, badge updates | N/A |
| Done again / after reopen | already awarded | `done` true, no new event or XP | N/A |
| Delete | DELETE | 200, gone; confirm names the Task | 404 if not the user's |
| Late start | 23:30, 90 min | belongs to that day | N/A |
| Empty day | no Tasks | "Nothing planned for {day}." and primary "+ Add task" | N/A |
| No categories | open Add task | inline "Create a category" (name field, default tint) before the form | Same `name` errors as 8.2 |
| Over budget | actual 30 / estimate 25 | "30 / 25" in `warning` | N/A |
| Signed out | any route | 401 | Standard envelope |

</frozen-after-approval>

## Code Map

- `packages/db/schema.prisma:360-380` -- `Task` (`done`, `xpAwardedAt`, `loggedMinutes`, `startAt`); reuse, no migration
- `packages/domain/src/pomodoro.ts` -- new: `plannerXp(bo, kind)` ("TASK_DONE" 5/10/20/20, "FOCUS_SESSION" 1/2/4/4); `packages/domain/src/tasks.ts` -- new: create/patch/day-query schemas, `TaskSummary`; export both from `index.ts`
- `packages/domain/src/cultivation.ts` -- `levelForXp` :139 (`bo`), `applyXpDelta` :164; `time.ts` -- `toLocalDate`, `localDayStart`, `DAY_MS`
- `apps/web/app/api/planner/tasks/route.ts` (GET `?day=`, POST), `tasks/[id]/route.ts` (PATCH, DELETE), `tasks/[id]/done/route.ts` -- new; mirror `api/planner/categories/route.ts` and the claim route (`api/cultivation/quests/[kind]/claim/route.ts`: row lock, `xpEvent.create`, `user.update`, `HttpError`)
- `apps/web/lib/api-response.ts`, `session.ts`, `log.ts` -- `requireSession`, `readJson`, `validationFailure`, `ok`, `fail`, `logOperation`
- `apps/web/app/(shell)/planner/tasks-view.tsx` -- extend: day header, list, Add/Edit modal, delete confirm; keep the Categories button
- `apps/web/app/(shell)/planner/categories-key.ts`, `categories-modal.tsx`, `delete-category-modal.tsx` -- query key, `Modal`, `ColourPicker`, form patterns to mirror
- `apps/web/app/components/ui.ts` -- `tintFor`, `buttonPrimary`, `inputClass`, `fieldErrorClass`; `app/(shell)/classes/row-menu.tsx`, `modal.tsx`
- `apps/web/app/(shell)/realm-badge.tsx` -- `["cultivation"]` query to invalidate
- `tests/api/planner-categories.spec.ts` (`newUser`), `tests/domain/task-categories.test.ts`, `tests/e2e/planner-categories.spec.ts` -- test patterns

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/pomodoro.ts`, `tasks.ts`, `index.ts` -- `plannerXp`, Task schemas and types -- shared rules (AD-1)
- [x] `apps/web/app/api/planner/tasks/**` -- list by day, create, edit, delete, done (one transaction, logged) -- AD-6, AD-11
- [x] `apps/web/app/(shell)/planner/tasks-view.tsx` + new task components -- day header, rows, Add/Edit modal with inline first-Category create, delete confirm, done checkbox, empty state -- UI
- [x] `tests/domain/pomodoro.test.ts`, `tests/api/planner-tasks.spec.ts`, `tests/e2e/planner-tasks.spec.ts` -- `plannerXp` at all four Bộ; matrix cases, 401, cross-user 404, XP once, ledger replay equals `cultivationXp`; dark and light screenshots at 1280px and 390px

**Acceptance Criteria:**
- Given Planner → Tasks, when I open it, then I see today with ← / → and a date field and its Tasks in the order above, each with Category chip, title, optional time and mono "actual / estimate"
- Given I tick a Task done, when it was never awarded, then the Realm badge shows the new XP without a reload; unticking and ticking again leaves XP unchanged
- Given a user with no Category, when they add their first Task, then the form offers to create one inline
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Two different Tasks done concurrently race on `cultivationXp` (only the Task row is locked; absolute write, last wins) | medium | Real: `done/route.ts` reads then writes the user's XP without locking the user row, so one award can be lost and the ledger diverges. Patch: lock the user row `FOR UPDATE` first; add a concurrency test on two Tasks. |
| Done/reopen toggle failure gives no feedback; row snaps back | medium | Real: the checkbox mutation has `onSettled` only, no `onError`. Patch: invalidate the day's tasks and show a short alert. |
| Verification gaps: XP `localDay` not asserted; Bộ 2-4 delta not tested through the route; Realm badge update not asserted; PATCH day-only recompute tested only in UTC; concurrent-done statuses unchecked | medium | Pre-verified gaps; each is a spec AC or matrix behaviour with no covering assertion. Patch: add the tests. |
| Date field accepts a 5+ digit year and queries the API with it (400, generic error) | low | Real but cheap: guard `onChange` to `YYYY-MM-DD`. Patch. |
| "Today" is the browser date while XP `localDay` uses `User.timezone`; "Today" does not roll over at midnight in an open tab | low | Real only if the browser and profile timezones differ (the profile timezone is set from the browser at registration) or a tab stays open past midnight. The fix adds a server "today" or a timer. Rejected. |
| XP farming: create, tick, delete a Task repeatedly | low | Real, but a single-user, self-scored ladder; a cap is a product decision the epic does not make. Rejected; recorded in deferred-work. |
| DST gap/overlap in `localDateTimeToInstant`; timezone changed after create then day-only edit | low | Real only on DST-transition times or after a profile timezone change; the fix adds branches. Rejected. |
| PATCH or delete race gives a 500 (P2025); stale delete modal on 404 | low | Needs a second tab; same call as the 8.2 race row. Rejected. |
| Estimate accepts `1e2`; no `take` on the day list; estimate max 1440 not in the spec | low | `1e2` is a valid integer minute count; a day's list is user-bounded; the 24 h cap is sane. Rejected. |
| Checkbox accessible name flips with state | false | "Mark X done" / "Mark X not done" names the action, a standard pattern; the row re-renders with the new state. |
| Checkbox `accent-accent` beside the primary button; list has no `shadow-low`; `font-mono` on the estimate input; `inputClass.replace` | low | DESIGN.md lists a claimed checkbox as an accent use; flat list rows suit the DNA's dense lists; the mono input and class string work. Rejected. |
| Sprint file `in-progress` vs spec `in-review`; empty log sections | false | Step 5 syncs the sprint status; these sections fill in during this pass. |

## Design Notes

`Task.done` is the status flag (the epic's "status = DONE"). `xpAwardedAt`, not `done`, guards the award, so reopen and re-done cannot duplicate XP.

## Verification

**Commands:**
- `npm run db:generate && npm run typecheck && npm run lint` -- expected: clean
- `npm test`, `npm run test:api`, `npm run test:e2e` (PowerShell, test DB vars) -- expected: all pass
