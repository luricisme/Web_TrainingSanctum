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
