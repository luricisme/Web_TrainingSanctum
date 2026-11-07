# Deployment Runbook

This story (1.1) ships the application skeleton, CI pipeline, and deploy
config, but **does not** create or link a live Vercel project or Neon
database — the agent that built this has no authenticated CLI access to
either. Follow these steps yourself to get a live URL and verify AC4 of
spec-1-1.

## 1. Create the Neon project

1. Sign in at [neon.tech](https://neon.tech) and create a new project (e.g.
   `training-sanctum`). Note the region closest to your Vercel deployment
   region.
2. Neon creates a default branch (`production`/`main`) — this is your
   **production** database. Copy its pooled connection string (the
   dashboard's "Connection string" panel, `Pooled connection` toggle on).
3. Enable **Neon's Vercel integration** (or do this from the Vercel side in
   step 2 below) so every Vercel preview deployment automatically gets its
   own Neon branch seeded from production schema — this is what satisfies
   the "PR gets its own preview URL backed by its own Neon branch" part of
   AC4. Install from the [Neon Vercel integration
   page](https://neon.tech/docs/guides/vercel) or the Vercel Marketplace.

## 2. Link the Vercel project

1. Install the Vercel CLI if you don't have it: `npm i -g vercel`.
2. From the repo root: `vercel link` and select/create the
   `training-sanctum` project. Vercel should auto-detect the Next.js app at
   `apps/web` via `vercel.json`'s `buildCommand`/`installCommand` (both `cd
   ../..` back to the repo root so `npm install` resolves the npm workspaces
   correctly, then build only `apps/web`).
3. In the Vercel project settings, confirm:
   - **Root Directory**: `apps/web` (if Vercel's project-creation UI asks,
     rather than relying solely on `vercel.json`).
   - **Framework Preset**: Next.js.
   - **Node.js Version**: 20.x.

## 3. Set environment variables in Vercel

In the Vercel project → Settings → Environment Variables, add for
**Production**, **Preview**, and (optionally) **Development**:

| Variable | Production value | Preview value |
| --- | --- | --- |
| `DATABASE_URL` | Neon production branch pooled connection string | Leave unset if using the Neon-Vercel integration (it injects a per-preview branch URL automatically); otherwise set manually per branch |
| `BETTER_AUTH_SECRET` | A strong random secret, e.g. `openssl rand -base64 32` | Can reuse the production value for now (no real auth wired up until story 1.2) |

If you installed the Neon Vercel integration in step 1, it manages
`DATABASE_URL` for Preview deployments itself — don't hand-set a single
static value there, or every preview will share one branch instead of
getting its own.

## 4. Set GitHub Actions secrets (if needed)

The CI workflow (`.github/workflows/ci.yml`) spins up its **own** disposable
Postgres container per run (a `postgres:16` service container) — it does not
need a Neon connection string or any GitHub secret to pass. No action needed
here unless you later want CI to exercise a real Neon branch instead of the
disposable container.

## 5. Deploy and verify

1. Push to `main` (or merge the story's PR) to trigger a production
   deployment; open a PR to trigger a preview deployment.
2. **Production check:** visit the Vercel-assigned production URL (Vercel
   project → Deployments → Production). Confirm the landing page
   ("Training Sanctum") renders.
3. **Preview check:** open the PR's Vercel preview URL (posted as a PR
   check/comment by the Vercel GitHub integration). Confirm it renders and,
   if the Neon integration is installed, confirm the PR has its own Neon
   branch under the Neon project's Branches tab.
4. **Local dev check:** `cp .env.example .env.local`, fill in a Neon dev
   branch's connection string and a `BETTER_AUTH_SECRET`, then
   `npm install && npm run dev`. Confirm the app starts and Prisma connects
   (no fail-fast Zod error at boot).

## Troubleshooting

- **Build fails with "command not found" or workspace resolution errors** —
  confirm Vercel's Root Directory setting matches `vercel.json`'s `cd ../..`
  assumption (it expects the build to start from `apps/web` and walk back up
  to the monorepo root).
- **App exits immediately with an environment error** — this is the
  intended fail-fast behavior (AC2) from `apps/web/lib/env.ts`; the error
  message names exactly which variable is missing/malformed.
- **Prisma can't reach the database** — verify the connection string
  includes `?sslmode=require` (Neon requires TLS) and that you copied the
  *pooled* connection string, not the direct one, for runtime use.
- **Production deployment serving 500s on every route** — check the Vercel
  function logs for the "Invalid environment configuration" block from
  `apps/web/lib/env.ts`. Under `next start` (which is what a Vercel
  deployment runs), Next's instrumentation-hook error handling logs that
  error once at boot but keeps the server process alive rather than
  terminating it, so every request 500s until you fix the env vars and
  redeploy — it will not silently recover. (`next dev`, the local workflow,
  exits the process outright on the same error.)
