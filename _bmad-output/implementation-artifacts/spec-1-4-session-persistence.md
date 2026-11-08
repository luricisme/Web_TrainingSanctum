---
title: 'Session Persistence'
type: 'feature'
created: '2026-11-08'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Web_TrainingSanctum-2026-11-01/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.4 requires that a logged-in user stays logged in across browser restarts, that activity refreshes a 30-day sliding window, that 30+ days of inactivity forces a new login, and that one account can hold independent sessions on several browsers. `apps/web/lib/auth.ts` already sets `session.expiresIn` (30 days) and `updateAge` (1 day), but nothing proves the cookie is persistent, the window slides, expiry is enforced, or sessions are independent.

**Approach:** Verify each acceptance criterion against the real Better Auth behavior with API and E2E tests, and change `auth.ts` only where a test shows the current config misses a criterion. Add no new endpoints and no UI.

</frozen-after-approval>

## Implementation Notes

- Context: Story 1.3 is done; `requireSession` and `GET /api/me` already exist and are the probe for session validity. Existing API test conventions are in `tests/api/login.spec.ts` (random emails, `Origin` header on cookie-carrying requests, `prisma` for DB assertions).
- Result: no change to `auth.ts` was needed; the existing config satisfies every criterion. Verified against a throwaway `postgres:16-alpine` (Podman, port 5433): typecheck and lint clean, Vitest 20/20, Playwright 25/25 (api + e2e). Finding while testing: Better Auth derives session age from `expiresAt - expiresIn`, not from `updatedAt`, so the refresh test sets both.
- Tests added (`tests/api/session-persistence.spec.ts`, `tests/e2e/session-persistence.spec.ts`):
- Original plan (`tests/api/session-persistence.spec.ts`, `tests/e2e/session-persistence.spec.ts`):
  - **Persistent cookie:** the session cookie from sign-in has `Max-Age`/`Expires` of about 30 days (not a browser-session cookie). E2E: after UI login, the context's session cookie has `expires` about 30 days out; a new browser context seeded with that storage state lands on `/` still logged in.
  - **Sliding window:** set a session row to `expiresAt` = now+10d and `updatedAt` = 2 days ago, call `GET /api/me`, and assert `expiresAt` moved to about now+30d. A session touched within `updateAge` keeps its `expiresAt`.
  - **Inactivity expiry:** set `expiresAt` in the past, and `GET /api/me` returns `401` `UNAUTHENTICATED`.
  - **Independent sessions:** log the same account in twice with separate request contexts; both get `200` on `/api/me`; sign out one; the other stays `200`.

## Review Triage Log

- **false** — Import/env failure of `@training-sanctum/db` in the API test: the suite ran and passed; `login.spec.ts` imports it identically.
- **false** — `cookieCache` could mask expiry: it is not enabled in `auth.ts`, and the expiry test returns 401.
- **low, rejected** — Missing HttpOnly/SameSite/Secure assertions, `updatedAt` movement, boundary-instant, precondition checks: Better Auth defaults, no demonstrated gap.
- **low, rejected** — E2E tolerances, hardcoded labels, redundant filter, login-path variant: the filter mimics a real browser restart; labels match the existing e2e specs.
- **low, rejected** — E2E "no cookie lands on /login": route gating belongs to Story 1.5 (frozen Never in spec-1-3).
- **low, rejected** — Test data cleanup and remote-baseURL guard: precedent from specs 1-2 and 1-3, tests target a disposable DB.
- **false** — Spec lacks results/traceability and tracking edits are manual: results are in Implementation Notes; the sprint-status edit is what the workflow prescribes.
