---
title: 'Story 9.2: Server-Truth Sessions'
type: 'feature'
created: '2026-11-17'
status: 'done'
baseline_commit: '809cb3d4afe94cf51261d8914e7cbc31527427ba'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The plan exists (9.1) but nothing runs it: no session can be started, ended or recovered after a reload, the one-running-session and overrun rules are unenforced, and a finished focus session earns nothing.

**Approach:** Add `POST /api/planner/sessions`, `POST /api/planner/sessions/[id]/end` and `GET /api/planner/sessions/running`, a pure `planNextSession` in the domain, and an expired-session sweep that runs at the start of every `/api/planner/**` route. No UI (9.3), no export (9.4).

## Boundaries & Constraints

**Always:** The client never sends elapsed time; `startedAt = now`. `plannedMinutes` comes from the domain: FOCUS = `min(focus, remaining)`; an overrun FOCUS = `focus`; BREAK = long when the Task's ended FOCUS count is a multiple of `longBreakEvery`, else short. `overrun = true` is valid only when `remaining = 0` and `overrunSessionsUsed < 2`; `overrun = false` FOCUS needs `remaining > 0`; BREAK needs `remaining > 0` and at least one ended FOCUS; a done Task starts nothing. All refusals are `409` in the standard envelope; invalid body is `400` (Zod first). One running session per user: a second start is `409`, two concurrent starts leave one row (lock the user row, and map the partial-index unique violation to `409`). End: `endedAt = now`, `actualMinutes = floor(min(elapsed, planned) / 60000)` minutes; ending an already-ended session returns `200` unchanged with no second XP. Sweep: any `/api/planner/**` call first closes a session past its planned end at `startedAt + planned`, `actualMinutes = plannedMinutes`; wire it through one helper used by every existing planner route. A FOCUS session ending with `actualMinutes ≥ 1` writes, in one `$transaction` (lock `tasks` row then `users` row, same order as `done`), one `XpEvent(FOCUS_SESSION, questKind null, localDay = the Task's localDay, delta = plannerXp(bo, "FOCUS_SESSION"))`, updates `User.cultivationXp` via `applyXpDelta`, and adds `actualMinutes` to `Task.loggedMinutes`. BREAK writes no XP. Every route is 401 without a session, user-scoped (another user's Task or session is `404`), and each write logs `logOperation`.

**Never:** No UI, no change to `backupExportSchema`, export, restore or the user page. No automatic break start. No quest or settlement reads of Planner tables. Sleep/offline rule (recorded assumption, `deferred-work.md`): a session found expired counts as completed at its planned length.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Start focus | Task 90 min, no sessions | `201` `{id, taskId, kind, plannedMinutes: 25, startedAt, overrun: false}` | N/A |
| Remainder | 10 min left | plannedMinutes 10 | N/A |
| Break | 4th ended FOCUS, `every` 4 | plannedMinutes 15 (else 5) | N/A |
| Second start | a session running | `409` | Envelope |
| Concurrent starts | two at once | one `201`, one `409`, one open row | N/A |
| Overrun | remaining 0, 2 used | `409`; with 1 used, `201` planned `focus` | Envelope |
| Wrong overrun | overrun true with remaining > 0; or false with 0 | `409` | Envelope |
| End early | 10 min into 25 | `actualMinutes` 10, 1 XP event, `loggedMinutes` +10 | N/A |
| End under 1 min | 30 s | `actualMinutes` 0, no XP | N/A |
| Expired | 25-min session, 3 h later, any planner call | closed at planned end, 25 min, XP written | N/A |
| Re-end | already ended | `200`, no new XP | N/A |
| Running | none / one | `{ data: null }` / the session | N/A |
| Signed out | any route | `401` | Envelope |

</frozen-after-approval>

## Code Map

- `packages/domain/src/pomodoro.ts` -- add `startSessionSchema` (`taskId`, `kind`, `overrun` default false) and pure `planNextSession(input, settings)` returning `{ plannedMinutes }` or `{ refusal }`; reuse `remainingMinutes`, `overrunSessionsUsed`, `plannerXp`; `SessionSummary` type for responses
- `apps/web/lib/planner-sessions.ts` -- new: `sweepExpiredSession(userId)`, `endSessionTx` (shared by end route and sweep), `toSessionSummary`, `requirePlannerSession(request)` (= `requireSession` + sweep)
- `apps/web/app/api/planner/sessions/route.ts`, `sessions/[id]/end/route.ts`, `sessions/running/route.ts` -- new
- `apps/web/app/api/planner/tasks/[id]/done/route.ts` -- pattern for the lock + `XpEvent` + `applyXpDelta` transaction; `lib/prisma-errors.ts` `isUniqueViolation`; `lib/api-response.ts` `HttpError`
- Existing planner routes to switch to `requirePlannerSession`: `categories/route.ts`, `categories/[id]/route.ts`, `settings/route.ts`, `tasks/route.ts`, `tasks/[id]/route.ts`, `tasks/[id]/done/route.ts`, `tasks/overdue`, `tasks/move-overdue`
- `tests/domain/pomodoro.test.ts` (extend), `tests/api/planner-sessions.spec.ts` (new; pattern `tests/api/planner-tasks.spec.ts`)
- Do not change: `schema.prisma`, migrations, `lib/backup-export.ts`, `domain/src/backup*.ts`

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/pomodoro.ts`, `tests/domain/pomodoro.test.ts` -- `startSessionSchema`, `planNextSession`; unit tests for the matrix rules (long-break boundary, remainder, overrun cap, wrong overrun) -- AD-1, AD-12
- [x] `apps/web/lib/planner-sessions.ts` -- sweep, shared end transaction, summary mapper, `requirePlannerSession` -- AD-17
- [x] the three session routes -- start, end, running -- AD-6, AD-10
- [x] the eight existing planner routes -- call `requirePlannerSession` instead of `requireSession` -- AD-17
- [x] `tests/api/planner-sessions.spec.ts` -- every matrix row, 401s, cross-user 404, concurrent starts, XP by Bộ and ledger sum unchanged, expired sweep triggered by a different planner route, Task delete removes sessions

