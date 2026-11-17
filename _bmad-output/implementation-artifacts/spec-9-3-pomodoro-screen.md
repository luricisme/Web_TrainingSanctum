---
title: 'Story 9.3: Pomodoro Screen'
type: 'feature'
created: '2026-11-17'
status: 'done'
baseline_commit: '4f1c5ca02665336d9979c04f490f16b7dc5825bd'
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

**Problem:** Stories 9.1–9.2 built the plan engine and server-truth sessions, but `/planner/pomodoro` is still a placeholder, so a user cannot run a plan, answer "Done?", or see a session's time.

**Approach:** Build the Pomodoro screen on the existing APIs: pick a Task (`?task=<id>`), show the Plan strip and a countdown derived from the server's `startedAt`, and drive Start / Stop / Done / Not yet / +1 session. Add one read route for a Task's sessions and a "Start pomodoro" row action.

## Boundaries & Constraints

**Always:** The client never keeps elapsed time: remaining = `startedAt + plannedMinutes − now`, re-synced on focus and visibility change. Breaks and every next session wait for Start. Copy follows EXPERIENCE.md ("Done?", "Not yet", "+1 session (n of 2 left)", "Edit the estimate to continue."). After any session end or resync, invalidate `["cultivation"]` (a sweep awards XP silently). Next step is derived by a pure, vitest-tested domain function (AD-1); the UI only renders it.

**Never:** No auto-start, no auto-answer countdown on the Done card, no ring or timer animation, no music (Epic 11), no focus mode, no new migration, no change to 9.2 session semantics or XP. No hard-coded colours; tokens only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh plan | Task 90 est., 50 logged | Strip from 40 min: 25 · 5 · 15; Start runs 25 | N/A |
| Focus ends, time left | Last ended = FOCUS, remaining > 0 | Idle, "Break · 5:00", waits for Start | N/A |
| Break ends | Last ended = BREAK | Next focus offered, waits for Start | N/A |
| Stop early | Running FOCUS stopped | Minutes logged, strip shows what is left; next step is a break; nothing continues | N/A |
| Plan done | Last focus ended, remaining 0 | Inline Done card: Done / Not yet | N/A |
| Not yet | overrun used < 2 | "+1 session (n of 2 left)" starts FOCUS `overrun: true` | 409 shown inline |
| Not yet, cap | overrun used = 2 | "Edit the estimate to continue." + Edit link; no +1 | N/A |
| Running elsewhere | Running session on another Task | "A session is running on {Task} — {m:ss} left." + link; Start disabled | N/A |
| Natural expiry | Countdown reaches 0 | Refetch running (server sweep completes it); retry ~1 s while still running | N/A |
| Task done / missing | Done Task or bad `?task` | Done Task: Start disabled, "This Task is done."; missing: picker | 404 → picker |

</frozen-after-approval>

## Code Map

