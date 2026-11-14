import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";
import { levelForXp } from "@training-sanctum/domain";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";
const ADMIN_EMAIL = "admin-e2e@example.test";

type PW = { request: { newContext: () => Promise<APIRequestContext> } };

async function signUp(playwright: PW, base: string, email: string) {
  const request = await playwright.request.newContext();
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "List Test", timezone: "UTC" },
  });
  return { request, response };
}

async function adminSession(playwright: PW, base: string) {
  const { request, response } = await signUp(playwright, base, ADMIN_EMAIL);
  if (response.ok()) return request;
  const login = await request.post(`${base}/api/auth/sign-in/email`, {
    headers: { Origin: base },
    data: { email: ADMIN_EMAIL, password: PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  return request;
}

// Story 7.2: GET /api/admin/users
test.describe("GET /api/admin/users", () => {
  test("no cookie gets 401", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await playwright.request.newContext();
    const res = await request.get(`${base}/api/admin/users`);
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("a normal user gets 403", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const { request } = await signUp(playwright, base, `plain-${randomUUID()}@example.test`);
    const res = await request.get(`${base}/api/admin/users`);
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  test("an admin gets the page shape with no secret fields", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await adminSession(playwright, base);
    const res = await request.get(`${base}/api/admin/users`);
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(20);
    // Other specs sign users up concurrently, so the count can only grow.
    expect(data.total).toBeGreaterThan(0);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items.length).toBeLessThanOrEqual(20);
    for (const item of data.items) {
      expect(Object.keys(item).sort()).toEqual(
        ["createdAt", "disabled", "email", "id", "level", "realm", "xp"].sort()
      );
    }
    const dates = data.items.map((i: { createdAt: string }) => i.createdAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  test("paginates and answers an empty page beyond the end", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await adminSession(playwright, base);
    const first = (await (await request.get(`${base}/api/admin/users?pageSize=1`)).json()).data;
    const second = (await (await request.get(`${base}/api/admin/users?pageSize=1&page=2`)).json())
      .data;
    expect(first.items).toHaveLength(1);
    // Other specs add and remove users concurrently, so only the page shape is stable.
    expect(second.items.length).toBeLessThanOrEqual(1);
    expect(second.page).toBe(2);
    const beyond = (await (await request.get(`${base}/api/admin/users?page=99999`)).json()).data;
    expect(beyond.items).toEqual([]);
    expect(beyond.total).toBeGreaterThan(0);
  });

  test("bad params get 400 VALIDATION_ERROR", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await adminSession(playwright, base);
    for (const q of ["page=0", "pageSize=500", "page=abc"]) {
      const res = await request.get(`${base}/api/admin/users?${q}`);
      expect(res.status(), q).toBe(400);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
  });

  test("realm and level derive from cultivationXp; disabled users stay listed", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await adminSession(playwright, base);
    const email = `lvl-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: { name: "Lvl", email, timezone: "UTC", cultivationXp: 5000, disabled: true },
    });
    try {
      const res = await request.get(`${base}/api/admin/users?pageSize=100`);
      const item = (await res.json()).data.items.find((i: { id: string }) => i.id === user.id);
      expect(item).toBeTruthy();
      const level = levelForXp(5000);
      expect(item.realm).toBe(level.label);
      expect(item.level).toBe(level.levelIndex + 1);
      expect(item.xp).toBe(5000);
      expect(item.disabled).toBe(true);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
