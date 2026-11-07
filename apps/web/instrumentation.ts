/**
 * Next.js instrumentation hook — runs once when the server process starts,
 * before any request is handled. This is where env validation (AC2) lives
 * so a missing/malformed `DATABASE_URL`/`BETTER_AUTH_SECRET` fails fast at
 * boot instead of crashing mid-request.
 *
 * Verified behavior: `next dev` propagates this throw and exits the process
 * with a clear, single error block (exit code 1) — the local-dev workflow
 * this story's AC2 targets. `next start` (production) logs the same clear
 * error at boot but — per Next.js's own instrumentation-hook resiliency
 * design — keeps the process alive, returning 500s instead of terminating;
 * that behavior is intentionally not fought here. See DEPLOYMENT.md.
 *
 * https://nextjs.org/docs/app/guides/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/env");
  }
}
