---
title: 'Story 7.4: Disable / Enable User'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_commit: 'b29e047a9025426e2a6a9223c38f8cea9eb0d4ba'
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

**Problem:** `User.disabled` is stored (7.1) and shown in the Admin table (7.2) but nothing sets or enforces it. An admin cannot stop an account without deleting its data.

**Approach:** `PATCH /api/admin/users/{id}` with `{ disabled }` sets the flag; disabling deletes every session of that user in the same `$transaction`. A Better Auth `session.create.before` hook refuses to open a session for a disabled user, so login fails until the account is enabled. The admin user page gets a Disable / Enable control (Confirm / Cancel modal for Disable). UI conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

## Boundaries & Constraints

**Always:** The route calls `requireAdmin()` (AD-16), validates the id and body with Zod, answers in the AD-10 envelope, and logs one structured line (`operation: "admin.disable"` or `"admin.enable"`, adminId, userId, sessions revoked, outcome). Disable and enable are idempotent (a repeat returns 200). An admin cannot disable themselves (409 `CANNOT_DISABLE_SELF`), and a disable that would leave no enabled admin is refused (409 `LAST_ADMIN`); both checks run inside the transaction after the user row is locked. The login refusal happens only after the password is verified, so a wrong password still returns the same 401 and the disabled state is never revealed to someone without the password. The refusal is `403` code `USER_DISABLED` with the message "This account is disabled. Contact an administrator." and the login page shows that message. Data of the disabled user is untouched.

**Never:** No migration, no new dependency, no new route file outside `app/api/admin/users/[id]`. Do not enable Better Auth's `admin` plugin (ban endpoints sit under `/api/auth`). No change to role handling, the export or restore routes, or `buildBackupExport`. No Reset password or Delete control (7.5, 7.6). No hard-coded hex or arbitrary shadow.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Disable a user | admin PATCH `{disabled:true}`, target has 2 sessions | 200 `{id, disabled:true}`; target's sessions deleted; target's old cookie gets 401 | N/A |
| Login while disabled | correct password | 403 `USER_DISABLED`, no cookie, no new session row | login page shows the message |
| Login while disabled, wrong password | wrong password | 401 `INVALID_EMAIL_OR_PASSWORD`, same as any wrong password | N/A |
| Enable | admin PATCH `{disabled:false}` | 200; the user logs in again; data unchanged | N/A |
| Repeat disable / enable | already in that state | 200, no error | N/A |
| Disable self | own id | 409 `CANNOT_DISABLE_SELF`; flag and sessions unchanged | UI hides the action and explains |
| Last enabled admin | target is an admin and no other enabled admin exists | 409 `LAST_ADMIN`; unchanged | modal shows the message |
| Unknown id | id not in DB | 404 `NOT_FOUND` | N/A |
| Bad body | missing or non-boolean `disabled`, bad id | 400 `VALIDATION_ERROR` | N/A |
| Normal user / anonymous | no admin session | 403 / 401 | via `requireAdmin` |
| Data untouched | target with Classes and XP | export before equals export after disable and enable | N/A |

</frozen-after-approval>

## Code Map

