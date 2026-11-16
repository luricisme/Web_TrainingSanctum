---
title: 'Story 5.3: Restore from Backup (admin-only)'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_commit: '96f10dad49dbe2dc7d92a5d621b6fafe67cb5b8e'
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

**Problem:** An admin can download a user's backup (5.2) but cannot put it back. A bad import or a lost row has no recovery path inside the app.

**Approach:** Add `POST /api/admin/users/[id]/restore` (behind `requireAdmin()`) that validates a backup file against the shared schema and replaces the target user's Classes, Folders, Flashcards, Cards, Scheduling Records and cultivation data inside one Prisma `$transaction` (AD-11). On the admin user page, add a Restore control: choose a `.json` file, see a confirmation modal that names the target user and states the consequence (UX-DR7: Confirm/Cancel, no type-to-confirm), then restore. UI conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

## Boundaries & Constraints

**Always:** Restore replaces, never merges: the target's Classes (cascading to Folders, Flashcards, Cards, Scheduling Records), `CultivationDay` and `XpEvent` rows are deleted, then the file's rows are created, in one transaction; any failure leaves prior state untouched. Restore verbatim: names, Card text fields, record `interval`/`repetitions`/`easeFactor`/`nextReviewDate`/`firstGradedAt`, all `createdAt`/`updatedAt`, `user.studyDirections`, `cultivation.xp`, quest snapshots, XP events. Class `color` is restored; a file whose Classes lack `color` restores with colours by creation order (`nextClassColor`). `cultivationSettledThrough` is set to yesterday in the target's stored timezone. Rows get fresh ids (relations remapped), so a file exported from another user, or from a database that still holds the old rows, cannot collide. The target is the user in the URL; the file's `user.id`, `email` and `timezone` are never applied. The validation schema is derived in `packages/domain` from `backupExportSchema` (Class `color` optional); the export schema and route are unchanged. Referential and uniqueness checks run before any write and fail as 422 `BACKUP_INVALID` (every Folder's Class exists, every Flashcard's Folder, every Card's Flashcard; one Unsorted Folder at most per Class; Flashcard names unique per Folder ignoring case; one record per direction per Card; one `CultivationDay` per day; `xp` ≥ 0). The request body is `{ confirm: true, backup }`; without `confirm: true` it is a 400. The structured log names `adminId` and the target `userId` on success and on failure.

**Never:** No change to `role`, `disabled`, email, password, sessions or timezone. No partial restore, no merge, no skip-bad-rows mode. No migration, no new dependency. Do not change `buildBackupExport`, the export route or `backupExportSchema`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Round trip | export of user A, restored into A after edits | A's data equals the export (ids aside); `settledThrough` = yesterday | N/A |
| Cross-user | A's file restored into B | B's data becomes A's; B keeps own email/timezone/role | N/A |
| Empty target | target has no data | same flow and modal | N/A |
| Missing colour | Classes without `color` | colours by creation order | N/A |
| Broken links | Card with unknown `flashcardId`, duplicate Unsorted Folder, duplicate Flashcard name | nothing changed | 422 `BACKUP_INVALID` with a short list |
| Bad file | not JSON, wrong `version`, schema mismatch | nothing changed; modal not opened | client shows "This is not a Training Sanctum backup."; server 400 |
| DB failure mid-write | a `\u0000` in a Card term | all prior target data intact | 500 `RESTORE_FAILED`, logged |
| Not allowed | anonymous / non-admin | no read, no write | 401 / 403 |
| Unknown user | id not in DB | nothing written | 404 |
| Cancel | modal dismissed | nothing sent | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/backup.ts` -- `backupExportSchema`, `BackupExport`; add the restore schema and integrity check beside it (new `backup-restore.ts`, export via `index.ts`); pure, no Prisma (AD-1).
- `packages/domain/src/classes.ts` -- `nextClassColor`; `packages/domain/src/time.ts` -- `toLocalDate`, `DAY_MS` for "yesterday".
- `apps/web/app/api/admin/users/[id]/export/route.ts` -- guard, id check and log pattern to copy; add `restore/route.ts` beside it.
- `apps/web/app/api/classes/[id]/route.ts` -- `$transaction` and error-handling pattern; `apps/web/lib/prisma-errors.ts`.
- `apps/web/lib/api-response.ts`, `lib/api-client.ts` (`apiFetch`, `ApiError`) -- envelope helpers and client fetch.
- `apps/web/app/(shell)/admin/users/[id]/page.tsx` -- add the Restore control next to Export; `read-only-banner.tsx` unchanged.
- `apps/web/app/(shell)/classes/modal.tsx` -- native-dialog `Modal`; `classes-view.tsx` for modal button styles.
- `tests/api/admin-export.spec.ts` (`seedUser`, `adminSession`), `tests/e2e/admin-user-view.spec.ts`, `tests/domain/backup.test.ts` -- templates; the e2e "no button but Export" assertion must now allow Restore.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/backup-restore.ts` + `index.ts` -- `backupRestoreSchema` (Class `color` optional), `findBackupIssues(payload)` returning the integrity problems -- pure, testable
- [x] `apps/web/app/api/admin/users/[id]/restore/route.ts` -- `requireAdmin`, id and body validation, 404 for unknown user, 422 on issues, one interactive `$transaction` (raised timeout) deleting then `createMany` in dependency order and updating the user, logs
- [x] `apps/web/app/(shell)/admin/users/[id]/restore-panel.tsx` + `page.tsx` -- client control: file input, client-side parse and schema check, confirmation `Modal` naming the target email, the file's source email, `exportedAt` and counts, consequence text, Confirm/Cancel; busy state, `role="alert"` errors, `role="status"` success, `router.refresh()`; keyboard reachable and usable at 390px
- [x] `tests/domain/backup-restore.test.ts` -- schema and each integrity rule
- [x] `tests/api/admin-restore.spec.ts` -- guards, 404, 400, 422, round trip incl. `firstGradedAt`, `studyDirections`, `color`, XP, `settledThrough`, replace-not-merge, cross-user isolation, NUL rollback
- [x] `tests/e2e/admin-user-view.spec.ts` (or `admin-restore.spec.ts`) -- upload, modal names the user, cancel changes nothing, confirm restores and the page shows it; screenshots in both themes
- [x] Run typecheck, lint, vitest, api and e2e suites

**Acceptance Criteria:**
- Given a valid backup file and an admin, when restore is confirmed, then the Class → Folder → Flashcard → Card structure, both Scheduling Records per Card, `firstGradedAt`, `studyDirections`, Class `color` and the cultivation section equal the file, and `cultivationSettledThrough` is yesterday.
- Given the modal, then it names the target user and states that existing data is replaced; nothing is sent until Confirm.
- Given any failure after the first write, then the target's previous data is intact.
- Given a non-admin or anonymous caller, then the route returns 403 or 401 and reads nothing.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Concurrent restores of one user merge rows (edge) | low | patch | READ COMMITTED: both deleteMany run before either insert. Lock the user row first via `updateMany`. |
| 404 and invalid-JSON paths write no log line (edge, claim) | low | patch | Spec: log names admin and user on failure. Added both. |
| Client skips `findBackupIssues`; admin confirms, then gets 422 (blind) | low | patch | Pure function already exported; run it before opening the modal. |
| Cross-user restore not flagged in modal (blind) | low | patch | Added one line when file email differs from target. |
| Chunked inserts untested above 1000 rows (gap) | medium | patch | Changing the step to `CHUNK + 1` keeps every test green. Added a >1000-row round trip. |
| Modal server-error display untested (gap) | low | patch | Removing `setModalError` kept e2e green. Added a NUL-term 500 case. |
| In-transaction 404 untested (gap) | low | reject | Race is not deterministic to test; only the error code differs. |
| Esc while busy hides the dialog (edge) | false | reject | `Modal.onCancel` calls `preventDefault`, so the dialog stays open. |
| Unique Class/Folder names unchecked (blind, edge) | false | reject | Only indexes: one Unsorted per Class, Flashcard name per Folder, record per direction; all checked. |
| Class without Unsorted Folder; Card with fewer than 2 records (edge) | low | reject | Only a hand-edited file; export always writes both. |
| Invalid stored timezone throws outside try (edge) | false | reject | Timezone is captured from the browser at signup; every other route would fail first. |
| No request size cap (blind, edge) | low | reject | Known limit, noted in the spec summary; no scale shown. |
| `router.refresh()` failure / network drop (edge) | false | reject | `refresh()` does not throw; `ApiError` network text says to try again. |
| id limit 64 vs 128 (blind, edge) | low | reject | Same as the export route; ids are 25-char cuids. |
| Mixed coloured and uncoloured Classes collide (edge) | low | reject | Only older files lack `color` wholesale; no mixed files exist. |
| `settledThrough` overwritten with yesterday (blind) | false | reject | Frozen intent and AC require it. |
| No snapshot or audit record before restore (blind) | low | reject | Intent excludes it; log line is the specified trail. |
| Focus not restored, success text not cleared, run-on 422 text (blind) | false | reject | Modal restores focus on unmount; rest cosmetic. |
| Check order, `MAX_ISSUES` truncation unflagged, fragile button-text assertion, unasserted screenshots (blind) | low | reject | Unlikely to hurt; fix adds branches. Screenshot pattern matches existing specs. |
| `pill` duplicates `linkButton`; Confirm is accent not Danger (design) | low | reject | Same pattern as Export; DESIGN.md has no Danger variant for restore and UX-DR7 calls for Confirm/Cancel. |
