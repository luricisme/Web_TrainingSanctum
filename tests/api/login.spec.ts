import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";

async function register(request: APIRequestContext, base: string, email: string) {
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Login Test", timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
}

// spec-1-3: login, indistinguishable failures, logout, and the session guard.
// Each test uses fresh request contexts so cookies never leak between them.
test.describe("login / logout / requireSession", () => {
  test("login succeeds and sets a session cookie", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3000";
    const email = `login-${randomUUID()}@example.test`;
    await register(await playwright.request.newContext(), base, email);

    const fresh = await playwright.request.newContext();
    const response = await fresh.post(`${base}/api/auth/sign-in/email`, {
      headers: { Origin: base },
      data: { email, password: PASSWORD },
    });
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["set-cookie"]).toBeTruthy();

    const me = await fresh.get(`${base}/api/me`);
    expect(me.status()).toBe(200);
    expect((await me.json()).data.email).toBe(email);
  });

  test("wrong password and unknown email return identical envelopes", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3000";
    const email = `login-bad-${randomUUID()}@example.test`;
    await register(await playwright.request.newContext(), base, email);

    const ctx = await playwright.request.newContext();
    const wrong = await ctx.post(`${base}/api/auth/sign-in/email`, {
      headers: { Origin: base },
      data: { email, password: "not-the-password" },
    });
    const unknown = await ctx.post(`${base}/api/auth/sign-in/email`, {
      headers: { Origin: base },
      data: {
        email: `nobody-${randomUUID()}@example.test`,
        password: "not-the-password",
      },
    });

    expect(wrong.status()).toBe(401);
    expect(unknown.status()).toBe(401);
    expect(wrong.headers()["set-cookie"]).toBeUndefined();
    const wrongBody = await wrong.json();
    expect(wrongBody).toEqual(await unknown.json());
    expect(wrongBody.error.code).toBe("INVALID_EMAIL_OR_PASSWORD");
    expect(wrongBody.error.fields).toBeUndefined();
  });

  test("after sign-out GET /api/me is 401 and the session row is gone", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3000";
    const email = `login-out-${randomUUID()}@example.test`;
    const ctx = await playwright.request.newContext();
    await register(ctx, base, email);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(
      await prisma.session.count({ where: { userId: user.id } })
    ).toBeGreaterThan(0);
    expect((await ctx.get(`${base}/api/me`)).status()).toBe(200);

    const out = await ctx.post(`${base}/api/auth/sign-out`, {
      headers: { Origin: base },
      data: {},
    });
    expect(out.ok()).toBeTruthy();

    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const me = await ctx.get(`${base}/api/me`);
    expect(me.status()).toBe(401);
    expect((await me.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("GET /api/me without a cookie is 401 in the envelope", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3000";
    const ctx = await playwright.request.newContext();
    const me = await ctx.get(`${base}/api/me`);
    expect(me.status()).toBe(401);
    const body = await me.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(typeof body.error.message).toBe("string");
  });
});
