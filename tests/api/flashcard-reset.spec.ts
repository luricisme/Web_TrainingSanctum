import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";
import { toLocalCalendarDay } from "@training-sanctum/domain";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";

interface Session {
  request: APIRequestContext;
  userId: string;
}

async function newUser(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  base: string,
  timezone = "UTC"
): Promise<Session> {
  const request = await playwright.request.newContext();
  const email = `reset-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Reset Test", timezone },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id };
}

async function createDeck(owner: Session, memberId: string, base: string, name = "W") {
  const cls = await owner.request.post(`${base}/api/classes`, { data: { name: "C" } });
  const classId = (await cls.json()).data.id as string;
  await prisma.classMember.create({ data: { classId, userId: memberId } });
  return addDeck(owner, base, classId, name);
}

async function addDeck(owner: Session, base: string, classId: string, name: string) {
  const folder = await owner.request.post(`${base}/api/classes/${classId}/folders`, {
    data: { name: `F-${name}` },
  });
  const folderId = (await folder.json()).data.id as string;
  const fc = await owner.request.post(`${base}/api/folders/${folderId}/flashcards`, {
    data: { name },
  });
  const flashcardId = (await fc.json()).data.id as string;
  await owner.request.post(`${base}/api/cards/batch`, {
    data: {
      flashcardId,
      cards: [
        { term: "collate", definition: "gather" },
        { term: "gale", definition: "strong wind" },
      ],
    },
  });
  return { flashcardId, classId };
}

async function gradeAll(userId: string, flashcardId: string) {
  await prisma.schedulingRecord.updateMany({
    where: { userId, card: { flashcardId } },
    data: {
      interval: 6,
      repetitions: 3,
      easeFactor: 2.1,
      firstGradedAt: new Date(),
      nextReviewDate: new Date(Date.now() + 6 * 86_400_000),
    },
  });
}

test.describe("POST /api/flashcards/[id]/reset", () => {
  test("unauthenticated requests return 401", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const ctx = await playwright.request.newContext();
    const res = await ctx.post(`${base}/api/flashcards/${randomUUID()}/reset`);
    expect(res.status()).toBe(401);
  });

  test("resets the caller's records only, in both directions", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const member = await newUser(playwright, base);
    const { flashcardId } = await createDeck(owner, member.userId, base);
    await gradeAll(owner.userId, flashcardId);
    await gradeAll(member.userId, flashcardId);

    const before = await (await member.request.get(`${base}/api/flashcards/${flashcardId}`)).json();
    expect(before.data.hasProgress).toBe(true);

    const res = await member.request.post(`${base}/api/flashcards/${flashcardId}/reset`);
    expect(res.status()).toBe(200);
    expect((await res.json()).data.records).toBe(4);

    const mine = await prisma.schedulingRecord.findMany({
      where: { userId: member.userId, card: { flashcardId } },
    });
    expect(mine).toHaveLength(4);
    for (const r of mine) {
      expect(r).toMatchObject({
        interval: 0,
        repetitions: 0,
        easeFactor: 2.5,
        firstGradedAt: null,
      });
      expect(r.nextReviewDate.getTime()).toBeLessThanOrEqual(Date.now());
    }

    const theirs = await prisma.schedulingRecord.findMany({
      where: { userId: owner.userId, card: { flashcardId } },
    });
    for (const r of theirs) {
      expect(r.repetitions).toBe(3);
      expect(r.firstGradedAt).not.toBeNull();
    }

    const after = await (await member.request.get(`${base}/api/flashcards/${flashcardId}`)).json();
    expect(after.data.hasProgress).toBe(false);
    expect(after.data.learn.newCards).toBe(2);
  });

  test("a stranger gets 404 and nothing changes", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const member = await newUser(playwright, base);
    const stranger = await newUser(playwright, base);
    const { flashcardId } = await createDeck(owner, member.userId, base);
    await gradeAll(owner.userId, flashcardId);

    const res = await stranger.request.post(`${base}/api/flashcards/${flashcardId}/reset`);
    expect(res.status()).toBe(404);
    const rows = await prisma.schedulingRecord.findMany({
      where: { userId: owner.userId, card: { flashcardId } },
    });
    for (const r of rows) expect(r.repetitions).toBe(3);
  });

  test("a second deck of the same learner stays graded", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const member = await newUser(playwright, base);
    const { flashcardId, classId } = await createDeck(owner, member.userId, base);
    const other = await addDeck(owner, base, classId, "Other");
    await gradeAll(owner.userId, flashcardId);
    await gradeAll(owner.userId, other.flashcardId);

    const res = await owner.request.post(`${base}/api/flashcards/${flashcardId}/reset`);
    expect(res.status()).toBe(200);

    const untouched = await prisma.schedulingRecord.findMany({
      where: { userId: owner.userId, card: { flashcardId: other.flashcardId } },
    });
    expect(untouched).toHaveLength(4);
    for (const r of untouched) {
      expect(r.repetitions).toBe(3);
      expect(r.firstGradedAt).not.toBeNull();
    }
  });

  test("nothing graded: reset is a no-op, and a repeat reset is safe", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const member = await newUser(playwright, base);
    const { flashcardId } = await createDeck(owner, member.userId, base);
    const get = async () =>
      (await (await owner.request.get(`${base}/api/flashcards/${flashcardId}`)).json()).data;
    expect((await get()).hasProgress).toBe(false);

    for (let i = 0; i < 2; i++) {
      const res = await owner.request.post(`${base}/api/flashcards/${flashcardId}/reset`);
      expect(res.status()).toBe(200);
    }
    const rows = await prisma.schedulingRecord.findMany({
      where: { userId: owner.userId, card: { flashcardId } },
    });
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r).toMatchObject({ interval: 0, repetitions: 0, easeFactor: 2.5, firstGradedAt: null });
    }

    // Graded, reset, graded again, reset again: back to new each time.
    await gradeAll(owner.userId, flashcardId);
    expect((await get()).hasProgress).toBe(true);
    await owner.request.post(`${base}/api/flashcards/${flashcardId}/reset`);
    expect((await get()).hasProgress).toBe(false);
    expect((await get()).learn.newCards).toBe(2);
  });

  test("nextReviewDate is the start of today in the user's timezone", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const zone = "Pacific/Kiritimati";
    const owner = await newUser(playwright, base, zone);
    const member = await newUser(playwright, base);
    const { flashcardId } = await createDeck(owner, member.userId, base);
    await gradeAll(owner.userId, flashcardId);

    const before = toLocalCalendarDay(new Date(), zone).getTime();
    await owner.request.post(`${base}/api/flashcards/${flashcardId}/reset`);
    const after = toLocalCalendarDay(new Date(), zone).getTime();

    const rows = await prisma.schedulingRecord.findMany({
      where: { userId: owner.userId, card: { flashcardId } },
    });
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      const t = r.nextReviewDate.getTime();
      // Equal to local midnight (allowing for a midnight crossing mid-test).
      expect([before, after]).toContain(t);
    }
    // And it differs from the UTC midnight, so the zone is really applied.
    expect(before).not.toBe(toLocalCalendarDay(new Date(), "UTC").getTime());
  });
});
