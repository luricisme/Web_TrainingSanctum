---
title: 'Story 7.5: Reset User Password'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_commit: '59ee4dc87238d1925727433048f1e9457f1e2e9a'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A user who forgot their password is locked out for good: there is no reset flow (v1 is email and password only) and an admin has no way to help.

**Approach:** `PUT /api/admin/users/{id}/password` with `{ password }` stores a new hash on the user's credential account and deletes every session of that user in one `$transaction`. The admin user page gets a Reset password control (modal with a new-password field, Confirm / Cancel). UI conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

## Boundaries & Constraints

**Always:** The route calls `requireAdmin()` (AD-16), validates id and body with Zod (password 8 to 128 characters, matching Better Auth's limits), answers in the AD-10 envelope, and logs one structured line (`operation: "admin.reset-password"`, adminId, userId, sessions revoked, outcome) that never contains the password or hash. The hash comes from Better Auth's own hasher (`(await auth.$context).password.hash`), so the user logs in with the new password exactly as after registration. The response never echoes the password or any hash. The user's data is untouched. Resetting a disabled user's password is allowed and does not enable them. The modal field is `type="password"` with `autoComplete="new-password"`; the password is never shown back, stored in the URL, or logged.

**Never:** No migration, no new dependency, no new route outside `app/api/admin/users/[id]`. No email or reset-link flow, no generated or displayed password, no "must change on next login". No change to the disable route, role handling, or the Better Auth `admin` plugin. No Delete control (7.6). No hard-coded hex or arbitrary shadow.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reset | admin PUT `{password:"new-pass-123"}`, target has 2 sessions | 200 `{id}`; hash replaced; target's sessions deleted, old cookie 401; login works with the new password and fails with the old | N/A |
| Hash format | after reset | `accounts.password` verifies against the new password with Better Auth's verifier and is not the plaintext | N/A |
| Disabled target | target disabled | 200; still disabled, login still 403 `USER_DISABLED` | N/A |
| Reset self | admin's own id | 409 `CANNOT_RESET_SELF`; nothing changed | UI hides the control and says why |
| Short or long password | 7 or 129 characters | 400 `VALIDATION_ERROR`, nothing changed | field error in modal |
| Bad body | missing or non-string password, bad id | 400 `VALIDATION_ERROR` or `INVALID_JSON` | N/A |
| Unknown id | id not in DB | 404 `NOT_FOUND` | N/A |
| No credential account | user without a credential account | 409 `NO_PASSWORD_ACCOUNT`, nothing changed | modal shows the message |
| Normal user / anonymous | no admin session | 403 / 401 | via `requireAdmin` |
| Data untouched | target with Classes and XP | export before equals export after | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/app/api/admin/users/[id]/route.ts` -- 7.4 PATCH: template for `requireAdmin`, `idSchema`, `log()`, `HttpError` inside `$transaction`, error mapping. Do not change it.
- `apps/web/app/api/admin/users/[id]/password/route.ts` -- new: `PUT` handler.
- `apps/web/lib/auth.ts` -- exports `auth`; use `(await auth.$context).password.hash`. No change.
- `packages/db/schema.prisma` -- `Account.password`, `providerId` (`"credential"`) and `userId`; no change.
- `packages/domain/src/admin-users.ts` -- add `adminPasswordResetSchema` (`{ password }`, 8..128) and `AdminPasswordReset` response type; exported via `index.ts` (already re-exports this file).
- `apps/web/lib/api-response.ts` -- `ok`, `fail`, `HttpError`, `readJson`, `validationFailure`.
- `apps/web/app/(shell)/admin/users/[id]/status-panel.tsx` -- pattern for the client panel: pill button, `Modal`, `apiFetch`, inline errors, `router.refresh()`, self message.
- `apps/web/app/(shell)/admin/users/[id]/page.tsx` -- mount the new panel beside Export / Restore / Disable.
- `apps/web/app/register/page.tsx` -- field markup pattern (`labelClass`, `inputClass`, `fieldErrorClass`, password input attributes).
- `apps/web/app/components/ui.ts` -- `buttonPrimary`, `buttonSecondary`, `labelClass`, `inputClass`, `fieldErrorClass`, `formErrorClass`.
- `tests/api/admin-disable.spec.ts`, `tests/e2e/admin-disable.spec.ts` -- templates for `signUp`/`logIn`/`adminSession`/`account`, cleanup, theme screenshots, 390px overflow check.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/admin-users.ts` -- `adminPasswordResetSchema` and `AdminPasswordReset` type -- shared by route and UI
- [x] `apps/web/app/api/admin/users/[id]/password/route.ts` -- `PUT`: guard, validate, refuse self, `$transaction` (lock user row, find credential account, update `password` with the Better Auth hash, `session.deleteMany`), log without secrets, respond `{id}` -- the reset action
- [x] `apps/web/app/(shell)/admin/users/[id]/password-panel.tsx` -- client control: Reset password opens a modal with a new-password field and Confirm / Cancel; client check of 8..128 with a field error; API errors inline; success shows "Password reset. They were signed out." and clears the field; self shows nothing (the status panel already explains) -- the admin UI
- [x] `apps/web/app/(shell)/admin/users/[id]/page.tsx` -- mount `PasswordPanel` with `userId`, `email`, `isSelf` -- wiring
- [x] `tests/api/admin-password.spec.ts` -- every matrix row via the API (sessions deleted, old cookie 401, new password logs in, old fails, hash verifies and is not plaintext, disabled stays disabled, self, 400s, 404, no credential account via a directly created user, 401/403, export unchanged)
- [x] `tests/e2e/admin-password.spec.ts` -- admin resets a seeded user's password through the modal, short password shows the field error, the user logs in with the new password; self has no control; screenshots in both themes; 390px no horizontal overflow
- [x] Run typecheck, lint, vitest, api and e2e suites

**Acceptance Criteria:**
- Given an admin enters a new password of at least 8 characters for a user, then it is stored hashed as at registration, the user's sessions are deleted, and the old password no longer works.
- Given any response, log line or page, then no password or hash is ever readable by the admin.
- Given UI changes, then they conform to DESIGN.md tokens and the Design DNA design_style, pass the anti-generic UI rules, and were checked against a screenshot in both dark and light themes.

## Implementation Notes

- Extra file edited beyond the listed ones: `tests/e2e/admin-user-view.spec.ts` (its button-count assertion now allows Disable or Enable, then Reset password).
- `.working/design-dna-profile.json` does not exist; the implementer relied on DESIGN.md and the existing Disable modal.
- Review patch applied: the password field clears its error when the admin types.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Field error stays while the admin edits the password (edge, blind) | low | patch | Real: `aria-invalid` and the message persist after typing. Fixed: `onChange` clears `fieldError`. |
| Admin can reset another admin's password; no guard or test (blind, edge, gap) | low | reject | Intent says "a user"; only admins reach the route, and admins already hold the disable and restore powers. No spec line asks for a guard. |
| No durable audit record, no user notification (blind) | low | reject | Not in the intent; the architecture asks for one structured log line, which the route writes without secrets. |
| Other tokens survive; cookie cache (blind, edge) | false | reject | `lib/auth.ts` has no `cookieCache` (grep), v1 has no reset-token flow, and all session rows are deleted; the test asserts old cookies get 401. |
| Limits 8 and 128 hard-coded, may drift from Better Auth (blind) | low | reject | Constants sit next to the schema with a comment; `minPasswordLength: 8` is the only configured limit and the default max is 128. |
| Raw SQL hard-codes `"users"` (blind) | false | reject | Same pattern as the shipped 7.4 route, and the API tests run it against the real DB. |
| Self-check order vs validation untested; no rate limit (blind, gap) | low | reject | Either order returns an error and changes nothing; the endpoint is admin-only. |
| Server `VALIDATION_ERROR` shows the generic message, branch untested (edge, gap) | low | reject | Client and server share one schema, so the branch is effectively unreachable. |
| Rollback and 500 `RESET_FAILED` path untested (gap) | low | reject | Failure injection is not practical in the black-box Playwright setup; both writes sit in one `$transaction`. |
| Multiple credential accounts: `findFirst` updates one (edge) | false | reject | Better Auth creates one credential account per user (unique per provider and account id). |
| `done` message stale after reopening or navigating (edge) | low | reject | `done` resets when the modal opens, and the component remounts on navigation. |
| Whitespace or multi-byte password length (edge) | false | reject | The hasher receives the string as typed, as at registration; the 8 to 128 rule is the same one registration uses. |
| `status` live region mounted with content; focus restore (blind) | low | reject | Same pattern as the shipped Disable panel; `Modal` restores focus to the opener. |
| No `router.refresh()` after success (edge claim) | false | reject | Reset changes nothing the page shows. |
| Self-reset explanation relies on StatusPanel (edge claim) | false | reject | StatusPanel shows "This is your own account…" on the admin's own page. |
| Show/hide toggle, confirm field, generate, force-change (blind) | low | reject | Explicitly out of scope (spec Never: no generated password or must-change). |
| Shared `ADMIN_EMAIL`, positional button asserts, mobile reachability (blind, edge, gap) | low | reject | Same test pattern as 7.3 and 7.4; the suite runs on a disposable DB. |
| Duplicated `pill` class; Confirm is primary, not danger (design) | low | reject | Same string as the shipped Restore and Disable controls. The reset deletes no data, so primary fits. |

## Design Notes

Self-reset is refused because it would delete the admin's own session mid-request and leave the page unusable; there is no change-own-password feature yet, so that stays out of scope. The `PUT` verb (not `POST`) marks the replace-a-value semantics and keeps the route idempotent.

## Verification

**Commands:**
- `npm run typecheck && npm run lint` -- expected: clean
- `npm test` (PowerShell) -- expected: vitest passes
- `npm run test:api` and `npm run test:e2e` (PowerShell) -- expected: all pass, including the two new `admin-password` specs
