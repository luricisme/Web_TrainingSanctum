---
title: 'User Login & Logout'
type: 'feature'
created: '2026-11-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a72c9561dbba6b0dbeaa7816a1b13f565077b016'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Web_TrainingSanctum-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.2 lets a user register and be logged in, but a registered user has no way to log in again after the session ends, no way to log out, and no shared guard that makes protected Route Handlers answer `401` for unauthenticated callers.

**Approach:** Add a `/login` page (Better Auth `signIn.email`) styled like `/register`, a logout control, and a reusable session guard for Route Handlers that returns `401` in the standard error envelope. Better Auth's sign-in/sign-out endpoints already exist behind the `/api/auth/[...all]` catch-all.

## Boundaries & Constraints

**Always:**
- Reuse the existing Better Auth instance (`apps/web/lib/auth.ts`) and client (`auth-client.ts`); no hand-rolled sessions or password checks.
- Wrong password and unknown email must be indistinguishable: same status, same code, same generic message ("Invalid email or password."), shown as a form-level error, never on a single field.
- Sign-in failures use the `{error:{code,message}}` envelope on the wire (AD-10), extending `ENVELOPE_WRAPPED_PATHS` in the catch-all route; no `fields` for sign-in.
- Login input is validated with a shared Zod schema in `packages/domain` (email format, non-empty password) before any Better Auth call. Do not apply the 8-character registration minimum at login.
- The session guard lives in `apps/web/lib` (not `packages/domain`), returns the session or a `401` envelope Response, and is what every future non-auth Route Handler calls first.
- UI conforms to DESIGN.md tokens and Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes. Form errors use `role="alert"`; the submit button reflects busy state (deferred-work a11y items, applied to new UI only).
- On successful login, redirect to `/`.

**Never:**
- No password reset, "remember me" toggle, social login, or email verification.
- No session-lifetime work beyond Better Auth defaults (Story 1.4), no app shell, route gating or middleware redirects (Story 1.5), no Settings page.
- Do not restyle or refactor `/register`, apart from one link to `/login`.
- No new Route Handler that returns data beyond the minimal `GET /api/me` below.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Login success | Registered email + correct password | Session cookie set; client lands on `/` | N/A |
| Wrong password | Registered email, bad password | `401`, envelope code `INVALID_EMAIL_OR_PASSWORD` | Form-level generic error, no cookie |
| Unknown email | Unregistered email | Identical response to Wrong password | Same generic form-level error |
| Invalid input | Malformed email or empty password | No Better Auth call | Field-level errors on `email` / `password` |
| Logout | Valid session | Cookie invalidated; session row gone; client back on `/login` | N/A |
| Unauthenticated protected call | No/expired/revoked cookie to `GET /api/me` | `401` envelope `UNAUTHENTICATED` | N/A |
| Authenticated protected call | Valid session | `200 {data:{id,email,name}}` | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/lib/auth.ts` -- existing server instance; sign-in/sign-out come from its `emailAndPassword` config (no change expected).
- `apps/web/lib/auth-client.ts` -- exports `signUp, signOut, useSession`; add `signIn`.
- `apps/web/app/api/auth/[...all]/route.ts` -- `ENVELOPE_WRAPPED_PATHS` / envelope reshaping; add `/api/auth/sign-in/email` (no `fields`).
- `apps/web/app/register/page.tsx` -- template for layout, tokens, envelope-error unwrapping (`error.error`); only add a "Log in" link.
- `packages/domain/src/auth/registration.ts`, `src/index.ts` -- pattern for a pure Zod schema + barrel export; AD-1 import rules apply.
- `packages/domain/src/http.ts` -- `ErrorEnvelope` type for the guard.
- `apps/web/app/page.tsx` -- landing page; host the minimal logout control here until Story 1.5's Settings.
- `tests/{domain,api,e2e}/registration*` -- conventions to copy (random emails, `Origin` header on cookie-carrying requests, `prisma` for DB asserts).

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/auth/login.ts` + `src/index.ts` -- `loginSchema` (email, non-empty password) and export -- AD-6 validation before Better Auth
- [x] `apps/web/lib/auth-client.ts` -- export `signIn` -- consumed by login page
- [x] `apps/web/app/api/auth/[...all]/route.ts` -- wrap sign-in failures in the standard envelope -- AD-10
- [x] `apps/web/lib/session.ts` -- `requireSession(request)` using `auth.api.getSession({headers})`; returns `{session}` or a `401` `UNAUTHENTICATED` envelope Response -- reusable guard for all later routes
- [x] `apps/web/app/api/me/route.ts` -- `GET` guarded by `requireSession`, returns `{data:{id,email,name}}` -- minimal protected endpoint that proves the guard and logout end to end
- [x] `apps/web/app/login/page.tsx` -- login form in the `/register` editorial split style, generic form-level error, link to `/register` -- AC1/AC2
- [x] `apps/web/app/register/page.tsx` -- add a link to `/login` -- discoverability only
- [x] `apps/web/app/components/logout-button.tsx` + `apps/web/app/page.tsx` -- client button calling `signOut`, then `router.push("/login")`; shown only with a session (`useSession`) -- AC3 until Settings exists
- [x] `tests/domain/login-validation.test.ts` -- schema edge cases
- [x] `tests/api/login.spec.ts` -- success sets cookie; wrong password and unknown email return identical envelopes; after sign-out `GET /api/me` is `401` and the session row is gone; `GET /api/me` without a cookie is `401`
- [x] `tests/e2e/login.spec.ts` -- register, log out, log in via UI and land on `/`; wrong-password UI shows the generic alert and stays on `/login`; light and dark screenshot check

