import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";
import { toLocalCalendarDay, toLocalDate } from "@training-sanctum/domain";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";

interface Ctx {
  request: APIRequestContext;
  userId: string;
  base: string;
}

async function newUser(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  baseURL: string | undefined,
  xp = 0
): Promise<Ctx> {
  const base = baseURL ?? FALLBACK_BASE;
  const request = await playwright.request.newContext();
  const email = `quests-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Quest Test", timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  if (xp > 0) await prisma.user.update({ where: { id: user.id }, data: { cultivationXp: xp } });
  return { request, userId: user.id, base };
}

async function newFolder(userId: string) {
  const cls = await prisma.class.create({
    data: {
      color: "SKY",
      name: `Class ${randomUUID().slice(0, 6)}`,
      userId,
      folders: { create: [{ name: "Unsorted", isUnsorted: true, userId }] },
    },
    include: { folders: true },
  });
  return cls.folders[0]!;
}

/** A Flashcard with `cards` Cards, each with both records ungraded. */
async function seedUnlearned(userId: string, cards = 1) {
  const folder = await newFolder(userId);
  const flashcard = await prisma.flashcard.create({
    data: { name: "Weather idioms", folderId: folder.id, userId },
  });
  const records: string[] = [];
  for (let i = 0; i < cards; i++) {
    const card = await prisma.card.create({
      data: {
        term: `term ${i}`,
        definition: `definition ${i}`,
        flashcardId: flashcard.id,
        userId,
        schedulingRecords: {
          create: [
            { direction: "TERM_TO_DEFINITION", nextReviewDate: new Date() },
            { direction: "DEFINITION_TO_TERM", nextReviewDate: new Date() },
          ],
        },
      },
      include: { schedulingRecords: true },
    });
    records.push(...card.schedulingRecords.map((r) => r.id));
  }
  return { flashcard, records };
}

/** Marks records as graded now (learned today), due in a day. */
async function gradeNow(recordIds: string[]) {
  await prisma.schedulingRecord.updateMany({
    where: { id: { in: recordIds } },
    data: { firstGradedAt: new Date(), nextReviewDate: new Date(Date.now() + 86_400_000) },
  });
}

/** One learned Card that is due now, first graded and last touched `daysAgo` days ago. */
async function seedDue(userId: string, daysAgo = 3) {
  const folder = await newFolder(userId);
  const flashcard = await prisma.flashcard.create({
    data: { name: "Due", folderId: folder.id, userId },
  });
  const then = new Date(Date.now() - daysAgo * 86_400_000);
  const due = new Date(Date.now() - 60_000);
  const card = await prisma.card.create({
    data: {
      term: "due",
      definition: "due",
      flashcardId: flashcard.id,
      userId,
      schedulingRecords: {
        create: [
          {
            direction: "TERM_TO_DEFINITION",
            nextReviewDate: due,
            firstGradedAt: then,
            updatedAt: then,
          },
          {
            direction: "DEFINITION_TO_TERM",
            nextReviewDate: due,
            firstGradedAt: then,
            updatedAt: then,
          },
        ],
      },
    },
    include: { schedulingRecords: true },
  });
  return card.schedulingRecords.map((r) => r.id);
}

interface QuestData {
  xp: number;
  label: string;
  quests: Array<{
    kind: string;
    status: string;
    target: number | null;
    progress: number;
    dueLeft: number | null;
    xp: number;
  }>;
}

async function get(ctx: Ctx): Promise<QuestData> {
  const res = await ctx.request.get(`${ctx.base}/api/cultivation`);
  expect(res.status()).toBe(200);
  return (await res.json()).data as QuestData;
}

const claim = (ctx: Ctx, slug: string) =>
  ctx.request.post(`${ctx.base}/api/cultivation/quests/${slug}/claim`);

// spec-5-6: daily quests and the claim route (FR-19, AD-15).
test.describe("daily quests", () => {
  test("claim requires a session and a known quest", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext();
    const res = await anon.post(
      `${baseURL ?? FALLBACK_BASE}/api/cultivation/quests/clear-review/claim`
    );
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");

    const ctx = await newUser(playwright, baseURL);
    const bad = await claim(ctx, "nope");
    expect(bad.status()).toBe(404);
    expect((await bad.json()).error.code).toBe("NOT_FOUND");
  });

  test("with no work, both quests are skipped and cannot be claimed", async ({
    playwright,
    baseURL,
  }) => {
    const ctx = await newUser(playwright, baseURL);
    const data = await get(ctx);
    expect(data.quests.map((q) => q.status)).toEqual(["skipped", "skipped"]);
    for (const slug of ["learn-flashcards", "clear-review"]) {
      const res = await claim(ctx, slug);
      expect(res.status()).toBe(409);
      expect((await res.json()).error.code).toBe("QUEST_SKIPPED");
    }
  });

  test("learn unmet is locked with progress, and a claim is refused", async ({
    playwright,
    baseURL,
  }) => {
    const ctx = await newUser(playwright, baseURL);
    await seedUnlearned(ctx.userId);
    const data = await get(ctx);
    expect(data.quests[0]).toMatchObject({ status: "locked", target: 1, progress: 0, xp: 10 });
    expect(data.quests[1]!.status).toBe("skipped");
    const res = await claim(ctx, "learn-flashcards");
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe("QUEST_NOT_MET");
    expect((await get(ctx)).xp).toBe(0);
  });

  test("a partly learned Flashcard does not count", async ({ playwright, baseURL }) => {
    const ctx = await newUser(playwright, baseURL);
    const { records } = await seedUnlearned(ctx.userId, 2);
    await get(ctx);
    await gradeNow(records.slice(0, 2)); // first Card only
    expect((await get(ctx)).quests[0]).toMatchObject({ status: "locked", progress: 0 });
  });

  test("learn met: claim awards once, a second claim is refused", async ({
    playwright,
    baseURL,
  }) => {
    const ctx = await newUser(playwright, baseURL);
    const { records } = await seedUnlearned(ctx.userId);
    await get(ctx);
    await gradeNow(records);
    expect((await get(ctx)).quests[0]!.status).toBe("ready");

    const res = await claim(ctx, "learn-flashcards");
    expect(res.status()).toBe(200);
    const body = (await res.json()).data;
    expect(body).toMatchObject({ kind: "LEARN_FLASHCARDS", xpAwarded: 10, breakthrough: true });
    expect(body.realm.label).toBe("Ngưng Khí · Tầng 2");

    const after = await get(ctx);
    expect(after.xp).toBe(10);
    expect(after.quests[0]!.status).toBe("claimed");

    const again = await claim(ctx, "learn-flashcards");
    expect(again.status()).toBe(409);
    expect((await again.json()).error.code).toBe("QUEST_ALREADY_CLAIMED");
    expect((await get(ctx)).xp).toBe(10);
    expect(await prisma.xpEvent.count({ where: { userId: ctx.userId } })).toBe(1);
  });

  test("concurrent claims award once", async ({ playwright, baseURL }) => {
    const ctx = await newUser(playwright, baseURL);
    const { records } = await seedUnlearned(ctx.userId);
    await get(ctx);
    await gradeNow(records);
    const results = await Promise.all([1, 2, 3, 4].map(() => claim(ctx, "learn-flashcards")));
    expect(results.map((r) => r.status()).sort()).toEqual([200, 409, 409, 409]);
    expect((await get(ctx)).xp).toBe(10);
    expect(await prisma.xpEvent.count({ where: { userId: ctx.userId } })).toBe(1);
  });

  test("a claim inside a stage is not a breakthrough", async ({ playwright, baseURL }) => {
    const ctx = await newUser(playwright, baseURL, 12); // Tầng 2 spans 10 to 25
    const { records } = await seedUnlearned(ctx.userId);
    await get(ctx);
    await gradeNow(records);
    const res = await claim(ctx, "learn-flashcards");
    expect((await res.json()).data).toMatchObject({ xpAwarded: 10, breakthrough: false });
  });

  test("clear review: locked while due, ready once the queue is empty", async ({
    playwright,
    baseURL,
  }) => {
    const ctx = await newUser(playwright, baseURL);
    const ids = await seedDue(ctx.userId);
    const data = await get(ctx);
    expect(data.quests[1]).toMatchObject({ status: "locked", dueLeft: 2 });
    const refused = await claim(ctx, "clear-review");
    expect(refused.status()).toBe(409);
    expect((await refused.json()).error.code).toBe("QUEST_NOT_MET");

    // Graded today: updatedAt moves and the next review leaves the queue.
    await prisma.schedulingRecord.updateMany({
      where: { id: { in: ids } },
      data: { nextReviewDate: new Date(Date.now() + 86_400_000), updatedAt: new Date() },
    });
    expect((await get(ctx)).quests[1]!.status).toBe("ready");
    const res = await claim(ctx, "clear-review");
    expect(res.status()).toBe(200);
    expect((await get(ctx)).xp).toBe(10);
  });

  test("clear review stays locked when nothing was reviewed today", async ({
    playwright,
    baseURL,
  }) => {
    const ctx = await newUser(playwright, baseURL);
    const ids = await seedDue(ctx.userId);
    await get(ctx);
    await prisma.schedulingRecord.updateMany({
      where: { id: { in: ids } },
      data: { nextReviewDate: new Date(Date.now() + 86_400_000) },
    });
    // Prisma stamps updatedAt on update, so rewind it to two days ago.
    await prisma.$executeRaw`UPDATE "scheduling_records" SET "updatedAt" = now() - interval '2 days' WHERE id = ANY(${ids})`;
    const data = await get(ctx);
    expect(data.quests[1]).toMatchObject({ status: "locked", dueLeft: 0 });
  });

  test("a realm change mid-day leaves today's targets and XP unchanged", async ({
    playwright,
    baseURL,
  }) => {
    const ctx = await newUser(playwright, baseURL);
    await seedUnlearned(ctx.userId, 5);
    expect((await get(ctx)).quests[0]).toMatchObject({ target: 1, xp: 10 });
    await prisma.user.update({ where: { id: ctx.userId }, data: { cultivationXp: 9_275 } });
    const data = await get(ctx);
    expect(data.label).toBe("Khuy Niết · Sơ kỳ");
    expect(data.quests[0]).toMatchObject({ target: 1, xp: 10 });
  });

  test("targets are sized by Bộ and capped by the Flashcards available", async ({
    playwright,
    baseURL,
  }) => {
    const ctx = await newUser(playwright, baseURL, 26_075); // Tam Bộ: 3 / 40
    await seedUnlearned(ctx.userId);
    await seedUnlearned(ctx.userId);
    expect((await get(ctx)).quests[0]).toMatchObject({ target: 2, xp: 40 });
  });

  test("the snapshot is created once per local day", async ({ playwright, baseURL }) => {
    const ctx = await newUser(playwright, baseURL);
    await Promise.all([get(ctx), get(ctx), get(ctx)]);
    expect(await prisma.cultivationDay.count({ where: { userId: ctx.userId } })).toBe(1);
  });

  test("the local day follows User.timezone, not UTC (AD-8)", async ({ playwright, baseURL }) => {
    const tz = "Asia/Ho_Chi_Minh";
    const ctx = await newUser(playwright, baseURL, 26_075); // Tam Bộ: target 3
    await prisma.user.update({ where: { id: ctx.userId }, data: { timezone: tz } });
    const a = await seedUnlearned(ctx.userId);
    const b = await seedUnlearned(ctx.userId);
    await seedUnlearned(ctx.userId);
    expect((await get(ctx)).quests[0]).toMatchObject({ target: 3, progress: 0 });

    const dayStart = toLocalCalendarDay(new Date(), tz).getTime();
    await prisma.schedulingRecord.updateMany({
      where: { id: { in: a.records } },
      data: { firstGradedAt: new Date(dayStart - 60_000) },
    });
    await prisma.schedulingRecord.updateMany({
      where: { id: { in: b.records } },
      data: { firstGradedAt: new Date(dayStart + 1_000) },
    });
    expect((await get(ctx)).quests[0]).toMatchObject({ status: "locked", progress: 1 });

    const day = await prisma.cultivationDay.findFirstOrThrow({ where: { userId: ctx.userId } });
    expect(day.localDay.toISOString()).toBe(toLocalDate(new Date(), tz).toISOString());
  });

  test("grading through the real grade route unlocks both quests", async ({
    playwright,
    baseURL,
  }) => {
    const ctx = await newUser(playwright, baseURL);
    const due = await seedDue(ctx.userId);
    const fresh = await seedUnlearned(ctx.userId);
    const data = await get(ctx);
    expect(data.quests.map((q) => q.status)).toEqual(["locked", "locked"]);

    for (const id of [...due, ...fresh.records]) {
      const res = await ctx.request.post(`${ctx.base}/api/review/grade`, {
        data: { schedulingRecordId: id, grade: "good" },
      });
      expect(res.status()).toBe(200);
    }
    expect((await get(ctx)).quests.map((q) => q.status)).toEqual(["ready", "ready"]);
  });
});
