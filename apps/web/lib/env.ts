/**
 * Process-start environment validation (Consistency Conventions → Config).
 *
 * Imported at the top of the app's entry points so a missing/malformed var
 * fails fast with a clear error instead of crashing deep inside a request.
 * `BETTER_AUTH_SECRET` is a placeholder reserved for story 1.2 (auth) — it is
 * validated now so the fail-fast contract is proven end-to-end before any
 * route depends on it.
 */
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string({ message: "DATABASE_URL is required" })
    .min(1, "DATABASE_URL must not be empty")
    .url("DATABASE_URL must be a valid connection string URL")
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL must use the postgres:// or postgresql:// scheme"
    ),
  BETTER_AUTH_SECRET: z
    .string({ message: "BETTER_AUTH_SECRET is required" })
    .min(1, "BETTER_AUTH_SECRET must not be empty"),
  // Optional: Better Auth can infer its base URL from the incoming request in
  // Next.js, but setting this explicitly is recommended behind a proxy/CDN
  // (e.g. Vercel) so callback/redirect URLs are never derived from a
  // spoofable forwarded header. Not required for story 1.2's email/password
  // flow (no OAuth/email-verification redirects yet).
  BETTER_AUTH_URL: z
    .literal("")
    .transform(() => undefined)
    .or(z.string().url("BETTER_AUTH_URL must be a valid URL"))
    .optional(),
  // Better Auth rate-limits sign-in/sign-up (3 per 10s per IP) whenever
  // NODE_ENV is production, which `next start` is. The Playwright suites
  // register and log in many users from one IP in seconds, so the test
  // webServer sets this to "off". Leave unset everywhere else.
  AUTH_RATE_LIMIT: z.enum(["on", "off"]).default("on"),
  // Story 7.1: comma-separated emails promoted to the `admin` role at server
  // start and at sign-up. Optional; trimmed, lower-cased, each a valid email.
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((value, ctx) => {
      const emails = value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0);
      for (const entry of emails) {
        if (!z.string().email().safeParse(entry).success) {
          ctx.addIssue({
            code: "custom",
            message: `ADMIN_EMAILS must be a comma-separated list of valid emails; "${entry}" is not one`,
          });
          return z.NEVER;
        }
      }
      return [...new Set(emails)];
    }),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    console.error(
      `Invalid environment configuration. Fix the following and restart:\n${issues}`
    );

    throw new Error(
      `Invalid environment configuration:\n${issues}`
    );
  }

  return parsed.data;
}

export const env: Env = loadEnv();

/** Parsed `ADMIN_EMAILS`: lower-cased, de-duplicated, possibly empty. */
export const adminEmails: string[] = env.ADMIN_EMAILS;
