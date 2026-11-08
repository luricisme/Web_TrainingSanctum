/**
 * Better Auth browser client (spec-1-2 Task: apps/web/lib/auth-client.ts).
 *
 * Consumed by the registration page (and later by the login page, story
 * 1.3). Talks to the catch-all handler at `/api/auth/**`; same-origin, so no
 * explicit `baseURL` is needed in the browser.
 */
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "./auth";

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const { signUp, signIn, signOut, useSession } = authClient;
