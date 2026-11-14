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
  // Run for every runtime (nodejs, edge, ...) — gating this to a single
  // runtime risks silently skipping the fail-fast check under any other
  // runtime Next.js invokes this hook for.
  await import("./lib/env");

  // Story 7.1: promote ADMIN_EMAILS accounts. A DB error must not stop boot.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { seedAdmins } = await import("@training-sanctum/db");
      const { adminEmails } = await import("./lib/env");
      await seedAdmins(adminEmails);
    } catch (error) {
      console.error("Admin seed failed at start:", error);
    }
  }
}
