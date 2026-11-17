import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const DAY = new Date("2026-11-17T00:00:00.000Z");

interface Session {
  request: APIRequestContext;
  userId: string;
}

async function newUser(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  base: string
): Promise<Session> {
  const request = await playwright.request.newContext();
  const email = `planner-cat-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Planner Cat", timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id };
}

type Category = { id: string; name: string; color: string; taskCount: number };

async function create(s: Session, base: string, name: string): Promise<Category> {
  const res = await s.request.post(`${base}/api/planner/categories`, { data: { name } });
  expect(res.status()).toBe(201);
  return (await res.json()).data;
}

async function seedTasks(s: Session, categoryId: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    await prisma.task.create({
      data: {
        userId: s.userId,
        categoryId,
        title: `Task ${i}`,
        localDay: DAY,
        estimateMinutes: 25,
      },
    });
  }
}

// spec-8-2: Planner Categories. Session-guarded, Zod-validated, user-scoped.
test.describe("/api/planner/categories", () => {
  test("unauthenticated requests return the 401 envelope", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const ctx = await playwright.request.newContext();
    for (const res of [
      await ctx.get(`${base}/api/planner/categories`),
      await ctx.post(`${base}/api/planner/categories`, { data: { name: "x" } }),
      await ctx.patch(`${base}/api/planner/categories/abc`, { data: { name: "x" } }),
      await ctx.delete(`${base}/api/planner/categories/abc`, { data: { mode: "delete" } }),
    ]) {
      expect(res.status()).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
    }
  });

  test("create defaults the colour to the next tint by count", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const a = await create(s, base, "Alpha");
    const b = await create(s, base, "Beta");
    const c = await create(s, base, "Study");
    expect([a.color, b.color, c.color]).toEqual(["LAVENDER", "SKY", "MINT"]);
    const list = (await (await s.request.get(`${base}/api/planner/categories`)).json()).data;
    expect(list.map((x: Category) => x.name)).toEqual(["Alpha", "Beta", "Study"]);
  });

  test("a duplicate name is a field error, case-insensitively", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    await create(s, base, "Study");
    const res = await s.request.post(`${base}/api/planner/categories`, { data: { name: "study" } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.fields.name).toBeTruthy();

    // Another user may use the same name.
    const other = await newUser(playwright, base);
    await create(other, base, "Study");
  });

  test("the database index rejects a racing duplicate", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    await create(s, base, "Study");
    await expect(
      prisma.taskCategory.create({ data: { userId: s.userId, name: "STUDY", color: "SKY" } })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  test("blank and over-long names return a name field error", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    for (const name of ["", "a".repeat(41)]) {
      const res = await s.request.post(`${base}/api/planner/categories`, { data: { name } });
      expect(res.status()).toBe(400);
      expect((await res.json()).error.fields.name).toBeTruthy();
    }
  });

  test("rename and recolour; same row may change case; clash and cross-user", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const study = await create(s, base, "Study");
    await create(s, base, "Gym");

    const recase = await s.request.patch(`${base}/api/planner/categories/${study.id}`, {
      data: { name: "STUDY", color: "ROSE" },
    });
    expect(recase.status()).toBe(200);
    expect((await recase.json()).data).toMatchObject({ name: "STUDY", color: "ROSE" });

    const clash = await s.request.patch(`${base}/api/planner/categories/${study.id}`, {
      data: { name: "gym" },
    });
    expect(clash.status()).toBe(400);
    expect((await clash.json()).error.fields.name).toBeTruthy();

    const other = await newUser(playwright, base);
    const cross = await other.request.patch(`${base}/api/planner/categories/${study.id}`, {
      data: { name: "Mine" },
    });
    expect(cross.status()).toBe(404);
    const missing = await s.request.patch(`${base}/api/planner/categories/nope`, {
      data: { name: "Mine" },
    });
    expect(missing.status()).toBe(404);
  });

  test("a colour-only PATCH keeps the name", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const cat = await create(s, base, "Study");
    const res = await s.request.patch(`${base}/api/planner/categories/${cat.id}`, {
      data: { color: "BUTTER" },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toMatchObject({ name: "Study", color: "BUTTER" });
  });

  test("GET lists only the session user's categories", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    await create(s, base, "Mine");
    await create(other, base, "Theirs");
    const list = (await (await s.request.get(`${base}/api/planner/categories`)).json()).data;
    expect(list.map((x: Category) => x.name)).toEqual(["Mine"]);
  });

  test("delete with no tasks needs no choice", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const cat = await create(s, base, "Empty");
    const res = await s.request.delete(`${base}/api/planner/categories/${cat.id}`);
    expect(res.status()).toBe(200);
    expect(await prisma.taskCategory.count({ where: { id: cat.id } })).toBe(0);
  });

  test("delete with move re-points the tasks", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const from = await create(s, base, "From");
    const to = await create(s, base, "To");
    await seedTasks(s, from.id, 2);

    const res = await s.request.delete(`${base}/api/planner/categories/${from.id}`, {
      data: { mode: "move", targetId: to.id },
    });
    expect(res.status()).toBe(200);
    expect(await prisma.taskCategory.count({ where: { id: from.id } })).toBe(0);
    expect(await prisma.task.count({ where: { categoryId: to.id } })).toBe(2);
  });

  test("delete with move rejects a missing, self or foreign target and changes nothing", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const from = await create(s, base, "From");
    const foreign = await create(other, base, "Foreign");
    await seedTasks(s, from.id, 1);

    for (const targetId of [from.id, foreign.id, "nope"]) {
      const res = await s.request.delete(`${base}/api/planner/categories/${from.id}`, {
        data: { mode: "move", targetId },
      });
      expect(res.status()).toBe(400);
      expect((await res.json()).error.fields.targetId).toBeTruthy();
    }
    expect(await prisma.taskCategory.count({ where: { id: from.id } })).toBe(1);
    expect(await prisma.task.count({ where: { categoryId: from.id } })).toBe(1);

    const crossDelete = await other.request.delete(`${base}/api/planner/categories/${from.id}`, {
      data: { mode: "delete" },
    });
    expect(crossDelete.status()).toBe(404);
  });

  test("delete tasks too removes the tasks and the category", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const only = await create(s, base, "Only");
    await seedTasks(s, only.id, 3);
    const res = await s.request.delete(`${base}/api/planner/categories/${only.id}`, {
      data: { mode: "delete" },
    });
    expect(res.status()).toBe(200);
    expect(await prisma.task.count({ where: { userId: s.userId } })).toBe(0);
    expect(await prisma.taskCategory.count({ where: { userId: s.userId } })).toBe(0);
  });

  test("a category with tasks needs a mode", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const cat = await create(s, base, "Busy");
    await seedTasks(s, cat.id, 1);
    const res = await s.request.delete(`${base}/api/planner/categories/${cat.id}`);
    expect(res.status()).toBe(400);
    expect(await prisma.taskCategory.count({ where: { id: cat.id } })).toBe(1);
  });

  test("an XpEvent with a null questKind is stored", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    await prisma.xpEvent.create({
      data: { userId: s.userId, localDay: DAY, questKind: null, delta: 5, reason: "TASK_DONE" },
    });
    const row = await prisma.xpEvent.findFirstOrThrow({ where: { userId: s.userId } });
    expect(row.questKind).toBeNull();
  });
});