**Acceptance Criteria:**
- Given a session past its planned end, when any `/api/planner/**` route is called, then it is closed at its planned end before the route answers
- Given a FOCUS end with ≥ 1 actual minute, then the `XpEvent` sum still equals `User.cultivationXp` (AD-15)
- Given the new functions, then the domain imports nothing from next, react, prisma or HTTP

## Implementation Notes

- `Task.loggedMinutes` is kept in step by the end transaction; `remainingMinutes` still reads sessions as the truth.
- No migration. Run `npm run db:generate` only if the client is stale.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route / evidence |
|---|---|---|
| Sweep throws 404 when session/Task deleted mid-sweep, 500s every planner route | medium | patch: swallow 404 in sweep |
| Start checks running (409) before Task lookup, so foreign taskId gives 409 | medium | patch: Task lookup first; test added |
| Sweep wiring on 7 routes and concurrent end have no test | low | patch: tests added (sweep per route family, concurrent end, 404 order) |
| 0-minute FOCUS counts toward break unlock and overrun cap | low | rejected: harmless, fix changes semantics |
| Sweep XP not visible outside planner routes until next planner call | low | defer: matches AD-17 ("any /api/planner route"); revisit with 9.3 |
| Offline completion farmable | false | already recorded as an accepted assumption in deferred-work.md |
| XP/loggedMinutes on a Task done mid-session | false | the focus time was real; no harm |
| End response lacks XP; endedAt may exceed planned in a race; Bo at sweep time; log fields; taskId length; untested 401 on old routes/BREAK sweep | low | rejected: additive or negligible |
| Spec bookkeeping (status, Verification log) | false | step-05 syncs status; no Verification record is required |

## Verification

**Commands:**
- `npm run typecheck && npm run lint` -- expected: clean
- `npm test`, `npm run test:api` (PowerShell, test DB vars) -- expected: all pass
