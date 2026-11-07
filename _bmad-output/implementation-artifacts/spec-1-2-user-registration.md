---
title: 'User Registration'
type: 'feature'
created: '2026-11-07'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4a2574ea42e816ea05c813d2aa7ceb8ab436f5d7'
context: ['{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Web_TrainingSanctum-2026-11-01/ARCHITECTURE-SPINE.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.1 scaffolded the app skeleton but there is no way for a user to create an account — no auth library, no auth-related tables beyond a bare `User` model, no registration endpoint or page — so nothing `user_id`-scoped (all of Epic 2+) can be built or verified yet.

**Approach:** Wire up Better Auth (email/password) with `@better-auth/prisma-adapter` against the existing Prisma client in `packages/db`, extend the schema with Better Auth's required tables plus the custom `timezone` field captured from the browser at signup, add Better Auth's catch-all Next.js route handler, and a minimal `/register` page/client that submits email/password/timezone and leaves the user logged in on success.

## Boundaries & Constraints

**Always:**
- Use Better Auth + `@better-auth/prisma-adapter` wired against `packages/db`'s existing Prisma client singleton (AD-2) — never instantiate a second `PrismaClient`.
- Put all Better Auth routes under `apps/web/app/api/auth/[...all]/route.ts` — the one documented exception to "every Route Handler requires a session cookie."
- Capture `timezone` (IANA string, via `Intl.DateTimeFormat().resolvedOptions().timeZone` client-side) at signup and persist it on the `User` record; not user-editable in v1.
- Successful registration logs the user in immediately via Better Auth's own post-signup session issuance — no separate login step.
- Duplicate email -> field-level error on `email` via the standard `{error:{code,message,fields}}` envelope, not a silent overwrite or generic 500.
- Invalid email format / missing or too-short password -> field-level Zod validation error, checked before any Better Auth call.
- Any shared validation schema lives in `packages/domain` and must respect its existing AD-1 import boundary (zero `next`/`react`/`@prisma/client` imports); Better Auth config/wiring itself lives in `apps/web`.
- Schema changes only via a Prisma migration committed in `packages/db` (AD-2).
- Minimum password length: 8 characters — no stricter policy specified anywhere upstream, so don't invent one.
- On success, redirect to the existing `/` landing page — no authenticated shell exists yet (that's Story 1.5).

**Never:**
- No OAuth/social login, no invite flow, no email verification flow — v1 is email+password only, immediate login (per PRD).
- No login/logout page or flow (Story 1.3), no session-persistence work beyond Better Auth's defaults (Story 1.4), no authenticated app shell or route gating (Story 1.5) — this story only needs a valid session to exist after registering.
- No password-reset flow, no UI polish beyond a minimal functional form using the existing dual-theme Tailwind tokens — no design spec exists for this screen in `DESIGN.md`, so don't invent one.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Valid email + password (>=8 chars) + browser timezone; no existing user with that email | `User` row created (hashed password, timezone stored), session cookie set, client redirected to `/` | N/A |
| Duplicate email | Email already registered | No record mutated | Field-level error on `email`, standard error envelope |
| Invalid email format | e.g. `not-an-email` | No Better Auth call made | Field-level Zod error on `email` |
| Missing/short password | Empty or <8 chars | No Better Auth call made | Field-level Zod error on `password` |

</frozen-after-approval>

## Code Map

- `packages/db/schema.prisma` -- extend with Better Auth's required `Session`/`Account`/`Verification` models alongside the existing `User` model (`id`, `email`, `hashedPassword`, `timezone`, timestamps); keep `timezone` as a plain field on `User`.
- `packages/db/client.ts` -- existing Prisma client singleton (`export const prisma`); Better Auth's Prisma adapter must wrap this same instance, not a new one.
- `apps/web/lib/env.ts` -- `BETTER_AUTH_SECRET` is already validated (non-empty string); add `BETTER_AUTH_URL` (or equivalent) only if Better Auth's config requires it.
- `packages/domain/src/http.ts` (+ `src/index.ts` barrel) -- reuse `SuccessEnvelope`, `ErrorEnvelope`, `isErrorEnvelope` for the registration route's responses; no changes needed.
- `packages/domain/eslint.config.mjs` -- existing AD-1 `no-restricted-imports` boundary (blocks `next`, `react`, `@prisma/client`); any new domain-side validation module must stay clean under it.
- `apps/web/package.json` -- add `better-auth` and `@better-auth/prisma-adapter` dependencies (currently absent repo-wide).
- `apps/web/app/` -- currently only `globals.css`, `layout.tsx`, `page.tsx`; no `app/api` directory exists yet.
- `tests/domain/`, `tests/api/`, `tests/e2e/` -- existing placeholder specs plus `vitest.config.ts` / `playwright.config.ts` at repo root; follow their existing conventions for new specs.
- Root `package.json` scripts -- `test`, `test:api`, `test:e2e`, `typecheck -ws`, `db:migrate:dev` already defined; no new scripts needed.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/package.json` -- add `better-auth`, `@better-auth/prisma-adapter` dependencies -- required to implement auth
- [x] `packages/db/schema.prisma` -- add Better Auth's required `Session`/`Account`/`Verification` models, keep `timezone` on `User` -- prerequisite for the Prisma adapter
- [x] `packages/db/migrations/` -- generate and commit the Prisma migration for the schema change -- irreversible DB change, must be reviewable as a diff
- [x] `apps/web/lib/auth.ts` -- configure the Better Auth server instance: email/password provider, Prisma adapter against `packages/db`'s client, `timezone` via `user.additionalFields`, 30-day sliding session (per epic context) -- central config reused by Stories 1.3/1.4
- [x] `apps/web/app/api/auth/[...all]/route.ts` -- Better Auth's Next.js App Router catch-all handler (GET/POST) -- the one unauthenticated API surface
- [x] `packages/domain/src/auth/registration.ts` -- Zod schema for email/password/timezone request validation -- enforced before any Better Auth call, AD-1-compliant
- [x] `apps/web/lib/auth-client.ts` -- Better Auth browser client instance -- consumed by the registration page
- [x] `apps/web/app/register/page.tsx` -- minimal registration form (email, password, timezone captured via `Intl.DateTimeFormat().resolvedOptions().timeZone`) using existing Tailwind theme tokens, calls `signUp.email`, shows field errors, redirects to `/` on success
- [x] `tests/domain/registration-validation.test.ts` -- Vitest coverage of the Zod schema's edge cases (invalid email, short/missing password)
- [x] `tests/api/registration.spec.ts` -- Playwright request-fixture test: successful registration creates a session + `User` row; duplicate email returns a field-level error
- [x] `tests/e2e/registration.spec.ts` -- Playwright browser test: fill the form, submit, land on `/` authenticated

**Acceptance Criteria:**
- Given no account exists for an email, when valid email + password are submitted, then a `User` record is created with a hashed password and browser-captured `timezone`, and the caller ends up with a valid session (no separate login step)
- Given the email is already registered, when submitted again, then the response is the standard error envelope with a field-level error on `email`, and no existing record is mutated
- Given an invalid email format or missing/short password, when submitted, then the response is a field-level Zod validation error and no Better Auth call is made

## Implementation Notes

- **`User.hashedPassword` dropped, not kept/synced.** Better Auth's email/password provider stores the password hash on the related `Account` row (`providerId: "credential"`, field `password`), never on `User`. It owns hashing/verification end-to-end (scrypt by default) and nothing else writes that field. Keeping `User.hashedPassword` as a second, unwritten/hand-synced column would itself be the "hand-rolling" the Design Notes say not to do, so it was removed from the `User` model rather than kept as dead weight or synced via a database hook. The AC's "a `User` record is created with a hashed password" is satisfied via the `User` -> `Account` relation (verified directly in `tests/api/registration.spec.ts`).
- **`name` field added to `User`, not in the UI.** Better Auth's base `User` schema requires `name` (non-optional) on every `signUp.email` call; this is a hard library requirement, not a product decision. Since spec-1-2's Boundaries explicitly rule out any UI beyond email/password/timezone, `apps/web/app/register/page.tsx` derives a throwaway default (the email's local part) instead of adding a name field to the form.
- **No separate `/api/register` Route Handler.** The Code Map/Tasks list only the Better Auth catch-all (`apps/web/app/api/auth/[...all]/route.ts`) as the API surface for this story, so `signUp.email` is called directly from the client against that route. The "standard `{error:{code,message,fields}}` envelope" for duplicate-email (Boundaries) is therefore applied at the UI layer: `apps/web/app/register/page.tsx` maps Better Auth's own error code (`USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`) to a field-level error on `email` using `packages/domain/http.ts`'s `ErrorEnvelope` shape for its internal error state, rather than the raw HTTP response body from the catch-all route being in that exact wire shape (Better Auth owns that route's response format per the frozen Boundaries' "one documented exception").
- **`advanced.database.generateId: false`** is set in `apps/web/lib/auth.ts` so Better Auth omits `id` from create payloads and lets Prisma's `@default(cuid())` generate it instead — otherwise Better Auth would generate its own (non-cuid) IDs, violating the architecture spine's Consistency Conventions ("All primary keys are Prisma-generated `cuid()` strings").
- **Pre-existing bug fixed in `packages/db/client.ts`:** the story-1.1 file imported the generated Prisma client via `"./generated/client/client.js"` (explicit `.js` extension). TypeScript's `bundler` moduleResolution accepts that (hence it passed `tsc --noEmit` before), but Next.js's Turbopack production build cannot resolve a `.js` specifier to a `.ts` file and fails with `Module not found`. This was latent and undetected because nothing in `apps/web` imported `packages/db` before this story. Fixed by dropping the extension (`"./generated/client/client"`), matching how the generated client's own internal imports are written. Verified with a full `next build` + `next start` smoke test (see Verification below).
- **Migration could not be applied against a live database in the implementation subagent's sandbox.** No local Postgres/Docker was available there, and `.env.local` was not read (would materialize real credentials outside the task's scope). Instead, `packages/db/migrations/20261108010000_add_better_auth_tables/migration.sql` was produced with Prisma's own engine via `prisma migrate diff --from-schema <pre-change schema> --to-schema <post-change schema> --script` (a live-DB-free, schema-to-schema diff), so its SQL is exactly what `prisma migrate dev` would have generated, not hand-guessed. `prisma validate` confirmed the resulting schema is valid.
- **Migration applied and both Playwright suites run against a real, disposable Postgres (orchestrator, not the implementation subagent).** Started a local Podman machine + a throwaway `postgres:16-alpine` container, ran `npm run db:migrate:deploy` (both migrations applied cleanly) and `npm run db:generate`, then `npm run test:api` / `npm run test:e2e` against it. Container torn down afterward — no artifacts of it remain in the repo or a persistent service.
- **Matrix Test Audit caught a real gap, not a product bug.** `tests/api/registration.spec.ts`'s duplicate-email test initially failed with Better Auth's `MISSING_OR_NULL_ORIGIN` instead of the expected `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`: Playwright's `request` fixture persists the first call's session cookie onto the second call within the same test, and Better Auth's CSRF protection requires an `Origin` header once a request carries a session cookie. A real browser always sends `Origin` on same-origin fetch/XHR, so this never affects the actual registration page — it was a test-fixture gap, not app behavior. Fixed by adding `headers: { Origin: base }` to both `request.post` calls in that test, matching real browser behavior rather than weakening the app's CSRF check. All 3 API tests and both E2E tests now pass against the live DB (5/5), alongside the 9/9 Vitest tests.

## Spec Change Log

- Code Map's `User` field list (`id, email, hashedPassword, timezone, timestamps`) changed to `id, name, email, emailVerified, image, timezone, timestamps`: `hashedPassword` removed (Better Auth stores it on `Account`, not `User` — see Implementation Notes), and `name`/`emailVerified`/`image` added because they are non-optional in Better Auth's core `User` schema. No change to the frozen Intent/Boundaries/AC: the AC's "hashed password" and "timezone" guarantees still hold, just via the `Account` relation for the former.

## Review Triage Log

- **false** — Blind Hunter flagged apparent text corruption spliced into `packages/domain/src/auth/registration.ts`'s comment inside the reviewed diff file. Refuted: the actual source file on disk is clean; the corruption was a self-inflicted artifact of the orchestrator's diff-generation command redirecting git's stderr (CRLF warnings) into the same file as the diff (`2>&1`). Diff regenerated cleanly for review; no code change needed.
- **false** — Blind Hunter: `registerSchema`'s `timezone: z.string().min(1)` doesn't validate IANA format. Refuted: this exact validation shape is what the spec's own (non-frozen but author-provided) Design Notes specify verbatim as sufficient; not a deviation from stated intent.
- **false** — Blind Hunter: version inconsistency between `better-auth`'s `zod@^4.5.4` peer and `packages/domain`'s pinned `zod@4.6.7` risks multiple incompatible instances. Refuted: verified only one `node_modules/zod` exists repo-wide (no nested/duplicate copies); npm's hoisting resolved to a single compatible instance.
- **low, rejected** — Blind Hunter: `tests/e2e/registration.spec.ts` asserts success via `cookie.name.includes("session")`, an implementation-detail string match. Rejected: unlikely to break in everyday use, and a more robust fix (checking via `authClient`/`useSession`) is more than a direct correction.
- **low, rejected (out of scope)** — Blind Hunter: no visible password-length hint and no `aria-live`/`role="alert"` on error text. Rejected as out of scope: `_bmad-output/planning-artifacts/epics.md` Story 5.5 ("cross-cutting accessibility & microcopy pass") explicitly owns this class of work later; this story's intent (minimal functional form) excludes it now.
- **medium, patch** — Blind Hunter + Edge Case Hunter (duplicate root cause): `apps/web/app/register/page.tsx`'s JSX only renders `fieldErrors.email`/`fieldErrors.password`; a `timezone` validation failure (e.g. `Intl` unavailable) sets `fieldErrors.timezone` but nothing displays it — a silently-failed, unrecoverable submit.
- **low, patch** — Edge Case Hunter: no `catch` around `await signUp.email(...)` in `handleSubmit`; a thrown/network error produces an unhandled rejection with no visible error message (only `finally` runs).
- **low, patch** — Edge Case Hunter: `apps/web/lib/env.ts`'s `BETTER_AUTH_URL` schema rejects an explicitly-empty string instead of treating it as unset, which would fail boot validation unnecessarily.
- **medium, patch** — Blind Hunter + Edge Case Hunter (duplicate root cause): the migration's `ALTER TABLE "users" ADD COLUMN "name" TEXT NOT NULL` has no default/backfill. Zero users exist anywhere today (no seed infra yet), so not currently exploitable, but `DEPLOYMENT.md` documents that Neon preview branches are seeded from production schema **and data** — so this pattern must be safe unconditionally, not just today, before it ships.
- **medium, patch** — Blind Hunter: `defaultNameFromEmail` permanently stores an un-editable, throwaway `name` (the email's local part) on every registered user, with no form field and no documented path to set a real name later.
- **medium, patch** (reclassified from an initial intent_gap read) — Blind Hunter + Edge Case Hunter claims-check (high confidence): the frozen Boundaries state unconditionally ("Always") that duplicate email produces "the standard `{error:{code,message,fields}}` envelope," but the actual HTTP response from the Better Auth catch-all is Better Auth's own flat `{code,message}` shape — the envelope is applied only in the page's local React state. On closer reading there is exactly one literal interpretation of the frozen text (no carve-out exists for wire format, only for the session-cookie requirement), so this is an unambiguous implementation deviation fixable without renegotiating intent, not a genuine ambiguity — routed as patch rather than looping back to the human.
- **low, defer** — Blind Hunter: no `trustedOrigins` configured and `BETTER_AUTH_URL` left optional; deploying behind a proxy without setting it risks the same `MISSING_OR_NULL_ORIGIN` failure mode hit during testing. Better Auth already warns at boot; not demonstrated broken in this story's verification. Deferred to a `DEPLOYMENT.md` callout before go-live rather than a code change now.
- **patch** (pre-verified, filed by Verification Gap Reviewer) — No test drives `/register` with an invalid email or short password and asserts a field error renders with no Better Auth call made; `tests/e2e/registration.spec.ts` only covers the happy path.
- **patch** (pre-verified, filed by Verification Gap Reviewer) — No test registers the same email twice through the `/register` UI and asserts the email field (not a generic form error) shows the duplicate-account message.

## Design Notes

Better Auth owns password hashing and session issuance — do not hand-roll either. Point its Prisma adapter at the same singleton `packages/db/client.ts` exports; do not create a second `PrismaClient`. Minimal validation shape:

```ts
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  timezone: z.string().min(1),
});
```

## Verification

**Commands:**
- `npm run typecheck -ws --if-present` -- expected: no TypeScript errors across workspaces
- `npm run db:migrate:dev` -- expected: migration applies cleanly against local Postgres
- `npm test` -- expected: Vitest registration-validation tests pass
- `npm run test:api` -- expected: Playwright API registration spec passes
- `npm run test:e2e` -- expected: Playwright E2E registration spec passes

**Manual checks (if no CLI):**
- Visit `/register` locally, submit valid data, confirm a session cookie is set and a `User` row with hashed password + timezone appears in the database.