**Acceptance Criteria:**
- Given a registered account, when valid credentials are submitted, then a session is established and the user lands on `/`.
- Given invalid credentials of either kind, when login is attempted, then the response and message are identical and reveal nothing about which part was wrong.
- Given a logged-in session, when the user logs out, then the cookie is invalidated and subsequent requests return `401` in the standard envelope.
- Given no valid session, when any request passes through `requireSession`, then it is rejected with `401` and `{error:{code,message}}`.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

## Implementation Notes

- Better Auth rate-limits sign-in/sign-up (3 per 10s per IP) when `NODE_ENV=production`, which `next start` (the Playwright webServer) is. With ~10 sign-ups per run, parallel tests got 429s, which also broke two spec-1-2 registration tests. Added optional env `AUTH_RATE_LIMIT` (`on` default, `off` only in `playwright.config.ts`) wired into `apps/web/lib/auth.ts`; production behavior is unchanged. Touches `env.ts`, `auth.ts` and `playwright.config.ts`, which the spec's task list did not name.
- Verified against a throwaway `postgres:16-alpine` (Podman, port 5433): typecheck and lint clean, Vitest 18/18, Playwright 17/17 (api + e2e). Dark/light login screenshots in `test-results/screenshots/` (gitignored).
- Not done: no screenshot of the `/` logout button; `mockups/key-screens.html` comparison covered only the login layout.

## Spec Change Log

## Review Triage Log

- **medium, patch** — `logout-button.tsx`: `signOut()` returns `{error}` rather than throwing, yet the code redirects to `/login` anyway, leaving a live session while the user believes they are logged out (Blind, Edge, Gap: same root cause).
- **medium, patch** — sign-in 429 (rate limiter) has no `code` in Better Auth's body, so `route.ts` returns it unwrapped, breaking the spec's envelope rule; `login/page.tsx` shows "Something went wrong" with no hint to wait; no test covers any non-401 path (Blind, Edge, Gap).
- **medium, patch** — `loginSchema` does not trim the email, so an autofill/paste trailing space is rejected as an invalid address (Blind, Edge).
- **medium, patch** — `AUTH_RATE_LIMIT=off` in a production deploy would silently disable login brute-force protection, and no test pins the default to "on" (Blind, Edge, Gap).
- **low, patch** — `hover:text-accent` on the Log in / Create one links adds accent to a second actionable control; DNA hover feel is a background step (Design). Direct one-class correction.
- **low, defer** — Already-authenticated visitor can open `/login`, `/register`; unauthenticated `/` has no link to login (Blind, Edge). Frozen Never excludes route gating; Story 1.5 owns redirects.
- **low, defer** — Input focus gets no focus-to-first-invalid-field, `aria-describedby` for the form alert (Blind). Already tracked in deferred-work (spec-restyle a11y item).
- **low, defer** — Literal type-scale/spacing values instead of tokens (Design). Already tracked in deferred-work (typography tokens item); pattern inherited from `/register`.
- **low, rejected** — `requireSession` has no try/catch around `getSession` (Edge): a DB outage fails every route anyway; guard adds complexity for an unshown case.
- **low, rejected** — `router.refresh()` after login/logout (Edge): the e2e login test shows the Log out button rendering after redirect; stale state not demonstrated.
- **low, rejected** — Screenshot tests assert no baseline (Blind, Edge, Gap): needs baseline management, more than a direct correction.
- **low, rejected** — "Welcome back" copy and subhead as filler; split layout and `rounded-lg` card; double focus ring; logout button `rounded-sm`/no border (Design): copy and layout were chosen in the spec and mirror the approved `/register`; logout button is a temporary control until Story 1.5.
- **low, rejected** — Unknown-email UI parity e2e, API test cleanup, shared form-style helper, no-store header on `/api/me` (Blind, Edge): API test already pins the identical envelope; precedent from 1.2 tests; no demonstrated harm.
- **false** — Log out click races hydration (Edge): Playwright's click auto-waits for the button to exist and the test passes.
- **false** — Sign-in envelope code unverified, non-sign-in paths changed (Blind): `tests/api/login.spec.ts` asserts `INVALID_EMAIL_OR_PASSWORD` and only the sign-in path was added to the set.
- **false** — Sign-out session assertion by token is flaky/misleading (Edge): it keys on the specific session token, so it proves that cookie's session was revoked.
- **false** — Forgot-password link, show/hide toggle, autofocus (Blind): password reset is excluded by the frozen Never; the rest are unrequested features.

## Design Notes

Choices made without asking (not user-visible risks): logout lives on `/` as a small text button until Story 1.5 adds Settings (where EXPERIENCE.md places it); `GET /api/me` exists only so the "401 after logout" AC is testable before real card/folder routes exist; login copy is "Welcome back" / "Log in" in the register screen's voice.

```ts
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});
```

## Verification

**Commands:**
- `npm run typecheck -ws --if-present` -- expected: no errors
- `npm test` -- expected: Vitest passes including login-validation
- `npm run test:api` -- expected: Playwright API specs pass (needs a disposable Postgres, as in spec-1-2)
- `npm run test:e2e` -- expected: Playwright E2E specs pass

**Manual checks:**
- Open `/login` in dark and light themes and compare against `/register` for consistency.
