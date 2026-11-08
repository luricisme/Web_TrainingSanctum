import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * DAY_MS;

async function register(request: APIRequestContext, base: string, email: string) {
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Session Test", timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  return response;
}

async function signIn(request: APIRequestContext, base: string, email: string) {
  const response = await request.post(`${base}/api/auth/sign-in/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  return response;
}

// spec-1-4: 30-day persistent, sliding, independently-held sessions.
test.describe("session persistence", () => {
  test("session cookie is persistent for about 30 days", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3000";
    const email = `sess-cookie-${randomUUID()}@example.test`;
    await register(await playwright.request.newContext(), base, email);

    const ctx = await playwright.request.newContext();
    const response = await signIn(ctx, base, email);
    const setCookie = response
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value)
      .find((v) => v.includes("session_token"));
    expect(setCookie).toBeTruthy();

    const maxAge = Number(/Max-Age=(\d+)/i.exec(setCookie ?? "")?.[1]);
    expect(maxAge).toBeGreaterThan(29 * 24 * 60 * 60);
    expect(maxAge).toBeLessThanOrEqual(30 * 24 * 60 * 60);
  });

  test("activity past updateAge slides expiry back out to 30 days", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3000";
    const email = `sess-slide-${randomUUID()}@example.test`;
    const ctx = await playwright.request.newContext();
    await register(ctx, base, email);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const row = await prisma.session.findFirstOrThrow({
      where: { userId: user.id },
    });

    // Pretend the session was last refreshed 2 days ago and has 10 days left.
    await prisma.session.update({
      where: { id: row.id },
      data: {
        updatedAt: new Date(Date.now() - 2 * DAY_MS),
        expiresAt: new Date(Date.now() + 10 * DAY_MS),
      },
    });

    expect((await ctx.get(`${base}/api/me`)).status()).toBe(200);

    const refreshed = await prisma.session.findUniqueOrThrow({
      where: { id: row.id },
    });
    const remaining = refreshed.expiresAt.getTime() - Date.now();
    expect(remaining).toBeGreaterThan(THIRTY_DAYS_MS - DAY_MS);
    expect(remaining).toBeLessThanOrEqual(THIRTY_DAYS_MS + 60_000);
  });

  test("activity within updateAge leaves expiry unchanged", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3000";
    const email = `sess-noslide-${randomUUID()}@example.test`;
    const ctx = await playwright.request.newContext();
    await register(ctx, base, email);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const row = await prisma.session.findFirstOrThrow({
      where: { userId: user.id },
    });
    // Better Auth derives session age from expiresAt (expiresAt - expiresIn),
    // so a session issued one hour ago has 30 days minus one hour left.
    const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS - 60 * 60 * 1000);
    await prisma.session.update({
      where: { id: row.id },
      data: { updatedAt: new Date(), expiresAt },
    });

    expect((await ctx.get(`${base}/api/me`)).status()).toBe(200);

    const after = await prisma.session.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(after.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  test("a session inactive past its expiry requires logging in again", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3000";
    const email = `sess-expired-${randomUUID()}@example.test`;
    const ctx = await playwright.request.newContext();
    await register(ctx, base, email);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const me = await ctx.get(`${base}/api/me`);
    expect(me.status()).toBe(401);
    expect((await me.json()).error.code).toBe("UNAUTHENTICATED");

    // Logging in again works and yields a valid session.
    await signIn(ctx, base, email);
    expect((await ctx.get(`${base}/api/me`)).status()).toBe(200);
  });

  test("two sessions for one account stay valid independently", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3000";
    const email = `sess-multi-${randomUUID()}@example.test`;
    await register(await playwright.request.newContext(), base, email);

    const a = await playwright.request.newContext();
    const b = await playwright.request.newContext();
    await signIn(a, base, email);
    await signIn(b, base, email);

    expect((await a.get(`${base}/api/me`)).status()).toBe(200);
    expect((await b.get(`${base}/api/me`)).status()).toBe(200);

    const out = await a.post(`${base}/api/auth/sign-out`, {
      headers: { Origin: base },
      data: {},
    });
    expect(out.ok()).toBeTruthy();

    expect((await a.get(`${base}/api/me`)).status()).toBe(401);
    expect((await b.get(`${base}/api/me`)).status()).toBe(200);
  });
});
