import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";
import { CULTIVATION_LADDER } from "@training-sanctum/domain";

const PASSWORD = "correct-horse-battery";
const DAY = "2026-11-17";
const MIN = 60_000;

interface Session {
  request: APIRequestContext;
  userId: string;
  categoryId: string;
}

type Pw = { request: { newContext: () => Promise<APIRequestContext> } };

async function newUser(playwright: Pw, base: string): Promise<Session> {
  const request = await playwright.request.newContext();
  const email = `planner-session-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Planner Session", timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const cat = await request.post(`${base}/api/planner/categories`, { data: { name: "Study" } });
  expect(cat.status()).toBe(201);
  return { request, userId: user.id, categoryId: (await cat.json()).data.id };
}

async function addTask(s: Session, base: string, estimateMinutes = 90): Promise<string> {
  const res = await s.request.post(`${base}/api/planner/tasks`, {
    data: { title: "Read", categoryId: s.categoryId, localDay: DAY, estimateMinutes },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data.id;
}

function start(s: Session, base: string, taskId: string, kind = "FOCUS", overrun?: boolean) {
  return s.request.post(`${base}/api/planner/sessions`, {
    data: { taskId, kind, ...(overrun === undefined ? {} : { overrun }) },
  });
}

/** Moves a session's start into the past so it has run for `ms`. */
async function age(id: string, ms: number) {
  await prisma.pomodoroSession.update({ where: { id }, data: { startedAt: new Date(Date.now() - ms) } });
}

async function startAndEnd(s: Session, base: string, taskId: string, kind: string, overrun = false) {
  const res = await start(s, base, taskId, kind, overrun);
  expect(res.status()).toBe(201);
  const body = (await res.json()).data;
  const planned = body.plannedMinutes as number;
  await age(body.id, planned * MIN + 5_000);
  const end = await s.request.post(`${base}/api/planner/sessions/${body.id}/end`);
  expect(end.status()).toBe(200);
  return (await end.json()).data;
}

async function ledgerMatches(userId: string) {
  const events = await prisma.xpEvent.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  expect(events.reduce((xp, e) => Math.max(0, xp + e.delta), 0)).toBe(user.cultivationXp);
}

// spec-9-2: server-truth Pomodoro sessions.
test.describe("/api/planner/sessions", () => {
  test("unauthenticated requests return the 401 envelope", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const ctx = await playwright.request.newContext();
    for (const res of [
      await ctx.post(`${base}/api/planner/sessions`, { data: {} }),
      await ctx.post(`${base}/api/planner/sessions/abc/end`),
      await ctx.get(`${base}/api/planner/sessions/running`),
    ]) {
      expect(res.status()).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
    }
  });

  test("start returns 201 with the planned length; remainder is shorter", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const taskId = await addTask(s, base, 90);
    const res = await start(s, base, taskId);
    expect(res.status()).toBe(201);
    const data = (await res.json()).data;
    expect(data).toMatchObject({ taskId, kind: "FOCUS", plannedMinutes: 25, overrun: false });
    expect(typeof data.id).toBe("string");
    expect(Number.isNaN(Date.parse(data.startedAt))).toBe(false);

    const t2 = await addTask(s, base, 10);
    await s.request.post(`${base}/api/planner/sessions/${data.id}/end`);
    const r2 = await start(s, base, t2);
    expect((await r2.json()).data.plannedMinutes).toBe(10);
  });

  test("invalid body is 400, unknown or foreign task is 404", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const taskId = await addTask(s, base);
    expect((await start(s, base, taskId, "NAP")).status()).toBe(400);
    expect((await s.request.post(`${base}/api/planner/sessions`, { data: {} })).status()).toBe(400);
    expect((await start(s, base, "nope")).status()).toBe(404);
    expect((await start(other, base, taskId)).status()).toBe(404);
  });

  test("a second start is 409; running reports the session or null", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const taskId = await addTask(s, base);
    expect((await (await s.request.get(`${base}/api/planner/sessions/running`)).json()).data).toBeNull();
    const first = (await (await start(s, base, taskId)).json()).data;
    const second = await start(s, base, taskId);
    expect(second.status()).toBe(409);
    expect((await second.json()).error.code).toBeTruthy();
    const running = (await (await s.request.get(`${base}/api/planner/sessions/running`)).json()).data;
    expect(running.id).toBe(first.id);
  });

  test("two concurrent starts leave one 201, one 409 and one open row", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const taskId = await addTask(s, base);
    const results = await Promise.all([start(s, base, taskId), start(s, base, taskId)]);
    expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
    expect(await prisma.pomodoroSession.count({ where: { userId: s.userId, endedAt: null } })).toBe(1);
  });

  test("break: needs an ended focus; short, then long on the 4th", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const taskId = await addTask(s, base, 400);
    expect((await start(s, base, taskId, "BREAK")).status()).toBe(409);
    for (let i = 1; i <= 4; i++) {
      await startAndEnd(s, base, taskId, "FOCUS");
      const brk = await startAndEnd(s, base, taskId, "BREAK");
      expect(brk.plannedMinutes).toBe(i === 4 ? 15 : 5);
    }
    const xp = await prisma.xpEvent.count({ where: { userId: s.userId, reason: "FOCUS_SESSION" } });
    expect(xp).toBe(4);
  });

  test("overrun: wrong flag is 409, two allowed, the third is 409", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const taskId = await addTask(s, base, 25);
    expect((await start(s, base, taskId, "FOCUS", true)).status()).toBe(409); // remaining > 0
    await startAndEnd(s, base, taskId, "FOCUS");
    expect((await start(s, base, taskId, "FOCUS", false)).status()).toBe(409); // remaining 0
    const first = await startAndEnd(s, base, taskId, "FOCUS", true);
    expect(first).toMatchObject({ plannedMinutes: 25, overrun: true });
    await startAndEnd(s, base, taskId, "FOCUS", true);
    expect((await start(s, base, taskId, "FOCUS", true)).status()).toBe(409);
  });

  test("a done Task starts nothing", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const taskId = await addTask(s, base);
    await s.request.post(`${base}/api/planner/tasks/${taskId}/done`);
    expect((await start(s, base, taskId)).status()).toBe(409);
  });

  test("end early: actual minutes, one XP event, loggedMinutes, ledger intact", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const taskId = await addTask(s, base);
    const started = (await (await start(s, base, taskId)).json()).data;
    const id = started.id as string;
    const startedAtUtc = (started.startedAt as string).slice(0, 10);
    await age(id, 10 * MIN + 5_000);
    const end = await s.request.post(`${base}/api/planner/sessions/${id}/end`);
    expect(end.status()).toBe(200);
    expect((await end.json()).data).toMatchObject({ actualMinutes: 10 });

    const events = await prisma.xpEvent.findMany({ where: { userId: s.userId, reason: "FOCUS_SESSION" } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ delta: 1, questKind: null });
    // spec-10-3: the first focus session moved the Task to the real start day (user is UTC).
    expect(events[0]!.localDay.toISOString().slice(0, 10)).toBe(startedAtUtc);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).loggedMinutes).toBe(10);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: s.userId } })).cultivationXp).toBe(1);
    await ledgerMatches(s.userId);

    // Re-end: 200, unchanged, no second XP.
    const again = await s.request.post(`${base}/api/planner/sessions/${id}/end`);
    expect(again.status()).toBe(200);
    expect((await again.json()).data.actualMinutes).toBe(10);
    expect(await prisma.xpEvent.count({ where: { userId: s.userId, reason: "FOCUS_SESSION" } })).toBe(1);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).loggedMinutes).toBe(10);
  });

  test("end under one minute earns nothing; a break earns nothing", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const taskId = await addTask(s, base);
    const id = (await (await start(s, base, taskId)).json()).data.id;
    await age(id, 30_000);
    const end = await s.request.post(`${base}/api/planner/sessions/${id}/end`);
    expect((await end.json()).data.actualMinutes).toBe(0);
    expect(await prisma.xpEvent.count({ where: { userId: s.userId } })).toBe(0);

    await startAndEnd(s, base, taskId, "FOCUS");
    await startAndEnd(s, base, taskId, "BREAK");
    expect(await prisma.xpEvent.count({ where: { userId: s.userId, reason: "FOCUS_SESSION" } })).toBe(1);
    await ledgerMatches(s.userId);
  });

  test("focus XP scales by Bo", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    for (const [bo, delta] of [
      [2, 2],
      [3, 4],
    ] as const) {
      const s = await newUser(playwright, base);
      const startXp = CULTIVATION_LADDER.find((l) => l.bo === bo)!.startXp;
      await prisma.user.update({ where: { id: s.userId }, data: { cultivationXp: startXp } });
      await startAndEnd(s, base, await addTask(s, base), "FOCUS");
      const event = await prisma.xpEvent.findFirstOrThrow({ where: { userId: s.userId, reason: "FOCUS_SESSION" } });
      expect(event.delta).toBe(delta);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: s.userId } })).cultivationXp).toBe(startXp + delta);
    }
  });

  test("end is user-scoped: another user's session is 404", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const id = (await (await start(s, base, await addTask(s, base))).json()).data.id;
    expect((await other.request.post(`${base}/api/planner/sessions/${id}/end`)).status()).toBe(404);
    expect((await other.request.post(`${base}/api/planner/sessions/missing/end`)).status()).toBe(404);
  });

  test("an expired session is closed at its planned end by any planner call", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const taskId = await addTask(s, base);
    const id = (await (await start(s, base, taskId)).json()).data.id;
    const startedAt = new Date(Date.now() - 3 * 60 * MIN);
    await prisma.pomodoroSession.update({ where: { id }, data: { startedAt } });

    // A different planner route triggers the sweep.
    expect((await s.request.get(`${base}/api/planner/settings`)).status()).toBe(200);
    const row = await prisma.pomodoroSession.findUniqueOrThrow({ where: { id } });
    expect(row.actualMinutes).toBe(25);
    expect(row.endedAt!.getTime()).toBe(startedAt.getTime() + 25 * MIN);
    expect(await prisma.xpEvent.count({ where: { userId: s.userId, reason: "FOCUS_SESSION" } })).toBe(1);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).loggedMinutes).toBe(25);
    expect((await (await s.request.get(`${base}/api/planner/sessions/running`)).json()).data).toBeNull();
    await ledgerMatches(s.userId);
  });

  test("a foreign or unknown taskId is 404 even while a session is running", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const foreign = await addTask(other, base);
    expect((await start(s, base, await addTask(s, base))).status()).toBe(201);
    expect((await start(s, base, foreign)).status()).toBe(404);
    expect((await start(s, base, "nope")).status()).toBe(404);
  });

  test("two concurrent ends write one XpEvent and one loggedMinutes increment", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const taskId = await addTask(s, base);
    const id = (await (await start(s, base, taskId)).json()).data.id;
    await age(id, 10 * MIN + 5_000);
    const results = await Promise.all([
      s.request.post(`${base}/api/planner/sessions/${id}/end`),
      s.request.post(`${base}/api/planner/sessions/${id}/end`),
    ]);
    expect(results.map((r) => r.status())).toEqual([200, 200]);
    expect(await prisma.xpEvent.count({ where: { userId: s.userId, reason: "FOCUS_SESSION" } })).toBe(1);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).loggedMinutes).toBe(10);
    await ledgerMatches(s.userId);
  });

  test("the sweep runs on tasks, categories, overdue and running reads", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const taskId = await addTask(s, base);
    for (const path of [
      `tasks?day=${DAY}`,
      "categories",
      "tasks/overdue",
      "sessions/running",
    ]) {
      const id = (await (await start(s, base, taskId)).json()).data.id;
      await age(id, 3 * 60 * MIN);
      expect((await s.request.get(`${base}/api/planner/${path}`)).status()).toBe(200);
      const row = await prisma.pomodoroSession.findUniqueOrThrow({ where: { id } });
      expect(row.endedAt, path).not.toBeNull();
      expect(row.actualMinutes, path).toBe(row.plannedMinutes);
    }
  });

  test("deleting a Task removes its sessions", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const taskId = await addTask(s, base);
    await start(s, base, taskId);
    expect((await s.request.delete(`${base}/api/planner/tasks/${taskId}`)).status()).toBe(200);
    expect(await prisma.pomodoroSession.count({ where: { taskId } })).toBe(0);
  });
});

// spec-9-3: GET /api/planner/tasks/[id].
test.describe("GET /api/planner/tasks/[id]", () => {
  test("returns the Task with its sessions, oldest first; 401 and 404 otherwise", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const taskId = await addTask(s, base, 90);

    const anon = await (await playwright.request.newContext()).get(`${base}/api/planner/tasks/${taskId}`);
    expect(anon.status()).toBe(401);

    await startAndEnd(s, base, taskId, "FOCUS");
    await startAndEnd(s, base, taskId, "BREAK");
    const running = await start(s, base, taskId, "FOCUS");
    expect(running.status()).toBe(201);

    const res = await s.request.get(`${base}/api/planner/tasks/${taskId}`);
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    expect(data.task).toMatchObject({ id: taskId, estimateMinutes: 90, loggedMinutes: 25 });
    expect(data.sessions.map((x: { kind: string }) => x.kind)).toEqual(["FOCUS", "BREAK", "FOCUS"]);
    expect(data.sessions[2].endedAt).toBeNull();

    expect((await other.request.get(`${base}/api/planner/tasks/${taskId}`)).status()).toBe(404);
    expect((await s.request.get(`${base}/api/planner/tasks/nope`)).status()).toBe(404);
  });
});

// spec-10-3: the first focus session anchors the Task's start.
test.describe("first focus session sets startAt", () => {
  const taskRow = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } });

  test("first FOCUS sets startAt and localDay; a second session leaves them", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const id = await addTask(s, base, 90);
    expect((await taskRow(id)).startAt).toBeNull();
    const res = await start(s, base, id);
    expect(res.status()).toBe(201);
    const first = (await res.json()).data;
    const after = await taskRow(id);
    expect(after.startAt?.toISOString()).toBe(first.startedAt);
    expect(after.localDay.toISOString().slice(0, 10)).toBe(first.startedAt.slice(0, 10));

    await age(first.id, 25 * MIN + 5_000);
    expect((await s.request.post(`${base}/api/planner/sessions/${first.id}/end`)).status()).toBe(200);
    expect((await start(s, base, id, "BREAK")).status()).toBe(201);
    expect((await taskRow(id)).startAt?.toISOString()).toBe(first.startedAt);
  });

  test("a refused start writes nothing", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const id = await addTask(s, base, 90);
    const res = await start(s, base, id, "BREAK");
    expect(res.status()).toBe(409);
    expect((await prisma.task.findUniqueOrThrow({ where: { id } })).startAt).toBeNull();
  });

  test("a scheduled Task moves to the real start", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const created = await s.request.post(`${base}/api/planner/tasks`, {
      data: { title: "Read", categoryId: s.categoryId, localDay: DAY, startTime: "09:00", estimateMinutes: 50 },
    });
    expect(created.status()).toBe(201);
    const id = (await created.json()).data.id as string;
    const first = (await (await start(s, base, id)).json()).data;
    const after = await taskRow(id);
    expect(after.startAt?.toISOString()).toBe(first.startedAt);
    expect(after.localDay.toISOString().slice(0, 10)).toBe(first.startedAt.slice(0, 10));
  });

  for (const timeZone of ["Pacific/Kiritimati", "Etc/GMT+12"]) {
    test(`localDay follows the user's timezone (${timeZone})`, async ({ playwright, baseURL }) => {
      const base = baseURL ?? "http://localhost:3100";
      const s = await newUser(playwright, base);
      await prisma.user.update({ where: { id: s.userId }, data: { timezone: timeZone } });
      const id = await addTask(s, base, 50);
      const first = (await (await start(s, base, id)).json()).data;
      const expected = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(first.startedAt));
      expect((await taskRow(id)).localDay.toISOString().slice(0, 10)).toBe(expected);
    });
  }
});
