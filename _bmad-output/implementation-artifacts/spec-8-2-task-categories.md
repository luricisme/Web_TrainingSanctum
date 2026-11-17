---
title: 'Story 8.2: Task Categories'
type: 'feature'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
baseline_commit: '9c83041b9a8db7e2e6a5d6b374f361ec1ae5cbe4'
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

**Problem:** The Planner has no data model: Tasks cannot exist without Categories, and there is nowhere to create, recolour or delete a Category. The XP ledger also cannot yet record Planner XP (`questKind` is required, `reason` is only CLAIM or PENALTY).

**Approach:** Ship the epic's single additive migration (`TaskCategory`, `Task`, `XpEvent.questKind` nullable, reasons `FOCUS_SESSION` and `TASK_DONE`), the `/api/planner/categories` routes, and a Categories modal on Planner → Tasks. Colour reuses the Class-colour picker.

## Boundaries & Constraints

**Always:** Category name is unique per user, case-insensitively (DB index on `("userId", lower("name"))`, route pre-check, P2002 caught), with a field-level `name` error (AD-6). Colour is one of the five `ClassColor` tints; a new Category defaults to `nextClassColor(count)`. Every route returns 401 without a session and is scoped to the user; bodies are Zod-validated first. Delete is one `$transaction` (AD-11): "Move tasks to …" re-points Tasks to the chosen Category (must be the user's own, not the one deleted), "Delete tasks too" deletes them; both log a structured line via `logOperation`. If the Category has no Tasks it deletes without the choice. If it is the user's last Category and has Tasks, only "Delete tasks too" is offered. `Task` carries the full epic shape now (title, categoryId, localDay, optional start time, estimate minutes, done and `xpAwardedAt`, logged minutes) so 8.3 needs no migration; `Task.categoryId` is `Restrict` and user deletion cascades. `questKind` becomes nullable with every reader (backup schema, export, restore, admin cultivation summary) updated; existing XpEvents are unchanged and the AD-15 replay still holds. UI uses DESIGN.md tokens only, in both themes.

**Decision (human):** The inline "create a Category" offer on first Task creation is built in Story 8.3, not here. In 8.2 the Categories modal shows an empty state "Create your first category"; that criterion is verified in 8.3.

**Never:** No Task routes or Task UI (8.3), no XP-awarding code, no pomodoro or music fields, no planner section in backup export (Epic 9). Do not reuse `tintAt` (different order); do not edit the 8.1 switcher or `focus-mode.tsx`. No hard-coded colours.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create | name "Study", no colour, user has 2 | 201, colour = `nextClassColor(2)` | N/A |
| Duplicate name | "study" vs existing "Study" | 400 `VALIDATION_ERROR`, `fields.name` "taken" | Field error shown under the input |
| Blank / over-long name | "" or > limit | 400 with `fields.name` | Zod |
| Rename or recolour | PATCH with name and/or colour | 200 updated; same name with other case by the same row is allowed | Unknown id or other user's: 404 |
| Delete, no tasks | DELETE | 200, gone, no choice modal | N/A |
| Delete, move | tasks + `{mode:"move", targetId}` | Tasks re-pointed, Category deleted, one transaction, log line | Bad or self target: 400 `fields.targetId` |
| Delete, delete tasks | `{mode:"delete"}` | Tasks and Category removed, one transaction | Failure: 500 "Nothing was changed." |
| Signed out | any route | 401 | Standard envelope |

</frozen-after-approval>

## Code Map

- `packages/db/schema.prisma` -- `User` relations :58-69, `enum ClassColor` :120, `QuestKind` :293, `XpEventReason` :298, `XpEvent` :320-333 (`questKind` :325); add `TaskCategory`, `Task`, reasons, nullable `questKind`
- `packages/db/migrations/` -- new `20261117030000_add_task_categories/migration.sql`, sorts after `20261117020000_add_class_invitations`; hand-add `CREATE UNIQUE INDEX "task_categories_userId_lower_name_key" ON "task_categories"("userId", lower("name"))` (precedent `20261110000000_add_flashcard/migration.sql:48`)
- `packages/domain/src/classes.ts` -- `CLASS_COLORS` :20, `classColorSchema` :23, `nextClassColor` :28; reuse. Add `packages/domain/src/task-categories.ts` (create/patch/delete schemas, name limit, taken message), exported from the package index
- `packages/domain/src/backup.ts:92-103` -- `questKind` `.nullable()`, `reason` enum gains the two reasons
- `apps/web/lib/backup-export.ts:126`, `apps/web/app/api/admin/users/[id]/restore/route.ts:205` -- type pass-through; verify
- `apps/web/app/(shell)/admin/users/[id]/cultivation-summary.tsx:4,8,45` -- `QUEST_LABEL` null handling, `REASON_LABEL` gains labels
- `apps/web/app/api/classes/route.ts`, `[id]/route.ts` -- pattern: `requireSession`, `readJson`, `validationFailure`, `ok`, `fail`, `HttpError`, `isUniqueViolation` (`lib/api-response.ts`, `lib/prisma-errors.ts`), `logOperation` (`lib/log.ts`)
- `apps/web/app/api/planner/categories/route.ts`, `[id]/route.ts` -- new (GET list, POST; PATCH, DELETE)
- `apps/web/app/(shell)/classes/class-form-modal.tsx` (picker :112-140, default :39-43), `modal.tsx`, `delete-class-modal.tsx`, `classes-view.tsx`, `row-menu.tsx` -- templates to mirror; extract the swatch picker if it can be shared without changing Classes
- `apps/web/app/components/ui.ts` -- `tintFor` :70, `CLASS_COLOR_LABELS` :75, `buttonDanger` :19
- `apps/web/app/(shell)/planner/page.tsx` -- Tasks body: replace the placeholder with a header row and a "Categories" button opening the modal
- `tests/domain/`, `tests/api/classes.spec.ts` (`newUser` :12), `tests/e2e/classes.spec.ts` -- test patterns

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/schema.prisma` + new migration -- models, enum values, nullable `questKind`, case-insensitive unique index -- the epic migration
- [x] `packages/domain/src/task-categories.ts` + `backup.ts` -- schemas; nullable `questKind` and new reasons -- shared validation, restore parses nullable
- [x] `lib/backup-export.ts`, admin restore route, `cultivation-summary.tsx` -- null and new-reason handling -- keep typecheck green and admin view correct
- [x] `apps/web/app/api/planner/categories/**` -- list, create, patch, delete (move or delete in one transaction, logged) -- AD-6, AD-11
- [x] `apps/web/app/(shell)/planner/` -- Categories modal (list rows, create, rename, recolour, delete modal) and Tasks entry button -- UI
- [x] `tests/domain/task-categories.test.ts`, `tests/api/planner-categories.spec.ts`, `tests/e2e/planner-categories.spec.ts` -- matrix cases, 401, cross-user 404, null-`questKind` round trip through backup schema, dark and light screenshots at 1280px and 390px -- coverage

**Acceptance Criteria:**
- Given the migration is applied, then `XpEvent` rows written before it are unchanged and the stats ledger replay still equals `User.cultivationXp`
- Given Planner → Tasks, when I open Categories, then I can create, rename, recolour and delete with the I/O behaviour above
- Given a Category with Tasks, when I delete it, then the modal offers move (default) or delete-tasks-too, and either runs in one transaction with a log line
- Given an admin views a user whose ledger holds a null `questKind` event, then the cultivation summary renders without error
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| User delete cascades into `task_categories` and `tasks` while `tasks_categoryId_fkey` is RESTRICT; no test deletes a user with a Category and a Task | maybe-false (would be high) | Postgres checks RESTRICT immediately, so cascade order decides. A test with a category and a task settles it. Patch: add the test; if it fails, switch the FK to NO ACTION (migration not yet on Neon). |
| Admin cultivation summary with null `questKind` / `TASK_DONE` is not rendered under test | medium | Spec acceptance criterion with no covering test. Patch: seed such an event in `admin-user-view.spec.ts`. |
| Static tint chips under the Tasks header are filler (no task data, no action); `TasksView` also ignores loading and error | low | Real: beyond the spec's "header row and Categories button", DESIGN.md tints have no decorative use. Patch: remove the chips; this also removes one duplicate query key. |
| Category rows are tint-filled with `rounded-md`; DESIGN.md tint tiles use `rounded.lg` | low | Direct one-class fix. Patch: follow DESIGN.md. |
| React Query key hard-coded in three files | low | 8.3 adds consumers. Patch: one shared constant. |
| Tests missing: colour-only PATCH, GET scoped to the user, 390px list and delete shots | low | The spec's test task lists 390px shots. Patch: add them. |
| `Task` model not run through `prisma format` | low | Patch: run it. |
| Backup export/restore omit categories and tasks | false | The epic assigns planner export and restore to Story 9.4; the spec's Never excludes it. |
| Accent `buttonPrimary` for "Move tasks and delete category" | false | The AC makes Move the default, and `delete-class-modal` uses the same pattern; the danger button is on "Delete tasks too". |
| Stacked modals (scrim, Escape, focus); "Delete everything" overline plus divider | maybe-false | Could not be settled from the diff; both would be low. Rejected. |
| Races: task added or move target deleted mid-transaction gives a 500; stale `targetId` and `taskCount` in the delete modal | low | Tasks cannot be created until 8.3 and only from another tab. The fix adds locking or P2003 branches. Rejected. |
| DELETE with a malformed body on a zero-task category deletes it | false | By design: the spec says a Category with no Tasks deletes without a choice. |
| Composite FK for task owner; CHECK constraints on minutes; null `questKind` tied to reasons | low | Task routes (8.3) validate with Zod; the constraints add schema complexity. Rejected. |
| No category cap; create and rename not logged; early rejections not logged; "Delete tasks too" lacks a count or confirm | low | Beyond the AC, which asks for a log line on delete. Rejected. |
| `ADD VALUE` in the same migration | false | Nothing in the file uses the new values, and the migration applied to the test DB. |
| `REASON_LABEL` fallback, `useId`, backup version bump, form state discarded on switching rows, `Modal`/`ui` imports across folders | false | Closed enum under typecheck, or negligible; `classes/ui` re-exports the shared module. Rejected. |
| `backup-export.ts` and restore route not in the diff | false | The spec said to verify them; typecheck shows null passes through. |

## Design Notes

Task and category deletion rules are enforced in the route inside the transaction rather than by cascade, so the move path never loses Tasks: `Task.categoryId` is `onDelete: Restrict`.

## Verification

**Commands:**
- `npm run db:generate && npm run typecheck && npm run lint` -- expected: clean
- `npm test`, `npm run test:api`, `npm run test:e2e` (PowerShell, test DB vars) -- expected: all pass

**Manual checks (if no CLI):**
- Apply the migration to Neon with the code (`npm run db:migrate:deploy`) and open the app: no page 500s
