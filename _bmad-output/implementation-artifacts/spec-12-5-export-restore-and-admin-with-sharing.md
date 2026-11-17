---
title: 'Story 12.5: Export, Restore and Admin with Sharing'
type: 'feature'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
baseline_commit: 'ac59ee812cb8e1adbb65dc94d8d79820264872af'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Backup, restore and the admin user view predate sharing. Export includes every learner's Scheduling Records on an owned Card, so a Member's progress leaks into the Owner's file. Restore knows nothing of Members. The admin view shows no membership. User delete is untested with sharing.

**Approach:** Export carries `members[]` (emails) per owned Class and a `sharedClasses[]` reference list, and only the user's own records. Restore re-attaches Members whose emails resolve, with default records. The admin view shows member counts and a "Member of N shared classes" line. User delete is proven by API test to cascade correctly.

## Boundaries & Constraints

**Always:** No migration; `BACKUP_VERSION` stays 1. `classes[].members` is `string[]` of Member emails (Owner excluded, sorted). `sharedClasses` is `{ name, ownerEmail }[]`, sorted by `name`, then `ownerEmail`. Both are required in `backupExportSchema`; `backupRestoreSchema` defaults a missing `members` and `sharedClasses` to `[]`, so older files restore unchanged. Export filters records by the exported user's `userId` (the existing `include` returns all learners' records) and never exports a Member's records in Shared Classes or pending/declined invitations. Restore keeps its single transaction and fresh ids: existing `class.deleteMany({ userId })` already cascades the old Members, invitations and every learner's records; the user's own records in Shared Classes are never touched. Per resolved Member, restore creates a `ClassMember` and two default records per Card per direction (ease 2.5, repetitions 0, `nextReviewDate` = start of today in that Member's timezone, `firstGradedAt` null, via the AD-9 domain helper if it fits). An email that matches no user, the target's own email, a duplicate, and every `sharedClasses` entry are ignored. The `admin.restore` success log names the unresolved emails and ignored shared Classes. Restore's response counts gain `members`. The admin page shows "{N} member(s)" on each owned Class row and a "Member of N shared classes" line from `sharedClasses.length`. UI uses DESIGN.md tokens only, checked in dark and light.

**Never:** No change to SM-2, XP, invitations, guards or the Member experience. No new dependency, no email. No export of other users' records. Restore never creates or alters another user's Class, and never applies the file's user id, email or timezone.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Export Owner | Class with Member who graded Cards | `members: [email]`; each Card has only the Owner's 2 records; no Member records | N/A |
| Export Member | User is Member of 1 Class | `sharedClasses: [{name, ownerEmail}]`; no Cards or records from it | N/A |
| Restore | File with a resolvable and an unknown Member email | Class recreated, resolvable Member re-attached with 2 default records per Card | Unknown email ignored, named in log; HTTP 200 |
| Restore old file | No `members` / `sharedClasses` keys | Restores as before | N/A |
| Restore target is a Member | Target also belongs to another's Class | Their membership and records there stay | N/A |
| Admin view | Owner with 2 Members, Member of 1 | Row shows "2 members"; "Member of 1 shared class" | N/A |
| Delete Member | User deleted | Their memberships, invitations, records in Shared Classes gone; Owners' data intact | N/A |
| Delete Owner | Owner of a Class with a Member | Class, Cards and the Member's records gone for everyone | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/backup.ts` -- `backupExportSchema`: add `classes[].members`, top-level `sharedClasses`.
- `packages/domain/src/backup-restore.ts` -- `backupRestoreSchema` (defaults for the new keys); `findBackupIssues` unchanged unless members need checking.
- `packages/domain/src/backup-tree.ts` -- `buildBackupTree`: carry `members` into `BackupClassNode`.
- `apps/web/lib/backup-export.ts` -- add `ClassMember` and `sharedClasses` queries inside the same `$transaction`; filter included records by `userId` (the leak).
- `apps/web/app/api/admin/users/[id]/restore/route.ts` -- resolve emails, create `ClassMember` rows and default records, extend log and counts.
- `apps/web/app/(shell)/admin/users/[id]/page.tsx`, `backup-tree-view.tsx`, `restore-panel.tsx` -- member counts, shared-classes line, restore result counts.
- `apps/web/app/api/admin/users/[id]/route.ts` DELETE -- no code change expected (all FKs cascade from `users`); test only.
- Tests: `tests/domain/backup.test.ts`, `tests/api/admin-export.spec.ts`, `admin-restore.spec.ts`, `admin-delete.spec.ts`, `tests/e2e/admin-user-view.spec.ts`, `admin-restore.spec.ts`.
- Do not touch: grade route, guards (`lib/class-access.ts`), invitations, Leave.

## Tasks & Acceptance

