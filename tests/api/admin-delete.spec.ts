import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";
const ADMIN_EMAIL = "admin-e2e@example.test";

type PW = { request: { newContext: () => Promise<APIRequestContext> } };

async function signUp(playwright: PW, base: string, email: string) {
  const request = await playwright.request.newContext();
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Delete Test", timezone: "UTC" },
  });
  return { request, response };
}

async function logIn(playwright: PW, base: string, email: string) {
  const request = await playwright.request.newContext();
  const response = await request.post(`${base}/api/auth/sign-in/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD },
  });
  return { request, response };
}

async function adminSession(playwright: PW, base: string) {
  const { request, response } = await signUp(playwright, base, ADMIN_EMAIL);
  if (response.ok()) return request;
  const login = await logIn(playwright, base, ADMIN_EMAIL);
  expect(login.response.ok()).toBeTruthy();
  return login.request;
}

async function account(playwright: PW, base: string, role: "user" | "admin" = "user") {
  const email = `delete-${randomUUID()}@example.test`;
  const { request, response } = await signUp(playwright, base, email);
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  if (role === "admin") await prisma.user.update({ where: { id: user.id }, data: { role: "admin" } });
  return { email, id: user.id, request };
}

const del = (request: APIRequestContext, base: string, userId: string, data: unknown) =>
  request.delete(`${base}/api/admin/users/${userId}`, { headers: { Origin: base }, data });

async function populate(userId: string) {
  const klass = await prisma.class.create({ data: { name: "Doomed", color: "MINT", userId } });
  const folder = await prisma.folder.create({
    data: { name: "Unsorted", isUnsorted: true, classId: klass.id, userId },
  });
  const flashcard = await prisma.flashcard.create({ data: { name: "Set", folderId: folder.id, userId } });
  const card = await prisma.card.create({
    data: { term: "t", definition: "d", flashcardId: flashcard.id, userId },
  });
  await prisma.schedulingRecord.create({
    data: { cardId: card.id, userId, direction: "TERM_TO_DEFINITION", nextReviewDate: new Date("2026-11-16") },
  });
  await prisma.cultivationDay.create({
    data: { userId, localDay: new Date("2026-11-12"), quests: [] },
  });
  await prisma.xpEvent.create({
    data: { userId, localDay: new Date("2026-11-12"), questKind: "CLEAR_REVIEW", delta: 40, reason: "CLAIM" },
  });
}

async function counts(userId: string) {
  return {
    classes: await prisma.class.count({ where: { userId } }),
    folders: await prisma.folder.count({ where: { userId } }),
    flashcards: await prisma.flashcard.count({ where: { userId } }),
    cards: await prisma.card.count({ where: { userId } }),
    records: await prisma.schedulingRecord.count({ where: { card: { userId } } }),
    days: await prisma.cultivationDay.count({ where: { userId } }),
    xp: await prisma.xpEvent.count({ where: { userId } }),
    sessions: await prisma.session.count({ where: { userId } }),
    accounts: await prisma.account.count({ where: { userId } }),
    users: await prisma.user.count({ where: { id: userId } }),
  };
}

test.describe("DELETE /api/admin/users/[id]", () => {
  test("no cookie gets 401, a normal user 403", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const anon = await playwright.request.newContext();
    expect((await del(anon, base, "anything", { email: "a@b.c" })).status()).toBe(401);
    const plain = await account(playwright, base);
    try {
      const res = await del(plain.request, base, "anything", { email: "a@b.c" });
      expect(res.status()).toBe(403);
      expect((await res.json()).error.code).toBe("FORBIDDEN");
    } finally {
      await prisma.user.deleteMany({ where: { id: plain.id } });
    }
  });

  test("unknown id is 404; bad body and bad id are 400", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const missing = await del(admin, base, randomUUID(), { email: "a@b.c" });
    expect(missing.status()).toBe(404);
    expect((await missing.json()).error.code).toBe("NOT_FOUND");

    for (const body of [{}, { email: 123 }, { email: null }, { email: "" }, { email: "x".repeat(321) }]) {
      const res = await del(admin, base, randomUUID(), body);
      expect(res.status()).toBe(400);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
    const notJson = await admin.delete(`${base}/api/admin/users/${randomUUID()}`, {
      headers: { Origin: base, "Content-Type": "application/json" },
      data: Buffer.from("not json{"),
    });
    expect(notJson.status()).toBe(400);
    expect((await notJson.json()).error.code).toBe("INVALID_JSON");
    expect((await del(admin, base, "x".repeat(65), { email: "a@b.c" })).status()).toBe(400);
  });

  test("deletes the user and every row scoped to them; others are untouched", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const target = await account(playwright, base);
    const other = await account(playwright, base);
    try {
      await populate(target.id);
      await populate(other.id);
      await prisma.verification.createMany({
        data: [
          { identifier: target.email, value: "v1", expiresAt: new Date(Date.now() + 3_600_000) },
          { identifier: other.email, value: "v2", expiresAt: new Date(Date.now() + 3_600_000) },
        ],
      });
      const otherBefore = await counts(other.id);

      const res = await del(admin, base, target.id, { email: target.email });
      expect(res.status()).toBe(200);
      expect((await res.json()).data).toEqual({ id: target.id });

      const after = await counts(target.id);
      expect(Object.values(after).every((n) => n === 0)).toBe(true);
      expect(await prisma.verification.count({ where: { identifier: target.email } })).toBe(0);
      expect(await prisma.verification.count({ where: { identifier: other.email } })).toBe(1);
      expect(await counts(other.id)).toEqual(otherBefore);

      expect((await target.request.get(`${base}/api/me`)).status()).toBe(401);
      const login = await logIn(playwright, base, target.email);
      expect(login.response.ok()).toBeFalsy();

      const again = await del(admin, base, target.id, { email: target.email });
      expect(again.status()).toBe(404);
    } finally {
      await prisma.verification.deleteMany({
        where: { identifier: { in: [target.email, other.email] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: [target.id, other.id] } } });
    }
  });

  test("an email that differs in case or by a space is 400 EMAIL_MISMATCH and nothing changes", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const target = await account(playwright, base);
    try {
      await populate(target.id);
      const before = await counts(target.id);
      for (const email of [
        target.email.toUpperCase(),
        ` ${target.email}`,
        `${target.email} `,
        "other@example.test",
      ]) {
        const res = await del(admin, base, target.id, { email });
        expect(res.status()).toBe(400);
        expect((await res.json()).error.code).toBe("EMAIL_MISMATCH");
      }
      expect(await counts(target.id)).toEqual(before);
    } finally {
      await prisma.user.deleteMany({ where: { id: target.id } });
    }
  });

  test("a disabled user can be deleted", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const target = await account(playwright, base);
    try {
      await prisma.user.update({ where: { id: target.id }, data: { disabled: true } });
      expect((await del(admin, base, target.id, { email: target.email })).status()).toBe(200);
      expect(await prisma.user.count({ where: { id: target.id } })).toBe(0);
    } finally {
      await prisma.user.deleteMany({ where: { id: target.id } });
    }
  });

  test("deletes a user who owns a task category and a task", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const target = await account(playwright, base);
    try {
      const category = await prisma.taskCategory.create({
        data: { userId: target.id, name: "Study", color: "SKY" },
      });
      const task = await prisma.task.create({
        data: {
          userId: target.id,
          categoryId: category.id,
          title: "Read",
          localDay: new Date("2026-11-17T00:00:00.000Z"),
          estimateMinutes: 25,
        },
      });
      await prisma.pomodoroSession.create({
        data: { userId: target.id, taskId: task.id, kind: "FOCUS", plannedMinutes: 25, startedAt: new Date() },
      });
      const res = await del(admin, base, target.id, { email: target.email });
      expect(res.status()).toBe(200);
      expect(await prisma.taskCategory.count({ where: { userId: target.id } })).toBe(0);
      expect(await prisma.task.count({ where: { userId: target.id } })).toBe(0);
      expect(await prisma.pomodoroSession.count({ where: { userId: target.id } })).toBe(0);
    } finally {
      await prisma.user.deleteMany({ where: { id: target.id } });
    }
  });

  test("an admin cannot delete themselves", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const actor = await account(playwright, base, "admin");
    try {
      const res = await del(actor.request, base, actor.id, { email: actor.email });
      expect(res.status()).toBe(409);
      expect((await res.json()).error.code).toBe("CANNOT_DELETE_SELF");
      expect(await prisma.user.count({ where: { id: actor.id } })).toBe(1);
      expect(await prisma.session.count({ where: { userId: actor.id } })).toBe(1);
    } finally {
      await prisma.user.deleteMany({ where: { id: actor.id } });
    }
  });

  test("the last enabled admin cannot be deleted", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    // The actor is an admin flagged disabled directly (its session is still valid), so it does
    // not count as an enabled admin. Every other admin is flagged for the few statements below
    // and restored in `finally`.
    const actor = await account(playwright, base, "admin");
    const target = await account(playwright, base, "admin");
    const others = await prisma.user.findMany({
      where: { role: "admin", disabled: false, id: { notIn: [actor.id, target.id] } },
      select: { id: true },
    });
    let res;
    try {
      // Keep the window where other admins are flagged as short as possible: tests run in
      // parallel and some log in as the shared admin account.
      await prisma.user.updateMany({
        where: { id: { in: [actor.id, ...others.map((o) => o.id)] } },
        data: { disabled: true },
      });
      res = await del(actor.request, base, target.id, { email: target.email });
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: others.map((o) => o.id) } },
        data: { disabled: false },
      });
    }
    try {
      expect(res.status()).toBe(409);
      expect((await res.json()).error.code).toBe("LAST_ADMIN");
      expect(await prisma.user.count({ where: { id: target.id } })).toBe(1);
      expect(await prisma.session.count({ where: { userId: target.id } })).toBe(1);
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [actor.id, target.id] } } });
    }
  });

  test("another admin can be deleted while a different enabled admin exists", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const actor = await account(playwright, base, "admin");
    const target = await account(playwright, base, "admin");
    try {
      const res = await del(actor.request, base, target.id, { email: target.email });
      expect(res.status()).toBe(200);
      expect(await prisma.user.count({ where: { id: target.id } })).toBe(0);
      expect(await prisma.user.count({ where: { id: actor.id } })).toBe(1);
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [actor.id, target.id] } } });
    }
  });

  test("deleting a Member removes their share; deleting an Owner removes the Class for everyone", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const owner = await account(playwright, base);
    const member = await account(playwright, base);
    const again = await account(playwright, base);
    try {
      await populate(owner.id);
      const klass = await prisma.class.findFirstOrThrow({ where: { userId: owner.id } });
      const card = await prisma.card.findFirstOrThrow({ where: { userId: owner.id } });
      for (const u of [member, again]) {
        await prisma.classMember.create({ data: { classId: klass.id, userId: u.id } });
        await prisma.schedulingRecord.create({
          data: { cardId: card.id, userId: u.id, direction: "TERM_TO_DEFINITION", nextReviewDate: new Date("2026-11-16") },
        });
      }

      await prisma.classInvitation.createMany({
        data: [
          { classId: klass.id, inviterId: owner.id, inviteeId: member.id, status: "PENDING" },
          { classId: klass.id, inviterId: owner.id, inviteeId: again.id, status: "DECLINED" },
        ],
      });

      expect((await del(admin, base, member.id, { email: member.email })).status()).toBe(200);
      expect(await prisma.classInvitation.count({ where: { inviteeId: member.id } })).toBe(0);
      expect(await prisma.classInvitation.count({ where: { inviteeId: again.id } })).toBe(1);
      expect(await prisma.schedulingRecord.count({ where: { cardId: card.id, userId: again.id } })).toBe(1);
      expect(await prisma.schedulingRecord.count({ where: { cardId: card.id, userId: member.id } })).toBe(0);
      expect(await prisma.classMember.count({ where: { classId: klass.id } })).toBe(1);
      expect(await prisma.schedulingRecord.count({ where: { cardId: card.id } })).toBe(2);
      expect(await prisma.class.count({ where: { id: klass.id } })).toBe(1);

      expect((await del(admin, base, owner.id, { email: owner.email })).status()).toBe(200);
      expect(await prisma.class.count({ where: { id: klass.id } })).toBe(0);
      expect(await prisma.card.count({ where: { id: card.id } })).toBe(0);
      expect(await prisma.schedulingRecord.count({ where: { cardId: card.id } })).toBe(0);
      expect(await prisma.classMember.count({ where: { classId: klass.id } })).toBe(0);
      expect(await prisma.user.count({ where: { id: again.id } })).toBe(1);
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [owner.id, member.id, again.id] } } });
    }
  });
});
