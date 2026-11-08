/**
 * Registration request validation (spec-1-2).
 *
 * AD-6 (Request validation boundary): the registration Route Handler
 * validates with this schema before any Better Auth call. Pure Zod, no
 * next/react/@prisma/client imports — stays clean under packages/domain's
 * AD-1 eslint boundary (../eslint.config.mjs).
 */
import { z } from "zod";

export const registerSchema = z.object({
  // Better Auth's base `User` schema requires `name` (non-optional) on every
  // `signUp.email` call — trimmed non-empty check mirrors the form's native
  // `required` attribute, which `noValidate` otherwise leaves unenforced.
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().email(),
  // Minimum password length: 8 characters (spec-1-2 Boundaries &
  // Constraints) — no stricter policy specified anywhere upstream.
  password: z.string().min(8),
  // IANA string captured client-side via
  // `Intl.DateTimeFormat().resolvedOptions().timeZone` at signup (AD-8).
  timezone: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
