import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma, seedAdmins } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";
// Listed in ADMIN_EMAILS by playwright.config.ts and CI.
const ADMIN_EMAIL = "admin-e2e@example.test";

async function signUp(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  base: string,
  email: string,
  extra: Record<string, unknown> = {}
) {
  const request = await playwright.request.newContext();
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Admin Test", timezone: "UTC", ...extra },
  });
  return { request, response };
}

async function adminSession(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  base: string
): Promise<APIRequestContext> {
  const { request, response } = await signUp(playwright, base, ADMIN_EMAIL);
  if (response.ok()) return request;
  // Already registered by an earlier run or spec: sign in instead.
  const login = await request.post(`${base}/api/auth/sign-in/email`, {
    headers: { Origin: base },
    data: { email: ADMIN_EMAIL, password: PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  return request;
}

// Story 7.1: start-time seed is idempotent and never demotes.
test.describe("seedAdmins", () => {
  test("promotes once, then is a no-op, and never demotes", async () => {
    const email = `seed-${randomUUID()}@example.test`;
    await prisma.user.create({ data: { name: "Seed", email, timezone: "UTC" } });
    const role = async () =>
      (await prisma.user.findUniqueOrThrow({ where: { email } })).role;
    expect(await role()).toBe("user");

    expect(await seedAdmins([email])).toBe(1);
    expect(await role()).toBe("admin");
    expect(await seedAdmins([email])).toBe(0);

    expect(await seedAdmins([])).toBe(0);
    expect(await seedAdmins([`other-${randomUUID()}@example.test`])).toBe(0);
    expect(await role()).toBe("admin");
  });
});

// Story 7.1: requireAdmin() on /api/admin/**.
test.describe("/api/admin/me", () => {
  test("no session returns 401 UNAUTHENTICATED", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const ctx = await playwright.request.newContext();
    const res = await ctx.get(`${base}/api/admin/me`);
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("a normal user gets 403 FORBIDDEN", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const { request, response } = await signUp(
      playwright,
      base,
      `plain-${randomUUID()}@example.test`
    );
    expect(response.ok()).toBeTruthy();
    const res = await request.get(`${base}/api/admin/me`);
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  test("a listed email is an admin from its first session", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await adminSession(playwright, base);
    const res = await request.get(`${base}/api/admin/me`);
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toEqual({ email: ADMIN_EMAIL, role: "admin" });
  });

  test("a forged role in the sign-up body is ignored", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const { request, response } = await signUp(
      playwright,
      base,
      `forge-${randomUUID()}@example.test`,
      { role: "admin" }
    );
    expect(response.ok()).toBeTruthy();
    const res = await request.get(`${base}/api/admin/me`);
    expect(res.status()).toBe(403);
  });
});