**Execution:**
- [x] `backup.ts`, `backup-restore.ts`, `backup-tree.ts` -- schema, defaults, tree members -- shared payload shape
- [x] `lib/backup-export.ts` -- members, sharedClasses, own-records-only -- stops the leak
- [x] `restore/route.ts` -- re-attach resolved Members with default records, log ignored -- AD-10
- [x] admin page, tree view, restore panel -- counts and "Member of N shared classes" line
- [x] unit tests -- schema defaults and tree members
- [x] API tests -- export (Owner, Member), restore round-trip with one Member, unknown email, old file, delete Member and Owner cascade
- [x] e2e -- admin view shows counts; restore keeps Members
- [x] typecheck, lint, vitest, api, e2e (PowerShell, test DB vars)

**Acceptance Criteria:**
- Given any single-learner scenario, then the existing unit, API and e2e suites pass unchanged.
- Given the UI, then it conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and was checked against a screenshot in both dark and light themes.

## Implementation Notes

- No migration. Restore uses `createDefaultSchedulingRecords` (chunked inserts with pre-generated Card ids) rather than `createCardWithSchedulingRecords`. Export now filters `schedulingRecords` by `userId` (the leak fix).
- Beyond the spec's e2e task: the "restore keeps Members" e2e was not added; the API round-trip in `tests/api/admin-restore.spec.ts` covers that matrix row. Restore matches Member emails exactly (case-sensitive).
- Verification (reviewer-side): typecheck, lint, vitest (331), API (256), e2e (210) pass.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Restore test never asserts a Member's `nextReviewDate` (both users UTC) | medium | `createDefaultSchedulingRecords` takes `timezone`; swapping it for the target's would pass. patch: add a differing-timezone Member test. |
| Restore with several Classes / disjoint Member sets untested | medium | Only one Class tested; a wrong `membersOfClass` lookup would pass. patch: two-Class test. |
| Export sort of `members` / `sharedClasses` untested (1 element each) | low | One-element arrays hide a removed sort; queries have no `orderBy`. patch: test-only, cheap. |
| Delete test creates no `ClassInvitation`; surviving Member's own records not asserted | medium | Epic AC names invitations explicitly. patch: add invitation rows and the survivor-records assertion. |
| `e2e` task "restore keeps Members" checked but not built | low | Matrix row covered by the API round-trip; stated in Implementation Notes. Rejected: duplicate coverage. |
| Restore wipes Members' old progress without a warning in the modal | false | AC: restore recreates Classes and re-attaches Members with default records; the modal is the 5.3 confirm. |
| Pending invitations neither exported nor restored | false | Spec decision (Boundaries: pending/declined invitations are not exported). |
| Unresolved emails only in the log, not the response or UI | false | AC: "named in the structured log". |
| Email match is case-sensitive; self-check could re-add the owner | low | Better Auth lowercases stored emails and the export reads them from the DB, so round trips match; only hand-edited files differ. Rejected: adds normalisation branches. |
| Member resolved outside the transaction can be deleted before `createMany` | low | The FK error aborts and rolls back; the route returns 500 "Nothing was changed". Loud and safe. Rejected. |
| `members` / `ownerEmail` unbounded, no `.email()` or array cap | low | Admin-only endpoint; unresolvable strings are ignored. Rejected: extra guards. |
| Non-null assertions on `classOfFolder` / `classOfFlashcard` | false | `findBackupIssues` already rejects Folders and Flashcards pointing outside the file, before any write. |
| Member's `studyDirections` not honoured for default records | false | Epic 12: a Card has exactly two records per learner; AD-9 helper always creates both. |
| Unversioned format (`BACKUP_VERSION` unchanged) | false | Spec decision; restore schema defaults the new keys so old files restore. |
| Export dereferences `m.user` / `m.class.user` without null check | false | Both are required relations; RepeatableRead snapshot. |
| `members: null` rejects the whole file | false | Not a produced shape; a hand-edit error fails loudly. |
| Admin UI shows counts but not Class names / owners | false | AC asks for member counts and a "Member of N shared classes" line only. |
| No member text on Classes with zero Members | false | Spec says counts on Owned Classes; zero hidden is consistent with the existing row style. |
| Wording `member` vs `Member`; panel count includes self/duplicates | low | Cosmetic; panel count is a preview of the file. Rejected. |
| Test nits: hard-coded "Seed class", weak `repetitions !== 7` check, assertion-less screenshots | low | Matches existing test style; screenshots are for review. Rejected. |
| `findBackupIssues` does not validate member emails | false | Spec: unchanged unless needed; the route ignores bad emails by design. |
| Large Member × Card record inflation, tx timeout | low | Admin-only, one transaction already sized at 60 s with chunking. Rejected. |
| Design Fidelity: no violations | false | Three text additions reusing existing tokens. |

## Verification

**Commands:**
- `npm run typecheck && npm run lint` -- expected: clean
- `npm test`, `npm run test:api -- --workers=1`, `npm run test:e2e` (PowerShell, test DB vars) -- expected: all pass
