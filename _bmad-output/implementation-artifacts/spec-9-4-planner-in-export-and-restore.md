---
title: '9-4 Planner in export and restore'
type: 'feature'
created: '2026-11-17'
status: 'done'
baseline_commit: '772bc5c4052970701411742e9e547b86591486cc'
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

**Problem:** Backups (Story 5.2) and restore (Story 5.3) ignore Planner data: a restore leaves the user's Task categories, Tasks, Pomodoro sessions and settings untouched, and the admin read-only user page (Story 7.3) cannot show them.

**Approach:** Add a `planner` section `{ settings, categories[], tasks[], sessions[] }` to `backupExportSchema`. Export writes it, restore replaces the user's Planner data with it verbatim inside the existing transaction, and the read-only user page shows it.

## Boundaries & Constraints

**Always:**
- `backupExportSchema` requires `planner`; `backupRestoreSchema` makes it optional. A backup without it restores with no Planner data: the user's categories, tasks and sessions are deleted and `pomodoroSettings` resets to the defaults.
- Restore stays one transaction. Delete Tasks first (sessions cascade), then categories (`Task.categoryId` is Restrict), then insert categories, tasks, sessions. Fresh ids with relations remapped, like Classes. The XP ledger and `cultivationXp` already restore through `cultivation`; do not re-derive them.
- `findBackupIssues` runs before any write and rejects: duplicate category, task or session ids; a Task whose category is not in the file; a session whose Task is not in the file; more than one session with `endedAt` null (the partial unique index would fail the insert).
- Every export query is scoped by `userId`; domain code stays pure (AD-1); settings are validated with `pomodoroSettingsSchema`.

**Never:**
- No migration and no change to Planner routes or XP write paths.
- Do not touch Class, Folder, Card or cultivation restore behaviour.
- No new dependency, no effects, no hard-coded colours or px sizes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Round trip | User with 2 categories, tasks, a FOCUS and a BREAK session, custom settings | Export then restore into the same or another user gives the same planner shape; ids are new | N/A |
| Old backup | File has no `planner` | Target's Planner data deleted, settings back to defaults | N/A |
| Empty planner | `planner` with empty arrays | Same as an old backup; settings from the file | N/A |
| Broken links | Task points to a missing category, or a session to a missing task | 422 BACKUP_INVALID, nothing changed | issue message per row |
| Two open sessions | Two sessions with `endedAt` null | 422 BACKUP_INVALID | issue message |
| One open session | One session with `endedAt` null | Restored as is | N/A |
| Failure mid-write | DB error | Previous data untouched, 500 RESTORE_FAILED | existing handler |

</frozen-after-approval>

## Code Map

