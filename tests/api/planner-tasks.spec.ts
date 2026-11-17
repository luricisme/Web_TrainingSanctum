import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";
import { CULTIVATION_LADDER, toLocalDate } from "@training-sanctum/domain";

const PASSWORD = "correct-horse-battery";
const DAY = "2026-11-17";

interface Session {
  request: APIRequestContext;
  userId: string;
  categoryId: string;
}

async function newUser(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  base: string,
  timezone = "UTC"
): Promise<Session> {
  const request = await playwright.request.newContext();
  const email = `planner-task-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Planner Task", timezone },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const cat = await request.post(`${base}/api/planner/categories`, { data: { name: "Study" } });
  expect(cat.status()).toBe(201);
  return { request, userId: user.id, categoryId: (await cat.json()).data.id };
}

type Task = {
  id: string;
  title: string;
  localDay: string;
  startTime: string | null;
  estimateMinutes: number;
  done: boolean;
};

async function add(s: Session, base: string, extra: Record<string, unknown> = {}): Promise<Task> {
  const res = await s.request.post(`${base}/api/planner/tasks`, {
    data: { title: "Read", categoryId: s.categoryId, localDay: DAY, estimateMinutes: 25, ...extra },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data;
}

async function markDone(s: Session, base: string, id: string) {
  const res = await s.request.post(`${base}/api/planner/tasks/${id}/done`);
  expect(res.status()).toBe(200);
  return (await res.json()).data as Task;
}

// spec-8-3: Planner Tasks. Session-guarded, Zod-validated, user-scoped.
test.describe("/api/planner/tasks", () => {
  test("unauthenticated requests return the 401 envelope", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const ctx = await playwright.request.newContext();
    for (const res of [
      await ctx.get(`${base}/api/planner/tasks?day=${DAY}`),
      await ctx.post(`${base}/api/planner/tasks`, { data: {} }),
      await ctx.patch(`${base}/api/planner/tasks/abc`, { data: { title: "x" } }),
      await ctx.delete(`${base}/api/planner/tasks/abc`),
      await ctx.post(`${base}/api/planner/tasks/abc/done`),
    ]) {
      expect(res.status()).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
    }
  });

  test("add returns 201 and the day lists it; GET needs a valid day", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const t = await add(s, base, { title: "  Read  ", startTime: "09:15" });
    expect(t).toMatchObject({ title: "Read", localDay: DAY, startTime: "09:15", estimateMinutes: 25, done: false });
    const list = (await (await s.request.get(`${base}/api/planner/tasks?day=${DAY}`)).json()).data;
    expect(list.map((x: Task) => x.id)).toEqual([t.id]);
    const other = (await (await s.request.get(`${base}/api/planner/tasks?day=2026-11-18`)).json()).data;
    expect(other).toEqual([]);
    const bad = await s.request.get(`${base}/api/planner/tasks?day=nope`);
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error.fields.day).toBeTruthy();
  });

  test("invalid add returns a field error per input", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const res = await s.request.post(`${base}/api/planner/tasks`, {
      data: { title: " ", categoryId: "", localDay: DAY, startTime: "99:99", estimateMinutes: 4 },
    });
    expect(res.status()).toBe(400);
    const { fields } = (await res.json()).error;
    expect(Object.keys(fields).sort()).toEqual(["categoryId", "estimateMinutes", "startTime", "title"]);
  });

  test("a foreign category is a categoryId field error", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const res = await s.request.post(`${base}/api/planner/tasks`, {
      data: { title: "x", categoryId: other.categoryId, localDay: DAY, estimateMinutes: 25 },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.fields.categoryId).toBeTruthy();
    const t = await add(s, base);
    const patch = await s.request.patch(`${base}/api/planner/tasks/${t.id}`, {
      data: { categoryId: other.categoryId },
    });
    expect(patch.status()).toBe(400);
  });

  test("edit changes fields and keeps the estimate unless sent; cross-user is 404", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const t = await add(s, base, { estimateMinutes: 40, startTime: "10:00" });
    const res = await s.request.patch(`${base}/api/planner/tasks/${t.id}`, {
      data: { title: "Write", localDay: "2026-11-18" },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toMatchObject({
      title: "Write",
      localDay: "2026-11-18",
      startTime: "10:00",
      estimateMinutes: 40,
    });
    const cleared = await s.request.patch(`${base}/api/planner/tasks/${t.id}`, { data: { startTime: null } });
    expect((await cleared.json()).data.startTime).toBeNull();

    const other = await newUser(playwright, base);
    const patch = await other.request.patch(`${base}/api/planner/tasks/${t.id}`, { data: { title: "x" } });
    expect(patch.status()).toBe(404);
    expect((await other.request.delete(`${base}/api/planner/tasks/${t.id}`)).status()).toBe(404);
    expect((await other.request.post(`${base}/api/planner/tasks/${t.id}/done`)).status()).toBe(404);
    const missing = await s.request.patch(`${base}/api/planner/tasks/nope`, { data: { title: "x" } });
    expect(missing.status()).toBe(404);
  });

  // spec-10-2: drag-to-reschedule saves localDay + startTime through this PATCH and nothing else.
  test("a move keeps estimate, sessions and done; startTime null clears startAt", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const t = await add(s, base, { estimateMinutes: 50, startTime: "19:00" });
    const started = await s.request.post(`${base}/api/planner/sessions`, {
      data: { taskId: t.id, kind: "FOCUS" },
    });
    expect(started.status()).toBe(201);
    const sessionId = (await started.json()).data.id as string;
    const before = await prisma.pomodoroSession.findUniqueOrThrow({ where: { id: sessionId } });

    const moved = await s.request.patch(`${base}/api/planner/tasks/${t.id}`, {
      data: { localDay: "2026-11-18", startTime: "20:00" },
    });
    expect(moved.status()).toBe(200);
    expect((await moved.json()).data).toMatchObject({
      title: "Read",
      localDay: "2026-11-18",
      startTime: "20:00",
      estimateMinutes: 50,
      done: false,
    });
    const after = await prisma.pomodoroSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(after).toEqual(before);

    const cleared = await s.request.patch(`${base}/api/planner/tasks/${t.id}`, {
      data: { localDay: "2026-11-19", startTime: null },
    });
    expect((await cleared.json()).data).toMatchObject({ localDay: "2026-11-19", startTime: null, estimateMinutes: 50 });
    const row = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.startAt).toBeNull();
    expect(await prisma.pomodoroSession.count({ where: { taskId: t.id } })).toBe(1);
  });

  test("a 23:30 start with 90 minutes stays on its day in the user timezone", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base, "Asia/Ho_Chi_Minh");
    const t = await add(s, base, { startTime: "23:30", estimateMinutes: 90 });
    expect(t.localDay).toBe(DAY);
    const row = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.startAt?.toISOString()).toBe("2026-11-17T16:30:00.000Z");
    expect(row.localDay.toISOString().slice(0, 10)).toBe(DAY);
  });

  test("open tasks sort by time, untimed after timed, done last", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const untimed = await add(s, base, { title: "untimed" });
    const late = await add(s, base, { title: "late", startTime: "15:00" });
    const early = await add(s, base, { title: "early", startTime: "08:00" });
    const finished = await add(s, base, { title: "finished", startTime: "07:00" });
    await markDone(s, base, finished.id);
    const list = (await (await s.request.get(`${base}/api/planner/tasks?day=${DAY}`)).json()).data;
    expect(list.map((x: Task) => x.id)).toEqual([early.id, late.id, untimed.id, finished.id]);
  });

  test("done awards TASK_DONE once; re-done and reopen then done award nothing; ledger replays", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const t = await add(s, base);
    expect((await markDone(s, base, t.id)).done).toBe(true);
    await markDone(s, base, t.id);
    const reopen = await s.request.patch(`${base}/api/planner/tasks/${t.id}`, { data: { done: false } });
    expect((await reopen.json()).data.done).toBe(false);
    expect((await markDone(s, base, t.id)).done).toBe(true);

    const events = await prisma.xpEvent.findMany({ where: { userId: s.userId }, orderBy: { createdAt: "asc" } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ reason: "TASK_DONE", questKind: null, delta: 5 });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
    expect(user.cultivationXp).toBe(5);
    expect(events.reduce((xp, e) => Math.max(0, xp + e.delta), 0)).toBe(user.cultivationXp);
    const row = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.xpAwardedAt).not.toBeNull();
  });

  test("concurrent done calls award once", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const t = await add(s, base);
    const responses = await Promise.all(
      [1, 2, 3].map(() => s.request.post(`${base}/api/planner/tasks/${t.id}/done`))
    );
    expect(responses.map((r) => r.status())).toEqual([200, 200, 200]);
    expect(await prisma.xpEvent.count({ where: { userId: s.userId, reason: "TASK_DONE" } })).toBe(1);
  });

  test("two different tasks done concurrently both reach cultivationXp", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const a = await add(s, base, { title: "A" });
    const b = await add(s, base, { title: "B" });
    const responses = await Promise.all(
      [a, b].map((t) => s.request.post(`${base}/api/planner/tasks/${t.id}/done`))
    );
    expect(responses.map((r) => r.status())).toEqual([200, 200]);
    const events = await prisma.xpEvent.findMany({ where: { userId: s.userId }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.delta)).toEqual([5, 5]);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
    expect(user.cultivationXp).toBe(10);
    expect(events.reduce((xp, e) => Math.max(0, xp + e.delta), 0)).toBe(user.cultivationXp);
  });

  test("the done event's localDay is the user's today, not the Task's day", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base, "Asia/Ho_Chi_Minh");
    const t = await add(s, base, { localDay: "2020-01-02" });
    await markDone(s, base, t.id);
    const event = await prisma.xpEvent.findFirstOrThrow({ where: { userId: s.userId, reason: "TASK_DONE" } });
    const expected = toLocalDate(new Date(), "Asia/Ho_Chi_Minh").getTime();
    // Allow for the clock crossing local midnight during the test.
    expect([expected, expected - 86_400_000]).toContain(event.localDay.getTime());
    expect(event.localDay.getTime()).not.toBe(new Date("2020-01-02T00:00:00.000Z").getTime());
  });

  test("done awards 10 at Bo 2 and 20 at Bo 3", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    for (const [bo, delta] of [
      [2, 10],
      [3, 20],
    ] as const) {
      const s = await newUser(playwright, base);
      const startXp = CULTIVATION_LADDER.find((l) => l.bo === bo)!.startXp;
      await prisma.user.update({ where: { id: s.userId }, data: { cultivationXp: startXp } });
      const t = await add(s, base);
      await markDone(s, base, t.id);
      const event = await prisma.xpEvent.findFirstOrThrow({ where: { userId: s.userId, reason: "TASK_DONE" } });
      expect(event.delta).toBe(delta);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: s.userId } });
      expect(user.cultivationXp).toBe(startXp + delta);
    }
  });

  test("changing only the day keeps a 23:30 start time on the new day", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base, "Asia/Ho_Chi_Minh");
    const t = await add(s, base, { startTime: "23:30", estimateMinutes: 90 });
    const res = await s.request.patch(`${base}/api/planner/tasks/${t.id}`, { data: { localDay: "2026-11-18" } });
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toMatchObject({ localDay: "2026-11-18", startTime: "23:30" });
    const row = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.startAt?.toISOString()).toBe("2026-11-18T16:30:00.000Z");
    expect(row.localDay.toISOString().slice(0, 10)).toBe("2026-11-18");
  });

  test("delete removes the task", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const t = await add(s, base);
    expect((await s.request.delete(`${base}/api/planner/tasks/${t.id}`)).status()).toBe(200);
    expect(await prisma.task.count({ where: { id: t.id } })).toBe(0);
  });
});

// spec-8-4: Overdue count and the explicit move to today.
test.describe("/api/planner/tasks overdue", () => {
  const PAST = "2020-01-02";

  test("signed-out requests return 401", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const ctx = await playwright.request.newContext();
    for (const res of [
      await ctx.get(`${base}/api/planner/tasks/overdue`),
      await ctx.patch(`${base}/api/planner/tasks/move-overdue`),
    ]) {
      expect(res.status()).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
    }
  });

  test("none overdue gives count 0 and moved 0", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    expect((await (await s.request.get(`${base}/api/planner/tasks/overdue`)).json()).data).toEqual({ count: 0 });
    const res = await s.request.patch(`${base}/api/planner/tasks/move-overdue`);
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toEqual({ moved: 0 });
  });

  test("counts and moves only the user's open past tasks, keeping time, estimate and logged", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    const tz = "Asia/Ho_Chi_Minh";
    const s = await newUser(playwright, base, tz);
    const other = await newUser(playwright, base, tz);
    const today = toLocalDate(new Date(), tz).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.parse(`${today}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);

    const timed = await add(s, base, { localDay: PAST, startTime: "09:30", estimateMinutes: 25 });
    const plain = await add(s, base, { localDay: "2020-01-03" });
    const finished = await add(s, base, { localDay: PAST });
    await markDone(s, base, finished.id);
    const current = await add(s, base, { localDay: today });
    const future = await add(s, base, { localDay: tomorrow });
    const foreign = await add(other, base, { localDay: PAST });
    await prisma.task.update({ where: { id: timed.id }, data: { loggedMinutes: 30 } });

    expect((await (await s.request.get(`${base}/api/planner/tasks/overdue`)).json()).data).toEqual({ count: 2 });
    const res = await s.request.patch(`${base}/api/planner/tasks/move-overdue`);
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toEqual({ moved: 2 });

    const rows = await prisma.task.findMany({ where: { userId: s.userId } });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    const day = (id: string) => byId[id]!.localDay.toISOString().slice(0, 10);
    expect(day(timed.id)).toBe(today);
    expect(day(plain.id)).toBe(today);
    expect(day(finished.id)).toBe(PAST);
    expect(day(current.id)).toBe(today);
    expect(day(future.id)).toBe(tomorrow);
    expect(byId[timed.id]!.startAt?.toISOString()).toBe(`${today}T02:30:00.000Z`);
    expect(byId[timed.id]).toMatchObject({ estimateMinutes: 25, loggedMinutes: 30 });
    expect(byId[plain.id]!.startAt).toBeNull();

    const theirs = await prisma.task.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(theirs.localDay.toISOString().slice(0, 10)).toBe(PAST);
    expect((await (await s.request.get(`${base}/api/planner/tasks/overdue`)).json()).data).toEqual({ count: 0 });
    expect((await (await other.request.get(`${base}/api/planner/tasks/overdue`)).json()).data).toEqual({ count: 1 });
  });
});