- `packages/db/schema.prisma` -- `User.disabled` exists; no change.
- `apps/web/lib/auth.ts` -- add `databaseHooks.session.create.before`: read `disabled` for `session.userId`, throw `APIError("FORBIDDEN", { code: "USER_DISABLED", message })`. `APIError` comes from `better-auth/api`.
- `apps/web/app/api/auth/[...all]/route.ts` -- already wraps sign-in failures in the envelope and keeps `body.code`; verify the 403 passes through unchanged.
- `apps/web/app/api/admin/users/[id]/restore/route.ts` -- template: `requireAdmin`, `idSchema`, `log()`, `HttpError` inside `$transaction`.
- `apps/web/lib/api-response.ts` -- `ok`, `fail`, `HttpError`, `readJson`, `validationFailure`.
- `packages/domain/src/admin.ts` (or the file holding `AdminUsersQuery`) -- add the body schema `adminUserStatusSchema` and response type, exported via `index.ts`.
- `apps/web/app/(shell)/admin/users/[id]/page.tsx` -- add the control beside Export/Restore; read `disabled` with one `prisma.user.findUnique` (via a helper in `lib/admin-users.ts`) and show a "Disabled" status line.
- `apps/web/app/(shell)/admin/users/[id]/restore-panel.tsx` -- pattern for the client panel, `Modal`, `apiFetch`, `router.refresh()`.
- `apps/web/app/login/page.tsx` -- map `error.status === 403` to the disabled message.
- `apps/web/app/components/ui.ts` -- `buttonPrimary`, `buttonSecondary`, `buttonDanger`, `formErrorClass`.
- `tests/api/admin-restore.spec.ts`, `tests/api/login.spec.ts`, `tests/e2e/admin-restore.spec.ts` -- `signUp`/`adminSession`/`seedUser` templates and cleanup.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain` -- `adminUserStatusSchema` (`{ disabled: boolean }`) and `AdminUserStatus` response type; export -- shared by route and UI
- [x] `apps/web/lib/auth.ts` -- `session.create.before` hook refusing disabled users with 403 `USER_DISABLED` -- enforces login refusal at the single session-creation point
- [x] `apps/web/app/api/admin/users/[id]/route.ts` -- `PATCH`: guard, validate, `$transaction` (lock row by `updateMany`, self and last-admin checks, set flag, `session.deleteMany` on disable), log, respond -- the disable/enable action
- [x] `apps/web/lib/admin-users.ts` + `admin/users/[id]/page.tsx` -- read the target's `disabled`, pass it and the viewer id to the panel, show status -- UI needs the flag
- [x] `apps/web/app/(shell)/admin/users/[id]/status-panel.tsx` -- client control: Disable opens a Confirm / Cancel modal naming the email and "signs them out and blocks login"; Enable acts at once with an inline status; self shows no button and a one-line reason; API errors shown inline -- the admin UI
- [x] `apps/web/app/login/page.tsx` -- show the disabled message on 403 -- user-facing refusal
- [x] `tests/api/admin-disable.spec.ts` -- every matrix row via the API (sessions deleted, old cookie 401, login 403 vs 401, enable restores login, self, last enabled admin via a directly flagged actor, idempotence, 404, 400, 401/403, export unchanged)
- [x] `tests/e2e/admin-disable.spec.ts` -- admin disables a seeded user through the modal, status shows Disabled, the user's login page shows the message, admin enables, user logs in; self has no Disable button; screenshots in both themes; 390px no horizontal overflow
- [x] Run typecheck, lint, vitest, api and e2e suites

**Acceptance Criteria:**
- Given an admin disables a user, then that user's sessions are deleted at once, login is refused until the account is enabled, and none of their data changes.
- Given an admin tries to disable themselves, then the action is refused; and the last enabled admin can never be disabled.
- Given UI changes, then they conform to DESIGN.md tokens and the Design DNA design_style, pass the anti-generic UI rules, and were checked against a screenshot in both dark and light themes.

## Implementation Notes

- The subagent locked the target and every admin row with one ordered `SELECT ... FOR UPDATE` instead of the `updateMany` lock the Code Map suggested, so two admins cannot disable each other concurrently; the I/O matrix is unchanged.
- Extra file edited beyond the listed ones: `tests/e2e/admin-user-view.spec.ts` (its 7.3 "only Restore" button assertion now also allows Disable or Enable).
- `.working/design-dna-profile.json` named in `context:` does not exist; the implementer relied on DESIGN.md and existing screens (same as 7.3).
- Review patch applied directly (the implementation subagent had finished): the "Disabled. Login is blocked." chip uses `border-border bg-card text-foreground` instead of the error colour.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Disabled chip uses `border-error text-error` and a font-weight override (design) | low | patch | DESIGN.md lines 281 and 387 reserve error for destructive actions and form errors. Chip now neutral (`border-border bg-card text-foreground`, plain `text-caption`). |
| Login race: hook reads `disabled` outside the PATCH lock, session can survive (blind, edge, gap) | low | reject | The spec's Design Notes accept this one-instant gap; a fix needs a re-check after insert or a per-request read, which adds a query on every request. |
| Disabled state not re-checked on session read; cookieCache could keep a session (blind, edge) | false | reject | `cookieCache` is not configured in `lib/auth.ts` (grep), and disable deletes every session row, so no cookie validates afterwards. |
| Login page maps every 403 to the disabled message (blind, edge) | low | reject | The auth route wraps the body into `{error:{code,message}}`, and the login page reads only `error.status`, so `code` is not available client-side without changing the wrapper. Same-origin sign-in does not produce other 403s. |
| Route id max 64 vs page max 128 (edge, blind) | false | reject | The page calls `buildBackupExport(id)` first and 404s for any id not in the DB; real ids are 25-char cuids, so the page never renders for a 65 to 128 char id. |
| `$transaction` default 5s timeout under lock wait (edge) | low | reject | Lock waits involve a handful of admin rows and one short write; the guard is speculative. |
| Disabled admin with a live session can still disable others (edge) | low | reject | Disable deletes the admin's sessions, so the state only arises from a direct database edit; the same refusal was logged for 7.3. |
| Deleted-between-queries user rendered as enabled (edge, blind) | low | reject | Needs a delete between two reads in one request; Disable then returns a clean 404. |
| Panel keeps stale state after a network failure (edge) | low | reject | The error text shows and the next click re-sends an idempotent PATCH. |
| No concurrency test for the FOR UPDATE lock (gap) | low | reject | A test needs only two enabled admins, but the shared test DB always holds `admin-e2e` too; isolating that needs flagging real admins, the same hazard as the next row. |
| Last-admin test flags other admins disabled on a shared DB (edge, gap, blind) | low | reject | The window is two statements, restored in `finally`; the suite runs on a disposable test DB. Required for the matrix row, no safe alternative found. |
| Migration or table name missing (blind) | false | reject | `disabled` shipped in Story 7.1's migration; raw SQL runs in the passing API tests. |
| `adminEmails` promotion re-enables or miscounts a disabled admin (blind) | false | reject | The seed writes `role` only, never `disabled`. |
| No audit trail or disabledAt/By (blind) | low | reject | Not in the intent; the architecture asks for a structured log line, which the route writes. |
| Panel a11y: no status line after disable; Enable has no confirm (blind) | low | reject | The page shows the Disabled chip and the Enable button as the result; Enable is harmless and reversible. |
| Redundant `getUserDisabled` query (blind) | low | reject | One indexed read; folding it into `buildBackupExport` is forbidden by the spec. |
| 7.3 assertion loosened to buttons[0] plus a regex (blind) | low | reject | Test-only; still fails on a missing or extra button. |
| Missing tests: other session routes, UI error copy (blind) | low | reject | Sign-up cannot reuse an existing email; no password-reset flow exists; unproven harm. |
| `pill` duplicates `buttonSecondary`; hover and opacity not in spec; "Confirm" label (design) | low | reject | Same pill string and Confirm / Cancel wording as the shipped Restore control; EXPERIENCE.md specifies Confirm / Cancel. |
| Claims: lock via `$queryRaw` not `updateMany`; "never revealed" (edge claims) | false | reject | Deviation recorded in Implementation Notes; the hook runs after the password check and tests assert 401 for a wrong password. |

## Design Notes

Enforcement sits at session creation, not in `requireSession`: it is one place, adds no per-request query, and sessions are already deleted on disable, so a disabled user holds none. The hook runs after the password check, which keeps wrong-password and unknown-email responses identical. A login racing with a disable in the same instant is the one accepted gap.

## Verification

**Commands:**
- `npm run typecheck && npm run lint` -- expected: clean
- `npm test` (PowerShell) -- expected: vitest passes
- `npm run test:api` and `npm run test:e2e` (PowerShell) -- expected: all pass, including the two new `admin-disable` specs
