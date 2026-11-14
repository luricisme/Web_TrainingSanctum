import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";

async function newUser(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  base: string,
  xp = 0
): Promise<APIRequestContext> {
  const request = await playwright.request.newContext();
  const email = `cultivation-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: {
      email,
      password: PASSWORD,
      name: "Cultivation Test",
      timezone: "UTC",
    },
  });
  expect(response.ok()).toBeTruthy();
  if (xp > 0) await prisma.user.update({ where: { email }, data: { cultivationXp: xp } });
  return request;
}

// spec-5-1: GET /api/cultivation (FR-12, AD-15).
test.describe("/api/cultivation", () => {
  test("unauthenticated requests return 401", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const ctx = await playwright.request.newContext();
    const res = await ctx.get(`${base}/api/cultivation`);
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("a new account is Ngưng Khí · Tầng 1, 0 / 10 XP", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await newUser(playwright, base);
    const res = await request.get(`${base}/api/cultivation`);
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toEqual({
      quests: expect.any(Array),
      notices: [],
      bo: 1,
      boName: "Nhất Bộ Tung Hoành",
      realm: "Ngưng Khí",
      stage: "Tầng 1",
      label: "Ngưng Khí · Tầng 1",
      levelIndex: 0,
      xp: 0,
      xpIntoStage: 0,
      xpForStage: 10,
    });
  });

  test("25 XP is Ngưng Khí · Tầng 3, 0 / 20", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await newUser(playwright, base, 25);
    const res = await request.get(`${base}/api/cultivation`);
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toMatchObject({
      label: "Ngưng Khí · Tầng 3",
      levelIndex: 2,
      xp: 25,
      xpIntoStage: 0,
      xpForStage: 20,
    });
  });

  test("past the final threshold is Đạp Thiên Cảnh and XP keeps counting", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await newUser(playwright, base, 115_309);
    const res = await request.get(`${base}/api/cultivation`);
    expect((await res.json()).data).toEqual({
      quests: expect.any(Array),
      notices: [],
      bo: 4,
      boName: "Tứ Bộ Đạp Thiên",
      realm: "Đạp Thiên Cảnh",
      stage: null,
      label: "Đạp Thiên Cảnh",
      levelIndex: 89,
      xp: 115_309,
      xpIntoStage: 115_309 - 114_075,
      xpForStage: null,
    });
  });
});
