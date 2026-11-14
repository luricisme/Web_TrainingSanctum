---
title: 'Story 7.1: Roles, Admin Seed and Guard'
type: 'feature'
created: '2026-11-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '19c43044efb8ffb54ff12aec1f50731395d85ff4'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The app has no roles, so nothing can be reserved for an owner. Export, restore and user management (Epic 7, Stories 5.2/5.3) need an admin that only the server can create, and one guard that every admin route uses.

**Approach:** Add `User.role` (`user` | `admin`) and `User.disabled`; promote the emails in `ADMIN_EMAILS` at server start and at sign-up; add `requireAdmin()`; show **Admin** in the app bar and dock for admins only, linking to a minimal admin page. Record that Better Auth's `admin` plugin is not used. UI conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

## Boundaries & Constraints

**Always:** The migration is additive (`role` text default `'user'`, `disabled` boolean default false), no nulls, deployed to Neon with the code. `ADMIN_EMAILS` is a comma-separated list, optional (default empty), trimmed and lower-cased, each entry a valid email, validated in `apps/web/lib/env.ts`. The role reaches the client only through the session (`session.user.role`, `input: false`, never writable from sign-up). `requireAdmin()` lives in `apps/web/lib/session.ts`, reuses `requireSession`, and answers `401 UNAUTHENTICATED` or `403 FORBIDDEN` in the AD-10 envelope. A disabled user is still `user`/`admin` as stored; this story only stores the flag.

**Never:** No route, screen or API writes `role`. Do not enable Better Auth's `admin` plugin: it exposes set-role and impersonation endpoints under `/api/auth`, which breaks "no route changes a role" (record this in Implementation Notes). No enforcement of `disabled` at login (Story 7.4). No user list, user view, export or restore. No demotion when an email leaves `ADMIN_EMAILS`. No hard-coded hex.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Seed at start | `ADMIN_EMAILS=A@x.test`, account `a@x.test` is `user` | Becomes `admin` | N/A |
| Seed at sign-up | Email in the list registers later | New account is `admin` from its first session | N/A |
| Not listed | Any other email | Stays `user` | N/A |
| Sign-up forges role | Body includes `role:"admin"` | Ignored; account is `user` | N/A |
| Admin route, no cookie | `GET /api/admin/me` | 401 `UNAUTHENTICATED` | Envelope |
| Admin route, normal user | Same, user session | 403 `FORBIDDEN` | Envelope |
| Admin route, admin | Same, admin session | 200 `{ data: { email, role } }` | N/A |
| Bad list | `ADMIN_EMAILS=not-an-email` | Process start fails with a clear env error | AD config fail-fast |
| Menu | Admin vs normal user | Admin item shown / absent in app bar and dock | N/A |
| Admin page | Normal user opens `/admin` | 404 | `notFound()` |

</frozen-after-approval>

## Code Map

- `packages/db/schema.prisma` -- `model User` (line 34): add `role String @default("user")`, `disabled Boolean @default(false)`.
- `packages/db/migrations/20261116000000_add_user_role/migration.sql` -- new; two `ALTER TABLE "users" ADD COLUMN` (pattern: `20261114000000_add_study_directions`).
- `apps/web/lib/env.ts` -- add `ADMIN_EMAILS` to `envSchema`; export the parsed list as `adminEmails` via the schema transform.
- `apps/web/lib/admin-seed.ts` -- new: `seedAdmins()` runs `prisma.user.updateMany({ where: { email: { in }, role: { not: "admin" } }, data: { role: "admin" } })`; no-op on an empty list.
- `apps/web/instrumentation.ts` -- after `import("./lib/env")`, in the nodejs runtime only, call `seedAdmins()` (log, never throw on a DB error).
- `apps/web/lib/auth.ts` -- `user.additionalFields.role` (`type string`, `required false`, `defaultValue "user"`, `input false`); `databaseHooks.user.create.after` calls `seedAdmins()`.
- `apps/web/lib/session.ts` -- add `requireAdmin(request)`; `isAdminRole(role)` helper for server components.
- `apps/web/app/api/admin/me/route.ts` -- new: the one admin route, proves the guard (`ok({ email, role })`).
- `apps/web/app/(shell)/layout.tsx` -- pass `isAdmin` to `AppBar` and `Dock`.
- `apps/web/app/(shell)/nav-items.tsx` -- add `adminNavItem` (shield icon); `app-bar.tsx` and `dock.tsx` append it when `isAdmin`.
- `apps/web/app/(shell)/admin/page.tsx` -- new minimal page: `getServerSession`, `notFound()` unless admin, `PageHeader title="Admin"`. Story 7.2 fills it.
- `.env.example`, `playwright.config.ts` (webServer env `ADMIN_EMAILS`), `.github/workflows/ci.yml` -- document and supply a test admin email.
- `tests/api/admin-guard.spec.ts` (new), `tests/e2e/admin-menu.spec.ts` (new), `tests/domain` or unit test for env parsing if a pattern exists.
- Reuse `fail()`/`ok()` from `apps/web/lib/api-response.ts`; do not touch Better Auth's session cookie settings.

