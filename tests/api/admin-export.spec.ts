import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";
import { backupExportSchema } from "@training-sanctum/domain";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";
const ADMIN_EMAIL = "admin-e2e@example.test";

type PW = { request: { newContext: () => Promise<APIRequestContext> } };

async function signUp(playwright: PW, base: string, email: string) {
  const request = await playwright.request.newContext();
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Export Test", timezone: "UTC" },
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

/** One Class, Unsorted Folder, Flashcard and Card with two records, plus cultivation rows. */
async function seedUser(email: string, disabled = false) {
  const user = await prisma.user.create({
    data: { name: "Seed", email, timezone: "Asia/Ho_Chi_Minh", disabled, cultivationXp: 120 },
  });
  const klass = await prisma.class.create({
    data: { name: "Seed class", color: "MINT", userId: user.id },
  });
  const folder = await prisma.folder.create({
    data: { name: "Unsorted", isUnsorted: true, classId: klass.id, userId: user.id },
  });
  const flashcard = await prisma.flashcard.create({
    data: { name: "Seed set", folderId: folder.id, userId: user.id },
  });
  const card = await prisma.card.create({
    data: { term: "ephemeral", definition: "short-lived", flashcardId: flashcard.id, userId: user.id },
  });
  const graded = new Date("2026-11-10T08:30:00.000Z");
  await prisma.schedulingRecord.createMany({
    data: [
      {
        cardId: card.id,
        userId: user.id,
        direction: "TERM_TO_DEFINITION",
        interval: 6,
        repetitions: 2,
        easeFactor: 2.36,
        nextReviewDate: new Date("2026-11-16T00:00:00.000Z"),
        firstGradedAt: graded,
      },
      {
        cardId: card.id,
        userId: user.id,
        direction: "DEFINITION_TO_TERM",
        nextReviewDate: new Date("2026-11-14T00:00:00.000Z"),
      },
    ],
  });
  const records = await prisma.schedulingRecord.findMany({ where: { cardId: card.id } });
  const cultivationDay = await prisma.cultivationDay.create({
    data: { userId: user.id, localDay: new Date("2026-11-12"), quests: [{ kind: "CLEAR_REVIEW", xp: 40 }] },
  });
  const claim = await prisma.xpEvent.create({
    data: { userId: user.id, localDay: new Date("2026-11-12"), questKind: "CLEAR_REVIEW", delta: 40, reason: "CLAIM" },
  });
  const penalty = await prisma.xpEvent.create({
    data: { userId: user.id, localDay: new Date("2026-11-13"), questKind: "LEARN_FLASHCARDS", delta: -10, reason: "PENALTY" },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { cultivationSettledThrough: new Date("2026-11-13") },
  });
  const ids = [
    klass.id,
    folder.id,
    flashcard.id,
    card.id,
    ...records.map((x) => x.id),
    cultivationDay.id,
    claim.id,
    penalty.id,
  ];
  return { user, card, graded, ids };
}

// Story 5.2: GET /api/admin/users/[id]/export
test.describe("GET /api/admin/users/[id]/export", () => {
  test("no cookie gets 401", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await playwright.request.newContext();
    const res = await request.get(`${base}/api/admin/users/anything/export`);
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("a normal user gets 403 and no data", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const { request } = await signUp(playwright, base, `plain-${randomUUID()}@example.test`);
    const res = await request.get(`${base}/api/admin/users/anything/export`);
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.user).toBeUndefined();
  });

  test("an unknown user gets 404", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await adminSession(playwright, base);
    const res = await request.get(`${base}/api/admin/users/${randomUUID()}/export`);
    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  test("an admin downloads a validated, verbatim backup (disabled user too)", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await adminSession(playwright, base);
    const target = await seedUser(`export-${randomUUID()}@example.test`, true);
    const other = await seedUser(`export-other-${randomUUID()}@example.test`);
    try {
      const res = await request.get(`${base}/api/admin/users/${target.user.id}/export`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("application/json");
      expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename=".+\.json"$/);
      expect(res.headers()["cache-control"]).toBe("no-store");

      const body = await res.json();
      expect(body.data).toBeUndefined();
      const parsed = backupExportSchema.parse(body);

      expect(parsed.user).toEqual({
        id: target.user.id,
        email: target.user.email,
        studyDirections: "BOTH",
        timezone: "Asia/Ho_Chi_Minh",
      });
      expect(parsed.classes).toHaveLength(1);
      expect(parsed.classes[0].name).toBe("Seed class");
      expect(parsed.classes[0].color).toBe("MINT");
      expect(parsed.classes[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
      expect(new Date(parsed.classes[0].updatedAt).toISOString()).toBe(parsed.classes[0].updatedAt);
      expect(parsed.folders).toHaveLength(1);
      expect(parsed.folders[0].name).toBe("Unsorted");
      expect(parsed.folders[0].isUnsorted).toBe(true);
      expect(parsed.flashcards).toHaveLength(1);
      expect(parsed.flashcards[0].name).toBe("Seed set");
      expect(parsed.cards).toHaveLength(1);
      expect(parsed.cards[0].term).toBe("ephemeral");
      expect(parsed.cards[0].definition).toBe("short-lived");
      expect(parsed.cards[0].flashcardId).toBe(parsed.flashcards[0].id);
      const records = parsed.cards[0].schedulingRecords;
      expect(records).toHaveLength(2);
      const t2d = records.find((r) => r.direction === "TERM_TO_DEFINITION")!;
      const d2t = records.find((r) => r.direction === "DEFINITION_TO_TERM")!;
      expect(t2d.firstGradedAt).toBe(target.graded.toISOString());
      expect(t2d.interval).toBe(6);
      expect(t2d.easeFactor).toBe(2.36);
      expect(t2d.repetitions).toBe(2);
      expect(t2d.nextReviewDate).toBe("2026-11-16T00:00:00.000Z");
      expect(d2t.repetitions).toBe(0);
      expect(d2t.nextReviewDate).toBe("2026-11-14T00:00:00.000Z");
      expect(d2t.firstGradedAt).toBeNull();

      expect(parsed.cultivation.xp).toBe(120);
      expect(parsed.cultivation.settledThrough).toBe("2026-11-13");
      expect(parsed.cultivation.days).toHaveLength(1);
      expect(parsed.cultivation.days[0].localDay).toBe("2026-11-12");
      expect(parsed.cultivation.days[0].quests).toEqual([{ kind: "CLEAR_REVIEW", xp: 40 }]);
      expect(parsed.cultivation.xpEvents.map((e) => e.reason)).toEqual(["CLAIM", "PENALTY"]);
      expect(parsed.cultivation.xpEvents.map((e) => e.delta)).toEqual([40, -10]);
      expect(parsed.cultivation.xpEvents.map((e) => e.questKind)).toEqual([
        "CLEAR_REVIEW",
        "LEARN_FLASHCARDS",
      ]);

      // Isolation: nothing of the other user appears.
      const text = JSON.stringify(body);
      expect(text).not.toContain(other.user.id);
      for (const otherId of other.ids) expect(text).not.toContain(otherId);

      // No auth or admin fields.
      for (const key of ["password", "role", "disabled", "accounts", "token"]) {
        expect(text).not.toContain(`"${key}"`);
      }
      // Login sessions are never exported; `planner.sessions` is the only "sessions" key.
      expect(Object.keys(body)).not.toContain("sessions");
      for (const key of ["sessionToken", "ipAddress", "userAgent"]) {
        expect(text).not.toContain(`"${key}"`);
      }
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [target.user.id, other.user.id] } } });
    }
  });

  test("an empty account exports empty sections", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await adminSession(playwright, base);
    const user = await prisma.user.create({
      data: { name: "Empty", email: `export-empty-${randomUUID()}@example.test`, timezone: "UTC" },
    });
    try {
      const res = await request.get(`${base}/api/admin/users/${user.id}/export`);
      expect(res.status()).toBe(200);
      const parsed = backupExportSchema.parse(await res.json());
      expect(parsed.classes).toEqual([]);
      expect(parsed.folders).toEqual([]);
      expect(parsed.flashcards).toEqual([]);
      expect(parsed.cards).toEqual([]);
      expect(parsed.cultivation).toEqual({ xp: 0, settledThrough: null, days: [], xpEvents: [] });
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  test("export carries Members and shared Classes, and only the user's own records", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await adminSession(playwright, base);
    const owner = await seedUser(`export-own-${randomUUID()}@example.test`);
    const member = await seedUser(`export-mem-${randomUUID()}@example.test`);
    try {
      const klass = await prisma.class.findFirstOrThrow({ where: { userId: owner.user.id } });
      await prisma.classMember.create({ data: { classId: klass.id, userId: member.user.id } });
      await prisma.schedulingRecord.createMany({
        data: (["TERM_TO_DEFINITION", "DEFINITION_TO_TERM"] as const).map((direction) => ({
          cardId: owner.card.id,
          userId: member.user.id,
          direction,
          repetitions: 7,
          nextReviewDate: new Date("2026-11-20T00:00:00.000Z"),
        })),
      });

      const ownerFile = backupExportSchema.parse(
        await (await request.get(`${base}/api/admin/users/${owner.user.id}/export`)).json()
      );
      expect(ownerFile.classes[0].members).toEqual([member.user.email]);
      expect(ownerFile.sharedClasses).toEqual([]);
      expect(ownerFile.cards[0].schedulingRecords).toHaveLength(2);
      expect(ownerFile.cards[0].schedulingRecords.every((r) => r.repetitions !== 7)).toBe(true);

      const memberFile = backupExportSchema.parse(
        await (await request.get(`${base}/api/admin/users/${member.user.id}/export`)).json()
      );
      expect(memberFile.sharedClasses).toEqual([{ name: "Seed class", ownerEmail: owner.user.email }]);
      expect(memberFile.classes).toHaveLength(1);
      expect(memberFile.classes[0].members).toEqual([]);
      expect(memberFile.cards).toHaveLength(1);
      expect(JSON.stringify(memberFile)).not.toContain(owner.card.id);
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [owner.user.id, member.user.id] } } });
    }
  });

  test("members and sharedClasses come back sorted", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await adminSession(playwright, base);
    const tag = randomUUID();
    const owner = await seedUser(`export-sort-own-${tag}@example.test`);
    const zed = await seedUser(`zed-${tag}@example.test`);
    const amy = await seedUser(`amy-${tag}@example.test`);
    const hostB = await seedUser(`b-host-${tag}@example.test`);
    const hostA = await seedUser(`a-host-${tag}@example.test`);
    try {
      const own = await prisma.class.findFirstOrThrow({ where: { userId: owner.user.id } });
      for (const u of [zed, amy]) await prisma.classMember.create({ data: { classId: own.id, userId: u.user.id } });
      // Two hosts share the name "Zebra" (tie broken by owner email), plus a lower name; created out of order.
      const zebraB = await prisma.class.findFirstOrThrow({ where: { userId: hostB.user.id } });
      const zebraA = await prisma.class.findFirstOrThrow({ where: { userId: hostA.user.id } });
      await prisma.class.update({ where: { id: zebraB.id }, data: { name: "Zebra" } });
      await prisma.class.update({ where: { id: zebraA.id }, data: { name: "Zebra" } });
      const apple = await prisma.class.create({ data: { name: "Apple", color: "ROSE", userId: hostB.user.id } });
      for (const id of [zebraB.id, zebraA.id, apple.id]) {
        await prisma.classMember.create({ data: { classId: id, userId: owner.user.id } });
      }

      const file = backupExportSchema.parse(
        await (await request.get(`${base}/api/admin/users/${owner.user.id}/export`)).json()
      );
      expect(file.classes[0].members).toEqual([amy.user.email, zed.user.email]);
      expect(file.sharedClasses).toEqual([
        { name: "Apple", ownerEmail: hostB.user.email },
        { name: "Zebra", ownerEmail: hostA.user.email },
        { name: "Zebra", ownerEmail: hostB.user.email },
      ]);
    } finally {
      await prisma.user.deleteMany({
        where: { id: { in: [owner.user.id, zed.user.id, amy.user.id, hostB.user.id, hostA.user.id] } },
      });
    }
  });

  test("exports planner settings, categories, tasks and sessions of that user only", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await adminSession(playwright, base);
    const user = await prisma.user.create({
      data: {
        name: "Planner",
        email: `export-planner-${randomUUID()}@example.test`,
        timezone: "UTC",
        pomodoroSettings: { focus: 30, shortBreak: 10, longBreak: 20, longBreakEvery: 3 },
      },
    });
    const other = await prisma.user.create({
      data: { name: "Other", email: `export-planner-o-${randomUUID()}@example.test`, timezone: "UTC" },
    });
    try {
      const category = await prisma.taskCategory.create({ data: { userId: user.id, name: "Study", color: "SKY" } });
      const otherCategory = await prisma.taskCategory.create({ data: { userId: other.id, name: "Nope", color: "ROSE" } });
      const task = await prisma.task.create({
        data: {
          userId: user.id,
          categoryId: category.id,
          title: "Read",
          localDay: new Date("2026-11-17T00:00:00.000Z"),
          estimateMinutes: 50,
          loggedMinutes: 25,
        },
      });
      await prisma.task.create({
        data: {
          userId: other.id,
          categoryId: otherCategory.id,
          title: "Not mine",
          localDay: new Date("2026-11-17T00:00:00.000Z"),
          estimateMinutes: 5,
        },
      });
      await prisma.pomodoroSession.create({
        data: {
          userId: user.id,
          taskId: task.id,
          kind: "FOCUS",
          plannedMinutes: 25,
          actualMinutes: 25,
          startedAt: new Date("2026-11-17T08:00:00.000Z"),
          endedAt: new Date("2026-11-17T08:25:00.000Z"),
        },
      });
      const res = await request.get(`${base}/api/admin/users/${user.id}/export`);
      expect(res.status()).toBe(200);
      const parsed = backupExportSchema.parse(await res.json());
      expect(parsed.planner.settings).toEqual({ focus: 30, shortBreak: 10, longBreak: 20, longBreakEvery: 3 });
      expect(parsed.planner.categories.map((c) => c.name)).toEqual(["Study"]);
      expect(parsed.planner.tasks.map((t) => [t.title, t.localDay, t.loggedMinutes])).toEqual([["Read", "2026-11-17", 25]]);
      expect(parsed.planner.sessions.map((x) => [x.kind, x.endedAt])).toEqual([["FOCUS", "2026-11-17T08:25:00.000Z"]]);
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    }
  });
});
