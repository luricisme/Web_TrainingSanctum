/**
 * Better Auth server instance (spec-1-2 Task: apps/web/lib/auth.ts).
 *
 * Central config reused by stories 1.3 (login) and 1.4 (session
 * persistence) — this story only needs email/password sign-up with an
 * immediate session (no login page, no verification/reset flows; see
 * spec-1-2 Boundaries & Constraints).
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { prisma } from "@training-sanctum/db";
import { adminEmails, env } from "./env";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  // AD-2: wrap the same Prisma client singleton packages/db exports — never
  // instantiate a second PrismaClient.
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  // Defaults to Better Auth's own behavior (on in production). Only the
  // Playwright webServer turns it off; see AUTH_RATE_LIMIT in ./env.ts.
  // "off" is ignored on Vercel production so a mistaken setting there cannot
  // silently disable login brute-force protection.
  ...(env.AUTH_RATE_LIMIT === "off" && process.env.VERCEL_ENV !== "production"
    ? { rateLimit: { enabled: false } }
    : {}),

  advanced: {
    database: {
      // Consistency Conventions ("IDs"): all primary keys are
      // Prisma-generated cuid() strings. Better Auth normally generates its
      // own ids client-side; `false` here makes it omit `id` from create
      // payloads so the schema's `@default(cuid())` applies instead.
      generateId: false,
    },
  },

  emailAndPassword: {
    enabled: true,
    // No stricter policy specified anywhere upstream than the 8-character
    // minimum (spec-1-2 Boundaries & Constraints) — don't invent one.
    minPasswordLength: 8,
    // Successful registration logs the user in immediately via Better
    // Auth's own post-signup session issuance (spec-1-2 Boundaries).
    autoSignIn: true,
  },

  // v1 is email+password only: no social providers, no email verification,
  // no password reset (spec-1-2 Boundaries & Constraints "Never").
  user: {
    additionalFields: {
      // IANA string captured client-side via
      // `Intl.DateTimeFormat().resolvedOptions().timeZone` at signup; not
      // user-editable in v1 (AD-8, Design Notes).
      timezone: {
        type: "string",
        required: true,
        input: true,
      },
      // Story 7.1: read-only on the client; only the ADMIN_EMAILS seed writes it.
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        // An ADMIN_EMAILS email that registers is created as an admin, so its
        // first session already carries the role.
        before: async (user) => ({
          data: adminEmails.includes(user.email.toLowerCase())
            ? { ...user, role: "admin" }
            : user,
        }),
      },
    },
  },

  session: {
    // 30-day sliding session (per epic context / architecture spine
    // Consistency Conventions "Auth"): refreshed on activity via `updateAge`.
    expiresIn: THIRTY_DAYS_IN_SECONDS,
    updateAge: 60 * 60 * 24, // refresh once per day of activity (default)
  },
});

export type Auth = typeof auth;
