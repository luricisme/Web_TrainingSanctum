# Epic 1 Context: Foundation, Auth & Live Deployment

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A user can create an account, log in and out, and reach a live, publicly deployed instance of Training Sanctum with its four-item app shell in place. This epic also lays the engineering foundation everything after it depends on: the domain/API/db layering, CI running all three test suites, and the deployed Vercel+Neon environment. Nothing in later epics (card management, import, review, stats) can be built until this scaffold, auth, and deployment pipeline exist.

## Stories

- Story 1.1: Live, Deployed Application Skeleton
- Story 1.2: User Registration
- Story 1.3: User Login & Logout
- Story 1.4: Session Persistence
- Story 1.5: Authenticated App Shell & Theme Toggle

## Requirements & Constraints

- A user can create an account and log in/out with email and password; all persisted data is scoped to `user_id`; unauthenticated requests to any protected endpoint are rejected with `401`.
- A logged-in session persists across browser sessions via a 30-day sliding window (refreshed on activity); concurrent sessions from multiple devices/browsers are independently valid (no forced single-session logout).
- `User.timezone` (IANA string) must be captured from the browser at signup — it is not user-editable in v1 — because it becomes the single source of local-day truth used later for due-queue filtering and streak attribution (not needed by this epic's own stories beyond capturing and storing it).
- Registration: duplicate email produces a field-level error, not a silent overwrite; invalid email/missing password produce field-level validation errors; successful registration logs the user in immediately (no separate login step).
- Login: invalid credentials return a generic error (no user enumeration).
- The deployed app must be live and publicly reachable (Vercel) independent of any later feature work; PRs must get their own preview deployment paired with its own database branch.
- CI must run the full test pyramid (unit, API/integration, E2E) on every push, even though most suites will be near-empty scaffolds at this stage — the pipeline itself is the deliverable.
- Environment variables must be validated at process start; the app fails fast with a clear error on missing/malformed config rather than failing deep inside a request.

## Technical Decisions

- **Monorepo structure** (no starter template — built from scratch): `apps/web` (Next.js App Router), `packages/domain` (pure, framework-free business logic), `packages/db` (Prisma schema + client), `tests/` (`domain/` for Vitest, `api/` for Playwright request-fixture tests, `e2e/` for Playwright browser tests).
- **Domain isolation**: `packages/domain` must have zero imports from `next`, `react`, `@prisma/client`, or any HTTP/db library; only `apps/web/app/api/**` may import it. This epic doesn't add domain logic yet, but the package and the rule must exist from the start.
- **Single data-access path**: Postgres is reachable only through the Prisma client exported by `packages/db`; schema changes only via Prisma migrations there (`prisma migrate dev` locally).
- **API boundary shape**: every client–server interaction is a Next.js Route Handler under `app/api/**/route.ts`; Server Actions are never used for data mutations/queries. Auth routes live under `app/api/auth/[...all]/`.
- **Request validation**: every Route Handler validates body/query with a Zod schema before touching domain/db code.
- **Response envelope**: every successful response is `{ data: T }` (or `{ data: T[], meta?: {...} }`), defined as a shared type importable by both Route Handlers and the UI fetch wrapper. Establish this convention now — all later epics' routes follow it.
- **Error envelope**: `{ error: { code, message, fields?, details? } }` — `fields` for single-record field errors (e.g. registration validation), `details` for batch/line-numbered errors (used later by import); never both, never a bare string.
- **Auth**: Better Auth + `@better-auth/prisma-adapter`, session cookie required on every Route Handler except `/api/auth/**`; unauthenticated requests return 401 with the standard error envelope; fixed 30-day sliding session window refreshed on activity.
- **Config validation**: environment variables (`DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.) validated via Zod at process start.
- **Testing architecture**: Vitest for `packages/domain` (no network/DB/browser dependency); Playwright for API/integration (seeded test DB) and E2E (browser fixture); GitHub Actions runs all three on every push.
- **Stack**: Next.js 16.x (App Router, Turbopack, Node 20+), TypeScript 5.x, Prisma 7.8.x, Postgres via Neon (free tier), Better Auth, TanStack Query v5, Zod 3.x/4.x, Tailwind CSS v4, Vitest, Playwright, Vercel hosting, GitHub Actions CI.
- **Deployment topology**: Vercel production + per-branch preview deployments, each paired with a Neon branch seeded from minimal fixtures (not a prod copy); CI spins up a disposable Postgres per run; local dev uses `.env.local` only.
- **Data model naming**: Prisma model names match domain vocabulary exactly (`User`, `Card`, `Folder`, `SchedulingRecord` — the latter two not needed until Epic 2, but `User` is created here). All primary keys are Prisma-generated `cuid()` strings. All timestamps stored in UTC.
- **Observability**: write paths that can silently lose data should log a structured single-line summary (operation, outcome) — relevant here mainly as a convention to establish, not a heavy requirement for auth routes.

## UX & Interaction Patterns

- Dual-theme design tokens (dark default, light via toggle) must be scaffolded as CSS variables mapped for Tailwind v4: background, card surface, elevated surface, text, accent (single saturated color used for exactly one actionable thing per screen, e.g. active nav item), semantic colors, borders/dividers. Dark mode is near-black charcoal-navy; light mode is a sage/white/ink palette recreated from a reference source — the light-mode contrast is flagged as an unverified assumption to resolve later (Epic 5), not in this epic.
- Sidebar nav: fixed 240px width, four flat icon+label items (Review, Classes, Stats, Settings — no Import item; import lives inside a Folder's "Add cards"), each linking to a placeholder page for now. Active item gets elevated-surface background + accent-colored text. Hidden entirely on mobile (<640px); review-specific hiding (focus mode) is out of scope for this epic and lands in Epic 4.
- Theme toggle lives in Settings, switches the full token set, and the choice persists across reloads.
- Unauthenticated visitors attempting to reach any shell route are redirected to login.
- Responsive breakpoints to establish: mobile <640px, tablet 640–1024px, desktop >1024px.

## Cross-Story Dependencies

- Story 1.1 (scaffold + CI + deployment) must land before 1.2–1.5 can be built or verified against a live pipeline.
- Story 1.2 (registration, including `User.timezone` capture) must precede 1.3 (login/logout) and 1.4 (session persistence), since both depend on an existing `User` record and session mechanism.
- Story 1.5 (app shell + theme toggle) depends on an authenticated session existing (1.2–1.4) to gate shell routes.
- This epic is a hard prerequisite for all later epics: Epic 2's Card/Folder data is `user_id`-scoped (needs 1.2's auth), Epic 4's due-queue/streak logic needs `User.timezone` captured here (AD-8), and every later Route Handler follows the response/error envelope and auth conventions established in this epic.
