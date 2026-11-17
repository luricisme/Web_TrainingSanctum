---
title: 'Story 9.1: Pomodoro Plan Engine and Settings'
type: 'feature'
created: '2026-11-17'
status: 'in-progress'
baseline_commit: '0610890ca2eb11624bfce88c173fc57642b064cb'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing yet defines what a Pomodoro plan is, so the timer, the calendar block and the "Done?" prompt (Stories 9.2–9.3, Epic 10) could each compute it differently, and a user cannot set their focus and break lengths.

**Approach:** Add the pure plan engine to `packages/domain/src/pomodoro.ts`, the `PomodoroSession` table and `User.pomodoroSettings` in one additive migration, `GET`/`PATCH /api/planner/settings`, and a Pomodoro card on Settings. No timer, session route or XP write here.

## Boundaries & Constraints

**Always:** Domain functions are pure (AD-1, AD-12): `planPomodoro(remaining, settings)` returns `{ kind: "FOCUS" | "BREAK", plannedMinutes }[]` — full focus sessions of `focus`, a break after each that is long after every `longBreakEvery`-th focus session and short otherwise, one final focus session for the remainder (never rounded up), and no break after the last focus session; `remaining ≤ 0` gives `[]`. `remainingMinutes(task, sessions)` = `max(estimateMinutes − Σ actualMinutes of FOCUS sessions, 0)`; `overrunSessionsUsed(sessions)` counts FOCUS sessions with `overrun`; `planLengthMinutes(plan)` sums planned minutes. `plannerXp` already exists; keep it. Settings schema: integers, focus / short / long 5–90, `longBreakEvery` 2–8, defaults `{ focus: 25, shortBreak: 5, longBreak: 15, longBreakEvery: 4 }`; a stored value that fails the schema reads as the defaults. Migration `PomodoroSession (userId, taskId, kind FOCUS|BREAK, plannedMinutes, actualMinutes?, startedAt, endedAt?, overrun)`, cascades from user and Task, partial unique `(userId) WHERE "endedAt" IS NULL` as raw SQL at the end of the migration. Both routes return 401 without a session, are scoped to the user and Zod-validate first (AD-6); PATCH takes a partial object (at least one known key, unknown keys rejected), merges it into the stored settings in one `$transaction` under a `users` row lock, logs `planner.settings.update`, and returns the full settings. Settings card: four number fields, a value is saved on blur or Enter when valid and changed; "Saved" quietly; a failed save rolls back to the server value with an alert; an out-of-range value shows a field error and sends nothing. UI uses DESIGN.md tokens only, in both themes.

**Never:** No session or timer route, no XP write, no Pomodoro screen (9.2, 9.3). `backupExportSchema`, export, restore and the user page are not touched (9.4). `Task.loggedMinutes` is not written here. No change to `/api/settings` or the study directions control. No hard-coded colours.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plan | 90, defaults | 25·5·25·5·25·5·15 | N/A |
| Edges | 0; 10; 25; 50; 100 | `[]`; 10; 25; 25·5·25; 25·5·25·5·25·5·25 | N/A |
| Long break | 125 with `longBreakEvery` 2 | 25·5·25·15·25·5·25·5·25 | N/A |
| Remaining | estimate 90, focus actual 25 + 20, break 5 | 45 | N/A |
| Over logged | actual above estimate | 0 | N/A |
| Defaults | new or pre-migration user | GET returns the four defaults | N/A |
| Partial save | PATCH `{ focus: 30 }` | 200, full settings, others unchanged | N/A |
| Invalid | focus 4 or 91, every 1 or 9, 25.5, `{}` or unknown key | 400 `fields` per key, nothing saved | Field error in the card |
| Signed out | either route | 401 | Standard envelope |
| Save fails | PATCH 5xx | Field returns to the server value, alert "Could not save your Pomodoro settings." | Edit again |

</frozen-after-approval>

## Code Map

- `packages/domain/src/pomodoro.ts` (has `plannerXp`; add engine, `pomodoroSettingsSchema`, `updatePomodoroSettingsSchema`, `DEFAULT_POMODORO_SETTINGS`, `parsePomodoroSettings`, `PomodoroSettings`); already exported from `index.ts`
- `packages/db/schema.prisma` -- `User` (add `pomodoroSettings Json @default(...)`, `pomodoroSessions`), `Task` (add `sessions`), new `PomodoroSession` and `PomodoroKind`; new `packages/db/migrations/20261117040000_add_pomodoro_sessions/migration.sql` (pattern: `20261117030000_add_task_categories`, `..._add_class_invitations` for the partial index and its schema comment)
- `apps/web/app/api/planner/settings/route.ts` -- new; mirror `app/api/settings/route.ts` and the `FOR UPDATE` use in `admin/users/[id]/password/route.ts`; `lib/api-response.ts`, `lib/log.ts`
- `apps/web/app/(shell)/settings/page.tsx` (add a section) and new `pomodoro-settings.tsx`; reuse the `study-directions.tsx` save pattern (queued `scope`, rollback, "Saved") and `app/components/ui.ts` (`inputClass`, `labelClass`, `fieldErrorClass`, `formErrorClass`)
- `tests/domain/pomodoro.test.ts` (extend), `tests/api/planner-settings.spec.ts` (new; pattern `tests/api/settings.spec.ts`), `tests/e2e/settings.spec.ts` (extend)
- Do not change: `app/api/settings/**`, `study-directions.tsx`, `lib/backup-export.ts`, `domain/src/backup*.ts`

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain/src/pomodoro.ts`, `tests/domain/pomodoro.test.ts` -- engine, schemas, defaults; unit tests for the matrix, `longBreakEvery` boundary, schema bounds and invalid stored JSON -- AD-1, AD-12
- [ ] `packages/db/schema.prisma`, new migration -- table, enum, setting column, partial index; `npm run db:generate` -- AD-17
- [ ] `apps/web/app/api/planner/settings/route.ts`, `tests/api/planner-settings.spec.ts` -- GET/PATCH, 401, validation, merge, cross-user isolation, concurrent patches of different keys, a second running row for one user rejected by the index -- AD-6
- [ ] `settings/page.tsx`, `pomodoro-settings.tsx`, `tests/e2e/settings.spec.ts` -- Pomodoro card, save on blur/Enter, reload keeps it, error path; dark and light screenshots at 1280px and 390px

**Acceptance Criteria:**
- Given 90 remaining and default settings, when `planPomodoro` runs, then it returns 25·5·25·5·25·5·15, and the functions import nothing from next, react, prisma or HTTP
- Given the migration is applied, then one user can hold at most one session with `endedAt` null, deleting a user or Task removes its sessions, and existing users read the defaults
- Given Settings, when I change a value to a valid number and leave the field, then it is saved, "Saved" shows, and it survives a reload; an invalid value saves nothing and says why
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes

## Implementation Notes

- `remainingMinutes` takes sessions as its source of truth (architecture). `Task.loggedMinutes` stays the denormalised display figure; Story 9.2 decides how it is kept in step when it writes sessions.
- The Neon deploy of this migration is run only after the suite passes and the human confirms (dev server uses Neon; undeployed, every page returns 500). A dry-run of `prisma migrate` drift on the partial index is checked on the test DB first.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run db:generate && npm run typecheck && npm run lint` -- expected: clean
- `npm test`, `npm run test:api`, `npm run test:e2e` (PowerShell, test DB vars) -- expected: all pass
