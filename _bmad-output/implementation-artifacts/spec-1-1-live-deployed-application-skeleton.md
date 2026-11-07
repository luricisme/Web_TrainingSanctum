---
title: 'Live, Deployed Application Skeleton'
type: 'feature'
created: '2026-11-07'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '58efb6e3cc9044bac4f70729348111f4f6bcbd7c'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repo currently has no application code — only planning artifacts. Nothing after this story (auth, card management, review, stats) can be built, tested, or deployed without a scaffolded monorepo, a working CI pipeline, and a live public URL.

**Approach:** Scaffold the monorepo exactly per the architecture spine's Structural Seed (`apps/web`, `packages/domain`, `packages/db`, `tests/`), wire up Next.js + Prisma + Zod env validation, add GitHub Actions running Vitest + Playwright scaffolds, and deploy to Vercel (prod) + Neon (Postgres), with PR preview deployments paired to Neon branches.

## Boundaries & Constraints

**Always:**
- Follow the Structural Seed layout and naming exactly (`apps/web`, `packages/domain`, `packages/db`, `tests/{domain,api,e2e}`).
- `packages/domain` has zero imports from `next`, `react`, `@prisma/client`, or any HTTP/db library (AD-1) — even though no domain logic exists yet, the package + a lint/tsconfig boundary enforcing this must exist.
- Postgres reachable only via the Prisma client exported from `packages/db` (AD-2); schema only changes via Prisma migrations there.
- Env vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.) validated with Zod at process start; app fails fast with a clear error on missing/malformed config.
- Do this work on a feature branch and open a PR against `main` — required to exercise the PR-preview-deployment AC, not optional polish.
- Response/error envelope types (`{ data: T }`, `{ error: { code, message, fields?, details? } }`) are defined now in a shared location, even though no route uses them yet.
- **Decision:** Use `npm` workspaces (root `package.json#workspaces`) for the monorepo — no pnpm, no extra tooling.
- **Decision:** The agent does not create or link a live Vercel project or Neon database (no authenticated CLI access). Deliverable instead includes a `DEPLOYMENT.md` runbook with exact manual steps (Vercel project link, Neon project + branch creation, GitHub repo secrets) for the human to execute themselves to get the live URL and verify AC4. All other ACs (local dev run, env validation, CI suites green on the PR) must be independently verifiable without a live deployment.

**Never:**
- No Server Actions for data mutations/queries (AD-3) — reserve `app/api/**/route.ts` as the only client-server boundary, even if unused this story.
- No domain logic, auth routes, or Card/Folder/SchedulingRecord models yet — those are stories 1.2+ and Epic 2. Only the `User` model (bare skeleton) exists in schema.prisma per architecture's data-model naming note.
- No Turborepo or extra monorepo tooling beyond native package-manager workspaces — not called for by the architecture.

</frozen-after-approval>

## Code Map

- No existing application code — greenfield. Only planning artifacts exist under `_bmad-output/planning-artifacts/`.
- `_bmad-output/planning-artifacts/architecture/architecture-Web_TrainingSanctum-2026-11-01/ARCHITECTURE-SPINE.md` — binding source for Structural Seed, stack versions, AD-1/2/3/6/10/12/13, Consistency Conventions (error/response envelope, config validation).
- `_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md` — dual-theme tokens, sidebar nav spec (out of scope for this story's AC, but scaffold Tailwind config so Story 1.5 can consume tokens without rework).

## Tasks & Acceptance

**Execution:**
- [ ] `package.json#workspaces` -- root npm workspaces config (`apps/web`, `packages/domain`, `packages/db`) -- links the three workspaces for install/build/test
- [ ] `apps/web/` -- scaffold Next.js 16.x App Router app (TypeScript, Tailwind v4, Turbopack) -- the deployable; AC1
- [ ] `packages/domain/package.json`, `packages/domain/tsconfig.json` -- empty pure-TS package with lint rule/tsconfig `paths` restriction preventing `next`/`react`/`@prisma/client` imports -- enforces AD-1 from day one
- [ ] `packages/db/schema.prisma` -- minimal `User` model (`id` cuid, `email`, `hashedPassword`, `timezone`, timestamps) -- AC1, prerequisite for 1.2
- [ ] `packages/db/client.ts` -- exported Prisma client singleton -- AD-2 single data-access path
- [ ] `apps/web/lib/env.ts` -- Zod schema validating `DATABASE_URL`, `BETTER_AUTH_SECRET` (placeholder var reserved for 1.2) at process start -- AC2
- [ ] `apps/web/lib/http.ts` (or `packages/domain/http.ts`) -- shared `{ data: T }` success envelope and `{ error: {...} }` error envelope types -- AD-10, used by all future routes
- [ ] `apps/web/app/page.tsx` -- minimal live landing page -- AC4 (production URL loads)
- [ ] `tests/domain/placeholder.test.ts` -- one trivial Vitest test -- AC3 (pipeline runs, not full coverage)
- [ ] `tests/api/placeholder.spec.ts` -- one trivial Playwright request-fixture test -- AC3
- [ ] `tests/e2e/placeholder.spec.ts` -- one trivial Playwright browser test hitting the landing page -- AC3
- [ ] `.github/workflows/ci.yml` -- run Vitest + both Playwright suites on every push/PR, spin up disposable Postgres for the API suite -- AC3
- [ ] `vercel.json` -- Vercel monorepo build config pointing at `apps/web` -- prerequisite config the human applies when linking the project per the runbook
- [ ] `DEPLOYMENT.md` -- step-by-step runbook: create Neon project + production/preview branching, `vercel link` + project settings, set `DATABASE_URL`/`BETTER_AUTH_SECRET` in Vercel env vars, add any GitHub Actions secrets needed for CI's disposable Postgres -- AC4 is human-executed from this doc, not agent-executed
- [ ] `.env.example` -- document required env vars without values -- supports fail-fast config convention
- [ ] `README.md` -- replace mojibake placeholder content with real project description, setup, and dev commands -- discovered during investigation; file exists but is corrupted encoding, not a new scope item

**Acceptance Criteria:**
- Given a fresh clone with `.env.local` populated, when `npm install && npm run dev` runs, then the Next.js app starts locally and Prisma connects to a Neon dev branch
- Given `DATABASE_URL` is unset, when the app starts, then it exits with a clear Zod validation error, not a runtime crash mid-request
- Given a PR is opened, when GitHub Actions runs, then Vitest and both Playwright suites execute and pass
- Given the human follows `DEPLOYMENT.md`, when they finish linking Vercel + Neon, then the production URL loads the landing page and a PR gets its own preview URL backed by its own Neon branch

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run typecheck -ws --if-present` -- expected: no TypeScript errors across workspaces
- `npm test` -- expected: Vitest placeholder test passes
- `npm run test:api` / `npm run test:e2e` -- expected: Playwright placeholder specs pass locally
- `git push` + open PR -- expected: GitHub Actions workflow runs all three suites green

**Manual checks (if no CLI):**
- After following `DEPLOYMENT.md`, visit the Vercel production URL in a browser and confirm the landing page renders; confirm a PR produces its own preview URL.
