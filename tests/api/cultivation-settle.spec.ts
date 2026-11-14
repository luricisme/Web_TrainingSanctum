import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";
import { buildDaySnapshot, levelForXp, localDayStart, toLocalDate } from "@training-sanctum/domain";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";
const DAY = 86_400_000;

interface Ctx {
  request: APIRequestContext;
  userId: string;
  base: string;
}

async function newUser(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  baseURL: string | undefined,
  timezone = "UTC"
): Promise<Ctx> {
  const base = baseURL ?? FALLBACK_BASE;
  const request = await playwright.request.newContext();
  const email = `settle-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Settle Test", timezone },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id, base };
}

/** The UTC-midnight local date `n` days before today (UTC user). */
const daysAgo = (n: number) => new Date(toLocalDate(new Date(), "UTC").getTime() - n * DAY);

/** Puts the user mid-history: `xp`, settled through `n` days ago (null: never settled). */
async function setState(userId: string, xp: number, settledDaysAgo: number | null) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      cultivationXp: xp,
      cultivationSettledThrough: settledDaysAgo === null ? null : daysAgo(settledDaysAgo),
    },
  });
}

const get = async (c: Ctx) => (await c.request.get(`${c.base}/api/cultivation`)).json();
const dbUser = (userId: string) => prisma.user.findUniqueOrThrow({ where: { id: userId } });
const penalties = (userId: string) =>
  prisma.xpEvent.findMany({ where: { userId, reason: "PENALTY" }, orderBy: { localDay: "asc" } });

async function seedStored(userId: string, n: number, mutate?: (s: ReturnType<typeof buildDaySnapshot>) => void) {
  const snapshot = buildDaySnapshot(1, { flashcardsWithUnlearned: 5, dueCount: 5 });
  mutate?.(snapshot);
  await prisma.cultivationDay.create({
    data: { userId, localDay: daysAgo(n), quests: snapshot as never },
  });
}

/** Work that existed long ago: an unlearned Card and a due learned Card. */
async function seedOldWork(userId: string, extraCards = 0) {
  const cls = await prisma.class.create({
    data: {
      color: "SKY",
      name: `Class ${randomUUID().slice(0, 6)}`,
      userId,
      folders: { create: [{ name: "Unsorted", isUnsorted: true, userId }] },
    },
    include: { folders: true },
  });
  const folderId = cls.folders[0]!.id;
  const old = new Date(Date.now() - 400 * DAY);
  const flashcard = await prisma.flashcard.create({ data: { name: "Old", folderId, userId } });
  const dirs = ["TERM_TO_DEFINITION", "DEFINITION_TO_TERM"] as const;
  await prisma.card.create({
    data: {
      term: "unlearned",
      definition: "d",
      flashcardId: flashcard.id,
      userId,
      schedulingRecords: {
        create: dirs.map((direction) => ({ direction, nextReviewDate: old, createdAt: old })),
      },
    },
  });
  for (let i = 0; i < 1 + extraCards; i++) {
    await prisma.card.create({
      data: {
        term: `due ${i}`,
        definition: "d",
        flashcardId: flashcard.id,
        userId,
        schedulingRecords: {
          create: dirs.map((direction) => ({
            direction,
            createdAt: old,
            firstGradedAt: old,
            nextReviewDate: new Date(old.getTime() + DAY),
          })),
        },
      },
    });
  }
  return { flashcardId: flashcard.id };
}


/** One Flashcard with one Card whose two records carry the given timestamps. */
async function seedRecords(
  userId: string,
  folderId: string,
  stamps: { createdAt: Date; firstGradedAt: Date | null; nextReviewDate: Date }
) {
  const flashcard = await prisma.flashcard.create({ data: { name: `Edge ${randomUUID().slice(0, 8)}`, folderId, userId } });
  await prisma.card.create({
    data: {
      term: "t",
      definition: "d",
      flashcardId: flashcard.id,
      userId,
      schedulingRecords: {
        create: (["TERM_TO_DEFINITION", "DEFINITION_TO_TERM"] as const).map((direction) => ({
          direction,
          ...stamps,
        })),
      },
    },
  });
}

// spec-5-7: day settlement and penalties (FR-19, AD-15).
test.describe("day settlement", () => {
  test("first run sets the through-date to yesterday with no penalty and no notice", async ({
    playwright,
    baseURL,
  }) => {
    const c = await newUser(playwright, baseURL);
    const body = await get(c);
    expect(body.data.notices).toEqual([]);
    const user = await dbUser(c.userId);
    expect(user.cultivationSettledThrough).toEqual(daysAgo(1));
    expect(user.cultivationXp).toBe(0);
    expect(await penalties(c.userId)).toHaveLength(0);
  });

  test("a missed day charges both quests once, however often it is loaded", async ({
    playwright,
    baseURL,
  }) => {
    const c = await newUser(playwright, baseURL);
    await setState(c.userId, 100, 2);
    await seedStored(c.userId, 1);

    const first = await get(c);
    expect(first.data.xp).toBe(60);
    expect(first.data.notices).toEqual([
      expect.objectContaining({
        fromDay: daysAgo(1).toISOString().slice(0, 10),
        toDay: daysAgo(1).toISOString().slice(0, 10),
        missed: 2,
        xpLost: 40,
      }),
    ]);
    const events = await penalties(c.userId);
    expect(events.map((e) => [e.questKind, e.delta])).toEqual([
      ["LEARN_FLASHCARDS", -20],
      ["CLEAR_REVIEW", -20],
    ]);
    expect((await dbUser(c.userId)).cultivationSettledThrough).toEqual(daysAgo(1));

    const second = await get(c);
    expect(second.data.xp).toBe(60);
    expect(second.data.notices).toHaveLength(1);
    expect(await penalties(c.userId)).toHaveLength(2);
  });

  test("concurrent requests penalise each day once", async ({ playwright, baseURL }) => {
    const c = await newUser(playwright, baseURL);
    await setState(c.userId, 100, 2);
    await seedStored(c.userId, 1);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => c.request.get(`${c.base}/api/cultivation`))
    );
    for (const res of results) expect(res.status()).toBe(200);
    expect(await penalties(c.userId)).toHaveLength(2);
    expect((await dbUser(c.userId)).cultivationXp).toBe(60);
    for (const res of results) expect((await res.json()).data.xp).toBe(60);
  });

  test("a claimed or skipped quest costs nothing", async ({ playwright, baseURL }) => {
    const c = await newUser(playwright, baseURL);
    await setState(c.userId, 100, 3);
    await seedStored(c.userId, 2, (s) => {
      s.LEARN_FLASHCARDS.claimed = true;
    });
    await seedStored(c.userId, 1, (s) => {
      s.CLEAR_REVIEW.skipped = true;
      s.LEARN_FLASHCARDS.skipped = true;
    });
    const body = await get(c);
    expect(body.data.xp).toBe(80);
    const events = await penalties(c.userId);
    expect(events.map((e) => e.questKind)).toEqual(["CLEAR_REVIEW"]);
    expect(body.data.notices[0]).toMatchObject({ missed: 1, xpLost: 20 });
  });

  test("a run that charged nothing makes no notice", async ({ playwright, baseURL }) => {
    const c = await newUser(playwright, baseURL);
    await setState(c.userId, 100, 2);
    await seedStored(c.userId, 1, (s) => {
      s.LEARN_FLASHCARDS.skipped = true;
      s.CLEAR_REVIEW.claimed = true;
    });
    const body = await get(c);
    expect(body.data.xp).toBe(100);
    expect(body.data.notices).toEqual([]);
    expect((await dbUser(c.userId)).cultivationSettledThrough).toEqual(daysAgo(1));
  });

  test("a never-opened day is rebuilt from the data and penalised; an empty account is not", async ({
    playwright,
    baseURL,
  }) => {
    const empty = await newUser(playwright, baseURL);
    await setState(empty.userId, 50, 3);
    expect((await get(empty)).data.xp).toBe(50);

    const c = await newUser(playwright, baseURL);
    await seedOldWork(c.userId);
    await setState(c.userId, 1_000, 3);
    const body = await get(c);
    // Two never-opened days (2 and 1 days ago), two quests each: four events.
    expect(body.data.xp).toBe(1_000 - 2 * 40);
    expect(body.data.notices[0]).toMatchObject({ missed: 4, xpLost: 80 });
  });

  test("30 absent days settle in order and the shrinking Bộ sizes later days", async ({
    playwright,
    baseURL,
  }) => {
    const c = await newUser(playwright, baseURL);
    await seedOldWork(c.userId);
    // 9,275 XP is the first stage of Nhị Bộ (20 XP quests); one day drops it to Nhất Bộ.
    await setState(c.userId, 9_275, 30);
    const body = await get(c);
    const expected = 9_275 - 80 - 28 * 40;
    expect(body.data.xp).toBe(expected);
    expect(body.data.bo).toBe(levelForXp(expected).bo);
    expect(body.data.bo).toBe(1);
    const events = await penalties(c.userId);
    expect(events).toHaveLength(58);
    expect(events[0]!.delta).toBe(-40);
    expect(events[2]!.delta).toBe(-20);
    expect(body.data.notices).toHaveLength(1);
    expect(body.data.notices[0]).toMatchObject({ missed: 58 });
  });

  test("the floor keeps XP at 0 while the event records the full charge", async ({
    playwright,
    baseURL,
  }) => {
    const c = await newUser(playwright, baseURL);
    await setState(c.userId, 5, 2);
    await seedStored(c.userId, 1);
    const body = await get(c);
    expect(body.data.xp).toBe(0);
    expect((await dbUser(c.userId)).cultivationXp).toBe(0);
    expect((await penalties(c.userId)).map((e) => e.delta)).toEqual([-20, -20]);
  });

  test("a 365-day gap settles well inside the transaction timeout", async ({
    playwright,
    baseURL,
  }) => {
    const c = await newUser(playwright, baseURL);
    await seedOldWork(c.userId, 40);
    await setState(c.userId, 60_000, 365);
    const started = Date.now();
    const body = await get(c);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(body.data.xp).toBeLessThan(60_000);
    expect((await dbUser(c.userId)).cultivationSettledThrough).toEqual(daysAgo(1));
    expect(body.data.notices).toHaveLength(1);
  });

  test("a claim settles first, then sizes today and the claim by the new realm", async ({
    playwright,
    baseURL,
  }) => {
    const c = await newUser(playwright, baseURL);
    const { flashcardId } = await seedOldWork(c.userId);
    await setState(c.userId, 9_275, 3);

    const early = await c.request.post(`${c.base}/api/cultivation/quests/learn-flashcards/claim`);
    expect(early.status()).toBe(409);
    // Settlement committed even though the claim failed: two days, -80 then -40.
    expect((await dbUser(c.userId)).cultivationXp).toBe(9_275 - 80 - 40);
    const day = await prisma.cultivationDay.findFirstOrThrow({
      where: { userId: c.userId, localDay: daysAgo(0) },
    });
    expect((day.quests as { LEARN_FLASHCARDS: { xp: number } }).LEARN_FLASHCARDS.xp).toBe(10);

    await prisma.schedulingRecord.updateMany({
      where: { card: { flashcardId, term: "unlearned" } },
      data: { firstGradedAt: new Date(), nextReviewDate: new Date(Date.now() + DAY) },
    });
    const claim = await c.request.post(`${c.base}/api/cultivation/quests/learn-flashcards/claim`);
    expect(claim.status()).toBe(200);
    const data = (await claim.json()).data;
    expect(data.xpAwarded).toBe(10);
    expect(data.realm.xp).toBe(9_275 - 80 - 40 + 10);
  });
  test("start-of-day boundaries decide which never-opened days are skipped", async ({
    playwright,
    baseURL,
  }) => {
    const c = await newUser(playwright, baseURL);
    const cls = await prisma.class.create({
      data: {
        color: "SKY",
        name: `Class ${randomUUID().slice(0, 6)}`,
        userId: c.userId,
        folders: { create: [{ name: "Unsorted", isUnsorted: true, userId: c.userId }] },
      },
      include: { folders: true },
    });
    const folderId = cls.folders[0]!.id;
    const old = new Date(Date.now() - 400 * DAY);
    const s1 = localDayStart(daysAgo(1), "UTC");
    const hour = 3_600_000;
    // X: first graded just before yesterday began, so it was still unlearned
    // two days ago and learned (not due) yesterday.
    await seedRecords(c.userId, folderId, {
      createdAt: old,
      firstGradedAt: new Date(s1.getTime() - hour),
      nextReviewDate: new Date(s1.getTime() + 5 * DAY),
    });
    // Z: learned long ago and due exactly at yesterday's start: due yesterday only.
    await seedRecords(c.userId, folderId, { createdAt: old, firstGradedAt: old, nextReviewDate: s1 });
    // Y: created exactly at yesterday's start: not there yet for either day.
    await seedRecords(c.userId, folderId, {
      createdAt: s1,
      firstGradedAt: null,
      nextReviewDate: s1,
    });
    // T: created today: never makes an older day non-skipped.
    await seedRecords(c.userId, folderId, {
      createdAt: new Date(),
      firstGradedAt: null,
      nextReviewDate: new Date(),
    });
    await setState(c.userId, 100, 3);

    const body = await get(c);
    const events = await penalties(c.userId);
    expect(
      events.map((e) => [e.localDay.toISOString().slice(0, 10), e.questKind, e.delta])
    ).toEqual([
      [daysAgo(2).toISOString().slice(0, 10), "LEARN_FLASHCARDS", -20],
      [daysAgo(1).toISOString().slice(0, 10), "CLEAR_REVIEW", -20],
    ]);
    expect(body.data.xp).toBe(60);
  });

  test("a gap spanning a DST day settles every local day once in America/New_York", async ({
    playwright,
    baseURL,
  }) => {
    const tz = "America/New_York";
    const c = await newUser(playwright, baseURL, tz);
    await seedOldWork(c.userId);
    await prisma.user.update({
      where: { id: c.userId },
      data: { cultivationXp: 100_000, cultivationSettledThrough: new Date(Date.UTC(2026, 2, 6)) },
    });
    const body = await get(c);
    expect(body.data.xp).toBeLessThan(100_000);

    const yesterday = new Date(toLocalDate(new Date(), tz).getTime() - DAY);
    expect((await dbUser(c.userId)).cultivationSettledThrough).toEqual(yesterday);

    const perDay = new Map<string, number>();
    for (const e of await penalties(c.userId)) {
      const key = e.localDay.toISOString().slice(0, 10);
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    const expected: string[] = [];
    for (let t = Date.UTC(2026, 2, 7); t <= yesterday.getTime(); t += DAY) {
      expected.push(new Date(t).toISOString().slice(0, 10));
    }
    expect(expected).toContain("2026-03-08");
    expect([...perDay.keys()].sort()).toEqual(expected);
    for (const key of expected) expect(perDay.get(key)).toBe(2);
  });
});
