---
title: 'Track per category and task (story 11.2)'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_commit: 'a06036bb2ca5215847bca4498f045aefd2e252b9'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 11.1 can search Jamendo, but a user cannot say which track belongs to a Category or a Task, so 11.3 has nothing to play.

**Approach:** Add a nullable `musicTrack` (`{ source: "jamendo", trackId }`) to `TaskCategory` and `Task`, a "Music" field in the Category edit form and the Task modal (search, pick, "None"), and carry it through the API summaries and backup export/restore.

## Boundaries & Constraints

**Always:** Migration is additive and deployed to Neon with the code. The stored value is only `{ source, trackId }`; title, artist and licence are fetched via `GET /api/planner/music/[trackId]` for display, never stored. A Task's track overrides its Category's; `null` on a Task means "inherit the Category's". "None" stores `null`. The last picked track is offered first (per browser, `localStorage`, guarded). Attribution (title · artist · licence, licence linked) shows beside the field. Old backups without `musicTrack` still restore (default `null`). The Music field degrades to a quiet "Music unavailable" line when Jamendo fails; saving the rest of the form is never blocked. UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

**Never:** No player or playback (11.3). No second music source. No outbound HTTP outside `lib/music/`. No storing of track metadata or audio.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pick on Category | search, choose a track, Save | `musicTrack` saved; attribution shown | N/A |
| Task override | Task picks a track; Category has another | Task row holds its own `musicTrack` | N/A |
| None | choose "None" and Save | `musicTrack` is `null` | N/A |
| Bad shape | PATCH `musicTrack: { source: "x" }` | 400 `VALIDATION_ERROR` | field message |
| Jamendo down | open modal with a stored track | attribution replaced by "Music unavailable"; form still saves | no throw |
| Old backup | restore file with no `musicTrack` | rows restored with `null` | N/A |

</frozen-after-approval>

## Code Map