- `packages/domain/src/pomodoro.ts` -- `planPomodoro`, `remainingMinutes`, `overrunSessionsUsed`, `planNextSession`, `MAX_OVERRUN_SESSIONS`, `SessionSummary`; add the pure next-step/strip function here (exported via index).
- `apps/web/lib/planner-sessions.ts` -- `toSessionSummary`, sweep; reuse, do not change.
- `apps/web/app/api/planner/tasks/[id]/route.ts` -- has PATCH/DELETE only; add GET returning the Task plus its sessions.
- `apps/web/app/api/planner/sessions/route.ts`, `sessions/[id]/end`, `sessions/running` -- start (201, 409 `SESSION_RUNNING`/`SESSION_REFUSED`), end, running; consume only.
- `apps/web/app/(shell)/planner/pomodoro/page.tsx` -- placeholder; replace.
- `apps/web/app/(shell)/planner/tasks-view.tsx` -- `TaskRow`/`RowMenu` lacks "Start pomodoro"; done flow (`POST tasks/[id]/done`, invalidates tasks/overdue/cultivation/categories) to reuse for the Done card.
- `apps/web/app/(shell)/session-exit.tsx` -- window keydown pattern for Space/Esc; `lib/keyboard.ts` `isTextField`.
- `apps/web/app/(shell)/realm-badge.tsx` -- reads `["cultivation"]`.
- `apps/web/app/components/ui.ts`, `section-marker`, `globals.css` -- buttons, `tintFor`, mono/display tokens (override weight to 600 per DESIGN.md).
- `_bmad-output/.../DESIGN.md` l.415–416 -- flip plan-strip and countdown to "built".
- `tests/domain/pomodoro.test.ts`, `tests/api/planner-sessions.spec.ts`, `tests/e2e/planner-tasks.spec.ts` -- patterns (`register()`, `shoot()`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/pomodoro.ts` -- add pure function: from task, sessions, settings return strip pills (ended ticked, current, upcoming, overrun "+"), next step (FOCUS / BREAK / overrun FOCUS / done-card / exhausted), remaining and overrun left -- single tested source for the screen
- [x] `tests/domain/pomodoro.test.ts` -- cover the matrix rows (40-left plan, break after focus, stop early, cap, nothing remaining)
- [x] `apps/web/app/api/planner/tasks/[id]/route.ts` -- GET `{ task, sessions }`, 404 if not the user's -- screen needs history to plan
- [x] `apps/web/app/(shell)/planner/pomodoro/` -- page, Task picker (today's open Tasks), plan strip, mono countdown, Start/Stop, break line, Done card, running-elsewhere banner, Space/Esc, visibility resync, cultivation invalidation
- [x] `apps/web/app/(shell)/planner/tasks-view.tsx` -- add "Start pomodoro" to the row menu linking to `/planner/pomodoro?task=<id>`
- [x] DESIGN.md -- mark plan-strip and countdown built
- [x] `tests/api/planner-sessions.spec.ts`, `tests/e2e/pomodoro.spec.ts` -- GET task route; start→stop→Done flow with dark/light screenshots

**Acceptance Criteria:**
- Given a reload, tab switch or second device, when the page shows, then the countdown shows the same remaining time.
- Given the Done card, when I press Esc, then it closes; Space starts/stops only when no text field or button has focus.
- Given Done, when pressed, then the Task is marked done (Story 8.3) and the Realm badge updates.
- Given UI conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, then it is checked against a screenshot in both dark and light themes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Pass 1 (blind, edge-case, verification-gap, design-fidelity). Routes: all patch; no intent_gap or bad_spec.

| Finding | Verdict | Evidence / route |
|---|---|---|
| Esc on "Not yet" card leaves notYet true, so plain Start can start an overrun focus; cardHidden never reset | medium | Verified in pomodoro-screen.tsx: cardOpen false while startable true for overrun FOCUS. patch |
| Space/Esc act behind the open TaskModal | low | Handler has no `editing` guard. patch (one line) |
| Stale plan after Stop (running nulled before task refetch) | medium | stop.onSuccess clears RUNNING_KEY; history still lacks the session. patch |
| Start enabled before running query resolves (409 on click) | low | startable ignores runningQuery state. patch |
| Settings fall back silently to defaults while loading/error | medium | `settingsQuery.data ?? DEFAULT`. patch |
| Disabled accent Start when not actionable | low | one-accent rule in DESIGN.md. patch |
| Done pills double text class; border-2 on every pill | low | className holds two text classes; DESIGN.md hairline tint edges. patch |
| Off-scale spacing (mt-10, p-5, gap-1.5); Done card without elevation | low | direct correction. patch |
| Task list stale after estimate edit; cultivation not invalidated on start | low | onClose/start.onSuccess. patch |
| Gaps: row action, resync/expiry, parity with planNextSession, running BREAK / overrun unit cases | medium | verification-gap filed evidence. patch |
| Expiry refetch polls every second with no cap | false | Spec says "retry ~1 s"; no failing case shown |
| Duplicate caption "Focus · 25:00" | false | Spec copy: "Break · 5:00" |
| Warning colour on overrun session; mixed alignment; skeleton radius | low | cosmetic, unlikely to be met; fix adds branches. rejected |
| longBreakEvery 0 / overrun length vs server | false | schema min 2; planNextSession overrun uses settings.focus |
| Unbounded GET sessions; array `?task`; tint.split; aria-label churn; Start pomodoro on done Tasks | low | not met in everyday use. rejected |
| Realm badge UI assertion and cap-path e2e | low | DB assert exists; domain covers cap. defer |
| Client clock skew in countdown | maybe-false (medium, unverified) | Spec decision (derive from startedAt); would need server-time offset. defer |
| Spec hygiene, EXPERIENCE.md writeback, "Not yet" not persisted on reload | low | spec edits rejected; not required. rejected |

## Design Notes

Natural expiry: never call `end` when the countdown hits 0 (client clock skew could log 24 of 25 min). `GET sessions/running` runs the sweep, which closes the session at its planned end as completed.

Next step after a stopped focus is a break (server requires one ended focus before a break); after a break, a focus.

## Verification

**Commands:**
- `npm run test` (PowerShell, test DB env vars) -- expected: domain tests pass
- `npm run test:api` and `npm run test:e2e -- pomodoro` -- expected: pass
- `npm run typecheck` and `npm run lint` -- expected: clean
