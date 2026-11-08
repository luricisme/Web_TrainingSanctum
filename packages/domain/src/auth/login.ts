/**
 * Login request validation (spec-1-3).
 *
 * AD-6: validated before any Better Auth call. Deliberately no minimum
 * password length — the 8-character rule applies at registration only, and
 * enforcing it here would leak policy details to a failed login.
 */
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