- `packages/db/schema.prisma` -- `TaskCategory` (~346) and `Task` (~364): add `musicTrack Json?`; new migration under `packages/db/migrations/` (pattern: `20261117030000_add_task_categories`); next timestamp after `20261117040000`.
- `packages/domain/src/` -- new `music.ts`: `musicTrackSchema` (`source: z.literal("jamendo")`, `trackId` non-empty), `MusicTrackRef`; export from `index.ts`. `task-categories.ts` (create/update schemas, `TaskCategorySummary`) and `tasks.ts` (`createTaskSchema`, `updateTaskSchema`, `TaskSummary`) gain optional nullable `musicTrack`; the update refine must count it as a field.
- `packages/domain/src/backup.ts` (`backupPlannerSchema`, ~42-70) -- add `musicTrack: musicTrackSchema.nullable().default(null)` to categories and tasks.
- `apps/web/lib/backup-export.ts` (~138-155) -- emit `musicTrack`. `apps/web/app/api/admin/users/[id]/restore/route.ts` (~215-236) -- carry it into `categoryRows` / `taskRows`. Check the user restore route and `backup-tree.ts` for the same rows.
- `apps/web/app/api/planner/categories/route.ts`, `categories/[id]/route.ts`, `tasks/route.ts`, `tasks/[id]/route.ts`, `apps/web/lib/planner-tasks.ts` (`taskInclude`, `toTaskSummary`, `toCalendarTask` spreads the summary) -- accept and return `musicTrack`. Use `Prisma.JsonNull` to clear a Json column.
- `apps/web/app/(shell)/planner/categories-modal.tsx` (`CategoryForm`) and `task-modal.tsx` (`TaskForm`) -- add the Music field; build one shared `music-field.tsx` there (search input, result list, "None", attribution) using `apiFetch` against the 11.1 routes (`lib/music/types.ts` `Track`).
- `tests/domain/task-categories.test.ts`, `tests/api/planner-categories.spec.ts`, `tests/api/admin-export.spec.ts`, `admin-restore.spec.ts`, `tests/e2e/planner-tasks.spec.ts` -- extend; `vitest.config.ts` runs only `tests/domain/**`.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/db/schema.prisma` + new migration -- `musicTrack Json?` on both models; deploy to Neon with the code -- storage
- [ ] `packages/domain/src/music.ts`, `task-categories.ts`, `tasks.ts`, `backup.ts`, `index.ts` -- schemas, summary types, backup shape -- one validated source of truth
- [ ] `apps/web/lib/backup-export.ts`, admin restore route (and the user restore route if separate) -- round-trip `musicTrack` -- backup parity
- [ ] categories and tasks routes + `lib/planner-tasks.ts` -- accept/return `musicTrack` -- API
- [ ] `music-field.tsx`, `categories-modal.tsx`, `task-modal.tsx` -- Music field, last-picked-first, attribution -- UI
- [ ] tests listed in the Code Map -- schema edge cases, route round-trip, export/restore round-trip incl. old backup

**Acceptance Criteria:**
- Given a Category and a Task each with a track, when the user exports and restores, then both `musicTrack` values come back.
- Given a track was just picked, when the user opens another Music field, then that track is offered first.
- Given Jamendo is unreachable, when a modal opens, then the field shows "Music unavailable" and Save still works.
- Given the story is built, then the migration is applied to Neon and the dev server's pages still load.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route / evidence |
|---|---|---|
| trackId unconstrained; "search" collides with the search route (blind, edge-case) | medium | patch. Id is interpolated into `/music/[trackId]`; "search" resolves to the list route. Digits-only. |
| Task edit compares only trackId, not source (blind, edge-case, gap) | low | patch. Direct one-line correction. |
| musicTrack in Fields errors but no fieldError rendered (blind, edge-case) | low | patch. One render line. |
| Label span unreferenced, no group role (blind) | low | patch. Small a11y fix. |
| Search retry with unchanged query does nothing after failure (edge-case) | medium | patch. `retry:false` plus same queryKey. |
| Category modal Music field has no UI test (gap) | medium | patch. Mutation of the save body would pass all tests. |
| Task inheritance display, edit persistence, valid PATCH untested (gap) | medium | patch. A title-only save wiping the track would pass. |
| Double blank line in admin-restore spec; schema.prisma alignment (blind) | low | patch. Cosmetic one-liners. |
| Last-pick dedupe/current-track filter untested (gap) | low | rejected. UI cosmetic, test would add scaffolding. |
| Restore of malformed musicTrack fails the whole parse (blind, edge-case) | low | rejected. Strict parse matches every other field; `.catch` adds a silent-data-loss branch. |
| parseMusicTrack maps corrupt JSON to null silently (blind, edge-case) | low | rejected. Only written through the validated routes; a log adds noise. |
| BACKUP_VERSION not bumped (blind) | false | Additive field with `.default(null)`; old files restore as null (tested). |
| lastPick not keyed by user (blind) | low | rejected. Spec says per browser; a personal convenience. |
| Empty search falls back to tag lofi (blind) | low | rejected. Deliberate default; harmless. |
| useTrack `ref!` assertion (blind) | low | rejected. Guarded by `enabled`; style only. |
| No Jamendo existence check on write (blind) | low | rejected. Would make saves depend on Jamendo; spec says degrade. |
| 404 vs outage not distinguished; last-pick fetch failure silent (edge-case) | low | rejected. No spec behaviour asked; fix adds branches. |
| Category PATCH always sends musicTrack; concurrent-tab overwrite (edge-case) | low | rejected. Single user, last write wins like the other fields. |
| Migration not evidenced as deployed to Neon (edge-case) | false | Implementer applied `migrate deploy` to Neon; I re-check status in verification. |
| Single-theme e2e; Category degraded path (edge-case) | low | rejected. Screenshots taken in both themes by the shoot helper. |
| Task "None" hidden when null / no silence option (edge-case) | low | rejected. Decision recorded in Design Notes. |
| Track box uses bg-background, player spec says card (design) | low | rejected. DESIGN.md Inputs rule makes fields `bg` inside card modals; no music-field component exists. |

## Design Notes

"None" on a Task clears its override, so it falls back to the Category's track; a Task cannot be silenced when its Category has a track (decision recorded; revisit if wanted). Last-picked track is stored as `{ source, trackId }` in `localStorage` under one key and re-fetched for display.

## Verification

**Commands:**
- `npm test` (PowerShell) -- expected: all pass
- `npm run lint` and `npm run build` -- expected: clean
- `npx prisma migrate deploy` against Neon (see memory note) -- expected: migration applied
