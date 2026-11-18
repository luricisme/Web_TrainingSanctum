import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
// Tuesday; its week is 2026-11-16 (Mon) to 2026-11-22 (Sun).
const DAY = "2026-11-17";

interface Session {
  request: APIRequestContext;
  userId: string;
  categoryId: string;
}

async function newUser(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  base: string
): Promise<Session> {
  const request = await playwright.request.newContext();
  const email = `planner-week-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Planner Week", timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const cat = await request.post(`${base}/api/planner/categories`, { data: { name: "Study" } });
  expect(cat.status()).toBe(201);
  return { request, userId: user.id, categoryId: (await cat.json()).data.id };
}

async function add(s: Session, base: string, extra: Record<string, unknown>) {
  const res = await s.request.post(`${base}/api/planner/tasks`, {
    data: { title: "Read", categoryId: s.categoryId, localDay: DAY, estimateMinutes: 25, ...extra },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data as { id: string };
}

type Week = Array<{
  id: string;
  localDay: string;
  startTime: string | null;
  planMinutes: number;
  doneMinutes: number;
  running: { startedAt: string; plannedMinutes: number } | null;
}>;

// spec-10-1: the week read. Session-guarded, user-scoped, plan length from the server.
test.describe("GET /api/planner/tasks/week", () => {
  test("unauthenticated requests return the 401 envelope", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const ctx = await playwright.request.newContext();
    const res = await ctx.get(`${base}/api/planner/tasks/week?start=${DAY}`);
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("start is required and must be a date", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    for (const query of ["", "?start=nope", "?start=2026-02-30"]) {
      const res = await s.request.get(`${base}/api/planner/tasks/week${query}`);
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.fields.start).toBeTruthy();
    }
  });

  test("returns the Monday-Sunday week with planMinutes, and nothing outside it", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    // Defaults (focus 25, short break 5): 90 min = 25 + 5 + 25 + 5 + 25 + 5 + 15 = 105.
    const plain = await add(s, base, { estimateMinutes: 90, startTime: "19:00" });
    const untimed = await add(s, base, { estimateMinutes: 25, localDay: "2026-11-22" });
    const monday = await add(s, base, { estimateMinutes: 30, localDay: "2026-11-16", startTime: "08:00" });
    const before = await add(s, base, { localDay: "2026-11-15" });
    const after = await add(s, base, { localDay: "2026-11-23" });

    for (const start of [DAY, "2026-11-16", "2026-11-22"]) {
      const week = (await (await s.request.get(`${base}/api/planner/tasks/week?start=${start}`)).json())
        .data as Week;
      const ids = week.map((t) => t.id);
      expect(ids).toEqual(expect.arrayContaining([plain.id, untimed.id, monday.id]));
      expect(ids).not.toContain(before.id);
      expect(ids).not.toContain(after.id);
      const byId = Object.fromEntries(week.map((t) => [t.id, t]));
      expect(byId[plain.id]).toMatchObject({ startTime: "19:00", planMinutes: 105 });
      expect(byId[untimed.id]).toMatchObject({ startTime: null, planMinutes: 25 });
      expect(byId[monday.id]).toMatchObject({ planMinutes: 35 });
    }
  });

  test("plan length follows the Pomodoro settings of the user", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    await prisma.user.update({
      where: { id: s.userId },
      data: { pomodoroSettings: { focus: 50, shortBreak: 10, longBreak: 20, longBreakEvery: 4 } },
    });
    const t = await add(s, base, { estimateMinutes: 100, startTime: "09:00" });
    const week = (await (await s.request.get(`${base}/api/planner/tasks/week?start=${DAY}`)).json())
      .data as Week;
    expect(week.find((x) => x.id === t.id)?.planMinutes).toBe(110);
  });

  test("never returns the Tasks of another user", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const a = await newUser(playwright, base);
    const b = await newUser(playwright, base);
    const mine = await add(a, base, { startTime: "10:00" });
    const theirs = await add(b, base, { startTime: "10:00" });
    const week = (await (await a.request.get(`${base}/api/planner/tasks/week?start=${DAY}`)).json())
      .data as Week;
    expect(week.map((t) => t.id)).toEqual([mine.id]);
    expect(week.map((t) => t.id)).not.toContain(theirs.id);
  });
});

// spec-10-3: block length follows what was logged; a running session is exposed.
test.describe("GET /api/planner/tasks/week live blocks", () => {
  const MIN = 60_000;
  const weekOf = async (s: Session, base: string) =>
    (await (await s.request.get(`${base}/api/planner/tasks/week?start=${DAY}`)).json()).data as Week;
  const log = (taskId: string, userId: string, kind: "FOCUS" | "BREAK", actual: number, overrun = false) =>
    prisma.pomodoroSession.create({
      data: {
        userId,
        taskId,
        kind,
        plannedMinutes: actual,
        actualMinutes: actual,
        startedAt: new Date(Date.now() - 3_600_000),
        endedAt: new Date(Date.now() - 3_000_000),
        overrun,
      },
    });

  test("an overrun session lengthens the block", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const t = await add(s, base, { estimateMinutes: 50, startTime: "09:00" });
    await log(t.id, s.userId, "FOCUS", 25);
    await log(t.id, s.userId, "BREAK", 5);
    await log(t.id, s.userId, "FOCUS", 25);
    await log(t.id, s.userId, "FOCUS", 25, true);
    const row = (await weekOf(s, base)).find((x) => x.id === t.id);
    expect(row).toMatchObject({ planMinutes: 80, doneMinutes: 80, running: null });
  });

  test("a Task done early shortens the block to what was logged", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const t = await add(s, base, { estimateMinutes: 60, startTime: "09:00" });
    await log(t.id, s.userId, "FOCUS", 10);
    await prisma.task.update({ where: { id: t.id }, data: { done: true } });
    expect((await weekOf(s, base)).find((x) => x.id === t.id)?.planMinutes).toBe(10);
  });

  test("a running session is exposed with its start and planned length", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const t = await add(s, base, { estimateMinutes: 50, startTime: "09:00" });
    const startedAt = new Date(Date.now() - 10 * MIN);
    await prisma.pomodoroSession.create({
      data: { userId: s.userId, taskId: t.id, kind: "FOCUS", plannedMinutes: 25, startedAt },
    });
    const row = (await weekOf(s, base)).find((x) => x.id === t.id);
    expect(row?.running).toEqual({ startedAt: startedAt.toISOString(), plannedMinutes: 25 });
    expect(row).toMatchObject({ doneMinutes: 0, planMinutes: 50 });
  });
});
