---
title: 'Story 7.6: Delete User'
type: 'feature'
created: '2026-11-16'
status: 'done'
route: 'dispatch'
baseline_commit: 'd08cef2445e5d59bd04b07fdb873875a432e6d6c'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** An admin can disable a user but never remove an account, so a closed or mistaken account and all its data stay in the database for good.

**Approach:** `DELETE /api/admin/users/{id}` with `{ email }` removes the user and everything scoped to them in one `$transaction`. The admin user page gets a Delete control (danger modal: retype the user's email, Delete disabled until it matches). On success the admin returns to the user list. UI conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

## Boundaries & Constraints

**Always:** The route calls `requireAdmin()` (AD-16), validates id and body with Zod, answers in the AD-10 envelope, and logs one structured line (`operation: "admin.delete"`, adminId, userId, outcome). Inside the transaction, the first statement locks the target and every admin row in id order (the 7.4 pattern), then the checks run, then `tx.user.delete` removes the user. Every user-owned table already cascades from `users`, so no per-table deletes are written. Rows keyed by the email instead of a user id (`verifications.identifier`) are deleted in the same transaction. The server re-checks that `email` equals the target's stored email exactly (the UI match is not trusted). Deleting a disabled user is allowed. The response is `{ id }` and never echoes data. The dialog's Delete button stays disabled until the typed text equals the email exactly (case-sensitive, no trimming).

**Never:** No migration, no new dependency, no new route outside `app/api/admin/users/[id]`. No soft delete, no export-before-delete, no undo, no email notice. No change to the disable, reset, export or restore routes, to role handling, or to the Better Auth `admin` plugin. No hard-coded hex or arbitrary shadow.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Delete | admin DELETE `{email}` of a user with Classes, Folders, Flashcards, Cards, SchedulingRecords, CultivationDays, XpEvents, sessions | 200 `{id}`; user and all their rows are gone (counts 0 for every table); target's old cookie 401; login fails; other users' data unchanged | N/A |
| Verification rows | a `verifications` row with `identifier` = the email | removed with the user | N/A |
| Disabled target | target disabled | 200, deleted | N/A |
| Email mismatch | `{email}` differs from the target's (any case change, extra space) | 400 `EMAIL_MISMATCH`, nothing changed | modal keeps Delete disabled; server message inline |
| Delete self | admin's own id | 409 `CANNOT_DELETE_SELF`, nothing changed | UI shows no Delete control and says why |
| Last admin | target is the only enabled admin | 409 `LAST_ADMIN`, nothing changed | message inline |
| Another admin | target is an admin and another enabled admin exists | 200, deleted | N/A |
| Bad body / id | missing or non-string email, bad id | 400 `VALIDATION_ERROR` or `INVALID_JSON` | N/A |
| Unknown id | id not in DB (or already deleted) | 404 `NOT_FOUND` | N/A |
| Normal user / anonymous | no admin session | 403 / 401 | via `requireAdmin` |
| Failure mid-way | any error in the transaction | nothing deleted, 500 `DELETE_FAILED` | message inline |

</frozen-after-approval>

## Code Map

- `apps/web/app/api/admin/users/[id]/route.ts` -- 7.4 PATCH: template for `requireAdmin`, `idSchema`, `log()`, row lock, `HttpError`, error mapping. Add a `DELETE` export beside it; leave PATCH unchanged.
- `packages/domain/src/admin-users.ts` -- add `adminUserDeleteSchema` (`{ email }`, non-empty string, max 320) and `AdminUserDeleted` (`{ id }`); already re-exported by `index.ts`.
- `packages/db/schema.prisma` -- every user-owned model has `onDelete: Cascade` to `User`; `Verification` has no user relation (keyed by `identifier`). No change.
- `apps/web/lib/api-response.ts` -- `ok`, `fail`, `HttpError`, `readJson`, `validationFailure`.
- `apps/web/app/(shell)/admin/users/[id]/delete-panel.tsx` -- new client control, modelled on `password-panel.tsx` and `status-panel.tsx` (pill button, `Modal`, `apiFetch`, inline errors, self message); `buttonDanger` from `app/components/ui.ts`.
- `apps/web/app/(shell)/admin/users/[id]/page.tsx` -- mount `DeletePanel` beside Disable / Reset password.
- `apps/web/app/(shell)/admin/users/[id]/status-panel.tsx` -- already says "This is your own account…" for self; the Delete panel renders nothing for self.
- `tests/api/admin-password.spec.ts`, `tests/e2e/admin-password.spec.ts` -- templates for `signUp`/`logIn`/`adminSession`/`account`, cleanup, theme screenshots, 390px overflow check.
- `tests/e2e/admin-user-view.spec.ts` -- asserts the action button count; update it for the new Delete button.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain/src/admin-users.ts` -- `adminUserDeleteSchema`, `AdminUserDeleted` -- shared by route and UI
- [ ] `apps/web/app/api/admin/users/[id]/route.ts` -- `DELETE`: guard, validate, `$transaction` (lock rows, 404, refuse self, refuse last enabled admin, compare email, delete verifications by identifier, delete user), structured log, respond `{id}` -- the delete action
- [ ] `apps/web/app/(shell)/admin/users/[id]/delete-panel.tsx` -- Delete opens a danger modal naming the user and what is lost (account, classes, cards, progress; cannot be undone); email retype field; Delete disabled until exact match, Cancel; API errors inline; success navigates to `/admin` (`router.push` then `router.refresh`); renders nothing for self -- the admin UI
- [ ] `apps/web/app/(shell)/admin/users/[id]/page.tsx` -- mount `DeletePanel` with `userId`, `email`, `isSelf` -- wiring
- [ ] `tests/api/admin-delete.spec.ts` -- every matrix row via the API: populate a user in every table first, assert zero rows afterwards and other users untouched; mismatch, self, last admin (set the other admins' role or disabled state in the DB, restore after), another admin, 400s, 404 on repeat, 401/403, old cookie 401
- [ ] `tests/e2e/admin-delete.spec.ts` -- admin opens the modal, Delete disabled until the email matches exactly (wrong case stays disabled), deleting returns to the list where the user is gone; self has no control; screenshots in both themes; 390px no horizontal overflow
- [ ] `tests/e2e/admin-user-view.spec.ts` -- adjust the button-count assertion for Delete
- [ ] Run typecheck, lint, vitest, api and e2e suites

**Acceptance Criteria:**
- Given an admin chooses Delete on a user, then a dialog asks them to retype the user's email and Delete stays disabled until it matches exactly.
- Given the retyped email matches, when the admin confirms, then the account and every row scoped to it are removed in one transaction, or none are.
- Given the admin targets themselves or the last enabled admin, then the action is refused and nothing changes.
- Given UI changes, then they conform to DESIGN.md tokens and the Design DNA design_style, pass the anti-generic UI rules, and were checked against a screenshot in both dark and light themes.

## Implementation Notes

- Extra file edited beyond the listed ones: none. `tests/e2e/admin-user-view.spec.ts` was on the task list.
- `.working/design-dna-profile.json` does not exist; DESIGN.md, `globals.css` and the existing Disable and Reset modals were the reference.
- Review patches applied: a `LAST_ADMIN` API test (the actor is flagged disabled directly, other admins are flagged only around the request); the Delete trigger uses an error border at rest, as DESIGN.md Danger buttons do.
- Known flake (deferred): last-admin tests that flag the shared admin account can collide with parallel logins in a full `test:api` run.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| `LAST_ADMIN` has no test (gap, edge, blind) | medium | patch | Matrix row had no covering test. `requireAdmin` does not read the DB flag, so a directly disabled actor reaches it. Test added. |
| Delete trigger has a neutral border; Danger is error border and text (design) | low | patch | DESIGN.md Buttons rule. One-class fix. |
| Verification rows keyed by token-style identifiers survive (edge, blind) | false | reject | v1 has no verification or reset flows (`lib/auth.ts`), so no such rows exist. |
| Non-uuid id breaks the raw query (edge) | false | reject | `users.id` is text (cuid); the raw query is parameterised and 404s on unknown ids. |
| Concurrent delete of one user gives 500 (edge) | false | reject | The second request blocks on `FOR UPDATE`, then finds no row and returns 404. |
| Modal stays busy after success; stale-tab 404 has no way back (edge, blind) | low | reject | Navigation follows at once; the fix adds branches for a rare case. |
| Check order reveals role before the email is proven (blind) | low | reject | Admin-only route; admins already see every user. |
| No durable audit row (blind) | low | reject | Not in the intent; one structured log line is written, as in 7.4 and 7.5. |
| No schema-driven cascade check (blind) | low | reject | The API test counts every user-owned table by hand; a new model would need a test line in any case. |
| Disabled-admin target and self-plus-mismatch precedence untested (gap, edge) | low | reject | Same code paths as covered rows; no behaviour the spec states. |
| Shared admin account, undisposed contexts, aria-describedby, spec not in diff (blind) | low | reject | Same test and modal patterns as 7.3 to 7.5. |
| Last-admin tests race parallel logins as the shared admin (found in verification) | medium | defer | Pre-existing 7.4 pattern; recorded in deferred-work.md. |

## Design Notes

The server-side `email` check makes the dialog's retype a real safeguard rather than a UI nicety: a scripted or mistaken `DELETE` without the right email is refused. The last-admin rule is mostly covered by the self rule (the caller is an enabled admin, so another one exists), but it is kept so the invariant holds on its own, as in 7.4.

## Verification

**Commands:**
- `npm run typecheck && npm run lint` -- expected: clean
- `npm test` (PowerShell) -- expected: vitest passes
- `npm run test:api` and `npm run test:e2e` (PowerShell) -- expected: all pass, including the two new `admin-delete` specs