- `packages/domain/src/backup.ts` -- `backupExportSchema`; add `planner` (categories, tasks, sessions rows; settings = `pomodoroSettingsSchema` from `pomodoro.ts`). Column set: see `Task`, `TaskCategory`, `PomodoroSession` in `packages/db/schema.prisma`.
- `packages/domain/src/backup-restore.ts` -- `backupRestoreSchema` (make `planner` optional) and `findBackupIssues` (new checks).
- `packages/domain/src/backup-tree.ts` -- `buildBackupTree`; add a pure `buildBackupPlannerTree` (category -> tasks -> sessions).
- `apps/web/lib/backup-export.ts` -- `buildBackupExport`; add four reads to the existing RepeatableRead `$transaction` and map them.
- `apps/web/app/api/admin/users/[id]/restore/route.ts` -- replace Planner rows in the transaction, set `pomodoroSettings` on the first `updateMany`, add counts to the log and response.
- `apps/web/app/api/admin/users/[id]/export/route.ts` -- no change; it already validates with `backupExportSchema`.
- `apps/web/app/(shell)/admin/users/[id]/page.tsx`, `cultivation-summary.tsx`, `backup-tree-view.tsx` -- add `planner-summary.tsx` beside them, same read-only style (native `<details>`, `tintFor(color)`, `format.ts` formatters).
- Tests: `tests/domain/backup.test.ts`, `tests/domain/backup-restore.test.ts`, `tests/api/admin-export.spec.ts`, `tests/api/admin-restore.spec.ts`, `tests/api/admin-delete.spec.ts` (already covers a category and a task).

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/backup.ts` -- add `planner` to the export schema -- single shared shape
- [x] `packages/domain/src/backup-restore.ts` -- optional `planner`; Planner checks in `findBackupIssues` -- reject inconsistent files before any write
- [x] `packages/domain/src/backup-tree.ts` -- `buildBackupPlannerTree` -- feeds the read-only view
- [x] `apps/web/lib/backup-export.ts` -- export Planner rows, sorted by `createdAt, id` (sessions by `startedAt, id`) -- deterministic file
- [x] `restore/route.ts` -- replace Planner data and settings in the transaction -- verbatim restore
- [x] `apps/web/app/(shell)/admin/users/[id]/planner-summary.tsx` + `page.tsx` -- show settings, categories, tasks (done, estimate / logged minutes) and sessions -- Story 7.3 AC
- [x] Tests listed in the Code Map -- unit for schema, issues and tree; API round trip, old file, broken links, two open sessions, rollback; delete leaves no session rows

**Acceptance Criteria:**
- Given a user with Planner data, when an admin exports then restores it, then categories, tasks, sessions and settings match with new ids and the restored user's XP is unchanged.
- Given a backup without `planner`, when restored, then the user has no categories, tasks or sessions and default settings.
- Given a deleted user who had sessions, then no `pomodoro_sessions` rows remain.
- Given the admin user page, then it shows the Planner section, or an empty state when there is none.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding (layer) | Verdict | Route | Evidence |
|---|---|---|---|
| Duplicate-id message reads "Task categorys" (blind) | low | patch | Real; pluralised labels, test asserts the text. |
| Two categories with names differing by case give 500 not 422 (edge, blind) | medium | patch | `task_categories_userId_lower_name_key` exists; added a check in `findBackupIssues` plus test. |
| `"sessions"` leak guard dropped, not replaced (verification-gap, blind, edge) | medium | patch | Real; export spec now asserts no top-level `sessions` key and no `sessionToken`/`ipAddress`/`userAgent`. |
| Mono on unit and status words in planner-summary (design) | low | patch | DESIGN.md mono rule; only numbers are mono now. |
| No test renders PlannerSummary (verification-gap, blind) | low | defer | Read-only UI shown by screenshots; data shaping unit-tested. |
| Numeric and string ranges unvalidated, NUL title gives 500 (blind, edge) | low | rejected | Admin-only file; DB failure rolls back safely (tested); fix adds guards beyond Story 5.3's own pattern. |
| Session time order, actual/ended consistency, xpAwardedAt vs done, localDay vs startAt (edge) | low | rejected | Restore is verbatim by intent; no user-visible harm shown. |
| XP events reference Tasks and dangle after id remap (blind) | false | rejected | `XpEvent` has no task or category column (schema.prisma). |
| Old file silently wipes Planner data (blind) | false | rejected | Required by the approved intent (frozen block). |
| Open session restored stale (blind, edge) | false | rejected | Spec Design Notes: Story 9.2 auto-closes it on the next planner call. |
| Concurrent session write during restore (edge) | maybe-false | rejected | User-row lock is taken first; at worst low and self-healing. |
| Orphans dropped by `buildBackupPlannerTree`, version bump, "UTC" label, type alias, import path, settings read-fallback logging (blind, edge) | low | rejected | Matches `buildBackupTree`/existing view; no named harm. |
| Settings out of range pass restore (edge) | low | rejected | Zod `pomodoroSettingsSchema` already validates them. |
| `admin-delete` flakes (implementation report) | low | defer | Not Planner-related; different test fails per run (LAST_ADMIN, then Member/Owner admin login) with shared admin accounts in parallel; baseline stash comparison failed. |

## Design Notes

Restoring an open session is safe: any `/api/planner/**` call closes a session past its planned end at its planned length (Story 9.2), so a stale open session settles itself.

## Verification

**Commands:**
- `npm test` (PowerShell, not Git Bash) -- expected: domain Vitest passes
- `npm run typecheck` and `npm run lint` -- expected: no errors
- `npm run test:api -- admin-export admin-restore admin-delete` -- expected: the three specs pass

**Manual checks (if no CLI):**
- Open `/admin/users/<id>` in light and dark themes: the Planner section reads like Cultivation and has no console errors.
