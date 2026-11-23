import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";
const DEFAULTS = { focus: 25, shortBreak: 5, longBreak: 15, longBreakEvery: 4, autoStartNext: false };

async function newUser(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  base: string
): Promise<{ request: APIRequestContext; userId: string }> {
  const request = await playwright.request.newContext();
  const email = `planner-settings-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Planner Settings", timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id };
}

// spec-9-1: GET / PATCH /api/planner/settings.
test.describe("/api/planner/settings", () => {
  test("signed-out requests return 401", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const ctx = await playwright.request.newContext();
    const get = await ctx.get(`${base}/api/planner/settings`);
    expect(get.status()).toBe(401);
    expect((await get.json()).error.code).toBe("UNAUTHENTICATED");
    const patch = await ctx.patch(`${base}/api/planner/settings`, { data: { focus: 30 } });
    expect(patch.status()).toBe(401);
  });

  test("a new user reads the defaults", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const { request } = await newUser(playwright, base);
    const res = await request.get(`${base}/api/planner/settings`);
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toEqual(DEFAULTS);
  });

  test("a partial PATCH merges and returns the full settings", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const { request } = await newUser(playwright, base);
    const res = await request.patch(`${base}/api/planner/settings`, { data: { focus: 30 } });
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toEqual({ ...DEFAULTS, focus: 30 });
    const res2 = await request.patch(`${base}/api/planner/settings`, { data: { longBreakEvery: 2 } });
    expect((await res2.json()).data).toEqual({ ...DEFAULTS, focus: 30, longBreakEvery: 2 });
    const read = await request.get(`${base}/api/planner/settings`);
    expect((await read.json()).data).toEqual({ ...DEFAULTS, focus: 30, longBreakEvery: 2 });
    const res3 = await request.patch(`${base}/api/planner/settings`, { data: { autoStartNext: true } });
    expect((await res3.json()).data).toEqual({ ...DEFAULTS, focus: 30, longBreakEvery: 2, autoStartNext: true });
  });

  test("invalid bodies return 400 with fields and save nothing", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const { request } = await newUser(playwright, base);
    const cases: Array<[unknown, string]> = [
      [{ focus: 4 }, "focus"],
      [{ focus: 91 }, "focus"],
      [{ shortBreak: 25.5 }, "shortBreak"],
      [{ longBreak: "20" }, "longBreak"],
      [{ longBreakEvery: 1 }, "longBreakEvery"],
      [{ longBreakEvery: 9 }, "longBreakEvery"],
      [{ autoStartNext: "yes" }, "autoStartNext"],
      [{ nope: 1 }, "nope"],
      [{}, "body"],
    ];
    for (const [data, key] of cases) {
      const res = await request.patch(`${base}/api/planner/settings`, { data });
      expect(res.status(), JSON.stringify(data)).toBe(400);
      const { error } = await res.json();
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.fields[key]).toBeTruthy();
    }
    const malformed = await request.patch(`${base}/api/planner/settings`, {
      headers: { "Content-Type": "application/json" },
      data: "{not json",
    });
    expect(malformed.status()).toBe(400);
    const read = await request.get(`${base}/api/planner/settings`);
    expect((await read.json()).data).toEqual(DEFAULTS);
  });

  test("settings are per user", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const a = await newUser(playwright, base);
    const b = await newUser(playwright, base);
    await a.request.patch(`${base}/api/planner/settings`, { data: { focus: 50 } });
    const read = await b.request.get(`${base}/api/planner/settings`);
    expect((await read.json()).data).toEqual(DEFAULTS);
  });

  test("a stored value that fails the schema reads as the defaults", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const { request, userId } = await newUser(playwright, base);
    await prisma.user.update({ where: { id: userId }, data: { pomodoroSettings: { focus: 1 } } });
    const read = await request.get(`${base}/api/planner/settings`);
    expect((await read.json()).data).toEqual(DEFAULTS);
    const res = await request.patch(`${base}/api/planner/settings`, { data: { focus: 40 } });
    expect((await res.json()).data).toEqual({ ...DEFAULTS, focus: 40 });
  });

  test("concurrent patches of different keys both land", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const { request } = await newUser(playwright, base);
    const responses = await Promise.all([
      request.patch(`${base}/api/planner/settings`, { data: { focus: 30 } }),
      request.patch(`${base}/api/planner/settings`, { data: { shortBreak: 10 } }),
      request.patch(`${base}/api/planner/settings`, { data: { longBreak: 20 } }),
      request.patch(`${base}/api/planner/settings`, { data: { longBreakEvery: 3 } }),
    ]);
    for (const r of responses) expect(r.status()).toBe(200);
    const read = await request.get(`${base}/api/planner/settings`);
    expect((await read.json()).data).toEqual({
      focus: 30,
      shortBreak: 10,
      longBreak: 20,
      longBreakEvery: 3,
      autoStartNext: false,
    });
  });
});

// spec-9-1: the PomodoroSession table.
test.describe("PomodoroSession table", () => {
  async function seed(playwright: Parameters<typeof newUser>[0], base: string) {
    const { request, userId } = await newUser(playwright, base);
    const cat = await request.post(`${base}/api/planner/categories`, { data: { name: "Study" } });
    const categoryId = (await cat.json()).data.id;
    const task = await prisma.task.create({
      data: { userId, categoryId, title: "T", localDay: new Date("2026-11-17"), estimateMinutes: 50 },
    });
    return { userId, taskId: task.id };
  }

  test("a second running session for one user is rejected, an ended one is not", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const { userId, taskId } = await seed(playwright, base);
    const row = { userId, taskId, kind: "FOCUS" as const, plannedMinutes: 25, startedAt: new Date() };
    await prisma.pomodoroSession.create({ data: row });
    await expect(prisma.pomodoroSession.create({ data: row })).rejects.toThrow();
    await prisma.pomodoroSession.create({ data: { ...row, endedAt: new Date(), actualMinutes: 25 } });
    await prisma.pomodoroSession.create({ data: { ...row, endedAt: new Date(), actualMinutes: 25 } });
    expect(await prisma.pomodoroSession.count({ where: { userId } })).toBe(3);
  });

  test("deleting a Task or a user removes its sessions", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const a = await seed(playwright, base);
    const b = await seed(playwright, base);
    const mk = (s: { userId: string; taskId: string }) => ({
      userId: s.userId,
      taskId: s.taskId,
      kind: "FOCUS" as const,
      plannedMinutes: 25,
      startedAt: new Date(),
    });
    await prisma.pomodoroSession.create({ data: mk(a) });
    await prisma.pomodoroSession.create({ data: mk(b) });
    await prisma.task.delete({ where: { id: a.taskId } });
    expect(await prisma.pomodoroSession.count({ where: { userId: a.userId } })).toBe(0);
    await prisma.user.delete({ where: { id: b.userId } });
    expect(await prisma.pomodoroSession.count({ where: { userId: b.userId } })).toBe(0);
  });
});