## Tasks & Acceptance

**Execution:**
- [x] `schema.prisma` + migration -- `role`, `disabled` -- additive, no nulls
- [x] `env.ts`, `packages/db/client.ts`, `instrumentation.ts`, `auth.ts` -- parse, seed at start and sign-up, expose role on the session -- single seed path
- [x] `session.ts`, `api/admin/me/route.ts` -- `requireAdmin()` and its first user -- AD-16
- [x] `layout.tsx`, `nav-items.tsx`, `app-bar.tsx`, `dock.tsx`, `admin/page.tsx` -- Admin item for admins only -- UX-DR20
- [x] `.env.example`, Playwright and CI env -- `ADMIN_EMAILS`
- [x] Tests for the I/O matrix; run typecheck, lint, vitest, api and e2e suites
- [x] Deploy the migration to Neon; set `ADMIN_EMAILS` locally and on the host; note the Better Auth `admin` plugin decision

**Acceptance Criteria:**
- Given the schema, then `User` has `role` (default `user`) and `disabled` (default false) by an additive migration deployed to Neon.
- Given `ADMIN_EMAILS` lists an email, when the app starts or that email registers, then the account has role `admin`, a malformed list fails the start, and no route changes a role.
- Given any `/api/admin/**` request, then no session returns 401 and a non-admin returns 403, both in the error envelope, via `requireAdmin()`.
- Given I am an admin, then the app bar and dock show Admin; a normal user never sees it or reaches `/admin`.
- Given this story, then Implementation Notes record that the Better Auth `admin` plugin is not used and why.
- Given UI changes, then they conform to DESIGN.md tokens and the Design DNA design_style, pass the anti-generic UI rules, and were checked against a screenshot in both dark and light themes.

## Implementation Notes

- Better Auth's `admin` plugin is not used. It adds set-role, ban and impersonation endpoints under `/api/auth`, which would let a route change a role and breaks "no route changes a role". `role` is a plain additional field (`input: false`) written only by `seedAdmins()`.
- Single seed path: `seedAdmins()` runs from `instrumentation.ts` (nodejs runtime) and from the `databaseHooks.user.create.after` hook.
- `ADMIN_EMAILS` must also be set on the host (Vercel) by the owner; it cannot be set from this repo.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Unverified sign-up lets someone who registers an `ADMIN_EMAILS` address first become admin | medium | defer | Real: v1 has no email verification (spec-1-2). The intent promotes by listed email; a fix needs a verification flow, which is outside this story. |
| After-create hook promotes all listed emails, may not run before the first session reads the role | medium | patch | Unproven race, but a `create.before` hook that sets the role for the listed email is deterministic and affects only that user. |
| No unit test for `ADMIN_EMAILS` parsing (trim, case, dedupe, invalid) | medium | patch | Matrix row "Bad list" has no covering test. |
| No test for start-time promotion, idempotence, never-demote | medium | patch | Matrix row "Seed at start" has no covering test; make `seedAdmins(emails)` take the list so a test can call it. |
| Dock never asserted for an admin at 390px | medium | patch | Matrix row "Menu" covers the dock only by screenshot. |
| Forged-role test does not assert the sign-up succeeded | low | patch | The 403 could come from a rejected sign-up; one added assertion fixes it. |
| `/admin` subtitle promises features that do not exist | low | patch | Drop the subtitle. |
| No demotion path when an email leaves `ADMIN_EMAILS` | low | false | Spec "Never" excludes demotion. |
| `disabled` unused / not a session field / disabled admin keeps access | low | false | Spec states 7.1 only stores it; 7.4 enforces. |
| Case-sensitive match, role CHECK constraint, semicolon separators, deprecated `z.string().email()` | low | false | Better Auth lower-cases emails; the rest need extra complexity for no shown failure. |
| Guard is by convention, no lint for admin routes | low | false | Single helper per AD-16; no second admin route exists yet. |
| Test fixture races / 8s fallback in `registerOrLogin` | low | false | Full run passed twice; cost only. |
| Design fidelity: placeholder copy | low | patch | Same as the subtitle row. |

## Verification

**Commands:**
- `npm run typecheck && npm run lint` -- expected: clean
- `npm test` (PowerShell) -- expected: vitest passes
- `npm run test:api` and `npm run test:e2e` (PowerShell) -- expected: all pass, including the new specs
