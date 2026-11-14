import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";
import { toLocalCalendarDay, type StatsResponse } from "@training-sanctum/domain";

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
  const email = `stats-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Stats Test", timezone },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id, base };
}

const stats = async (c: Ctx): Promise<StatsResponse> =>
  (await (await c.request.get(`${c.base}/api/stats`)).json()).data;

type Dir = "TERM_TO_DEFINITION" | "DEFINITION_TO_TERM";
/** A record state: `null` is unlearned, a number is a learned record with that interval. */
type RecordSpec = [Dir, number | null];

async function seedCards(userId: string, cards: RecordSpec[][]) {
  const cls = await prisma.class.create({
    data: {
      color: "SKY",
      name: `Class ${randomUUID().slice(0, 6)}`,
      userId,
      folders: { create: [{ name: "Unsorted", isUnsorted: true, userId }] },
    },
    include: { folders: true },
  });
  const flashcard = await prisma.flashcard.create({
    data: { name: "Words", folderId: cls.folders[0]!.id, userId },
  });
  let n = 0;
  for (const records of cards) {
    n += 1;
    await prisma.card.create({
      data: {
        term: `term ${n}`,
        definition: `definition ${n}`,
        flashcardId: flashcard.id,
        userId,
        schedulingRecords: {
          create: records.map(([direction, interval]) => ({
            direction,
            nextReviewDate: new Date(),
            interval: interval ?? 0,
            firstGradedAt: interval === null ? null : new Date(Date.now() - DAY),
          })),
        },
      },
    });
  }
}

const T: Dir = "TERM_TO_DEFINITION";
const D: Dir = "DEFINITION_TO_TERM";
const counts = (d: StatsResponse["distribution"][number]) =>
  Object.fromEntries(d.buckets.map((b) => [b.key, b.count]));

// spec-5-4: GET /api/stats (FR-15, AD-14, AD-15).
test.describe("/api/stats", () => {
  test("unauthenticated requests return 401", async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext();
    const res = await ctx.get(`${baseURL ?? FALLBACK_BASE}/api/stats`);
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("a new user has zero totals, an empty distribution and a flat XP line", async ({
    playwright,
    baseURL,
  }) => {
    const data = await stats(await newUser(playwright, baseURL));
    expect(data.cards).toEqual({ total: 0, learned: 0, unlearned: 0 });
    expect(data.distribution.map((d) => d.direction)).toEqual([T, D]);
    for (const d of data.distribution) {
      expect(d.total).toBe(0);
      expect(d.buckets.map((b) => b.key)).toEqual(["new", "d1", "d2to6", "d7to20", "d21to59", "d60plus"]);
    }
    expect(data.xpHistory).toHaveLength(30);
    expect(data.xpHistory.every((p) => p.xp === 0)).toBe(true);
  });

  test("mixed cards: learned and unlearned follow AD-14, buckets follow the intervals", async ({
    playwright,
    baseURL,
  }) => {
    const c = await newUser(playwright, baseURL);
    await seedCards(c.userId, [
      [[T, 1], [D, 3]], // learned
      [[T, 8], [D, 25]], // learned
      [[T, 60], [D, 400]], // learned
      [[T, 2], [D, null]], // unlearned (one direction ungraded)
      [[T, null], [D, null]], // unlearned
    ]);
    const data = await stats(c);
    expect(data.cards).toEqual({ total: 5, learned: 3, unlearned: 2 });
    const [t, d] = data.distribution;
    expect(counts(t!)).toEqual({ new: 1, d1: 1, d2to6: 1, d7to20: 1, d21to59: 0, d60plus: 1 });
    expect(t!.total).toBe(5);
    expect(counts(d!)).toEqual({ new: 2, d1: 0, d2to6: 1, d7to20: 0, d21to59: 1, d60plus: 1 });
    expect(d!.total).toBe(5);
  });

  test("one studied direction gives one chart and totals over that direction only", async ({
    playwright,
    baseURL,
  }) => {
    const c = await newUser(playwright, baseURL);
    await seedCards(c.userId, [
      [[T, 5], [D, null]], // learned when only Term -> Definition is studied
      [[T, null], [D, 5]],
    ]);
    const both = await stats(c);
    expect(both.cards).toEqual({ total: 2, learned: 0, unlearned: 2 });

    const patch = await c.request.patch(`${c.base}/api/settings`, {
      headers: { Origin: c.base },
      data: { studyDirections: "TERM_TO_DEFINITION" },
    });
    expect(patch.ok()).toBeTruthy();
    const one = await stats(c);
    expect(one.cards).toEqual({ total: 2, learned: 1, unlearned: 1 });
    expect(one.distribution).toHaveLength(1);
    expect(one.distribution[0]!.direction).toBe(T);
    expect(counts(one.distribution[0]!)).toMatchObject({ new: 1, d2to6: 1 });
  });

  test("never counts another user's cards or XP", async ({ playwright, baseURL }) => {
    const a = await newUser(playwright, baseURL);
    const b = await newUser(playwright, baseURL);
    await seedCards(a.userId, [[[T, 5], [D, 5]]]);
    await prisma.xpEvent.create({
      data: { userId: a.userId, localDay: new Date(), questKind: "CLEAR_REVIEW", delta: 10, reason: "CLAIM" },
    });
    const data = await stats(b);
    expect(data.cards.total).toBe(0);
    expect(data.distribution.every((d) => d.total === 0)).toBe(true);
    expect(data.xpHistory.at(-1)!.xp).toBe(0);
  });

  test("XP history replays the ledger with the floor, repeats quiet days and ends at current XP", async ({
    playwright,
    baseURL,
  }) => {
    const c = await newUser(playwright, baseURL);
    const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY);
    const event = (daysAgo: number, delta: number, reason: "CLAIM" | "PENALTY") => ({
      userId: c.userId,
      localDay: at(daysAgo),
      questKind: "CLEAR_REVIEW" as const,
      delta,
      reason,
      createdAt: at(daysAgo),
    });
    // +10, +10 (20), then a -40 penalty that floors at 0, then +10 on the last day.
    await prisma.xpEvent.createMany({
      data: [event(10, 10, "CLAIM"), event(9, 10, "CLAIM"), event(5, -40, "PENALTY"), event(0, 10, "CLAIM")],
    });
    await prisma.user.update({ where: { id: c.userId }, data: { cultivationXp: 10 } });

    const { xpHistory } = await stats(c);
    expect(xpHistory).toHaveLength(30);
    const xp = xpHistory.map((p) => p.xp);
    expect(xp.slice(0, 19)).toEqual(Array(19).fill(0)); // before the first event
    expect(xp.slice(19, 24)).toEqual([10, 20, 20, 20, 20]); // days 10 and 9 ago, then quiet days
    expect(xp.slice(24, 29)).toEqual([0, 0, 0, 0, 0]); // floored penalty, quiet days
    expect(xp[29]).toBe(10); // ends at current XP
    expect(xpHistory[29]!.localDay).toBe(new Date().toISOString().slice(0, 10));
  });

  test("XP history buckets days in the user's timezone (AD-8)", async ({ playwright, baseURL }) => {
    const tz = "Asia/Ho_Chi_Minh"; // UTC+7, no DST
    const c = await newUser(playwright, baseURL, tz);
    const localStart = toLocalCalendarDay(new Date(), tz);
    const event = (createdAt: Date, delta: number) => ({
      userId: c.userId,
      localDay: createdAt,
      questKind: "CLEAR_REVIEW" as const,
      delta,
      reason: "CLAIM" as const,
      createdAt,
    });
    // One second before and exactly at local midnight: the same UTC day, two local days.
    await prisma.xpEvent.createMany({
      data: [event(new Date(localStart.getTime() - 1000), 10), event(localStart, 20)],
    });

    const { xpHistory } = await stats(c);
    expect(xpHistory[28]!.xp).toBe(10);
    expect(xpHistory[29]!.xp).toBe(30);
    expect(xpHistory[29]!.localDay).toBe(
      new Date(localStart.getTime() + 7 * 3_600_000).toISOString().slice(0, 10)
    );
  });
});
