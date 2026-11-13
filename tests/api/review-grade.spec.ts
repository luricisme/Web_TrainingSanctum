import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";
const DAY_MS = 86_400_000;

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
  const email = `grade-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Grade Test", timezone },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id };
}

/** Creates one Card (with its two Scheduling Records) and returns the records. */
async function createCard(s: Session, base: string) {
  const cls = await s.request.post(`${base}/api/classes`, { data: { name: "C" } });
  const classId = (await cls.json()).data.id as string;
  const folder = await s.request.post(`${base}/api/classes/${classId}/folders`, {
    data: { name: "F" },
  });
  const folderId = (await folder.json()).data.id as string;
  const fc = await s.request.post(`${base}/api/folders/${folderId}/flashcards`, {
    data: { name: "W" },
  });
  const flashcardId = (await fc.json()).data.id as string;
  const batch = await s.request.post(`${base}/api/cards/batch`, {
    data: { flashcardId, cards: [{ term: "collate", definition: "gather" }] },
  });
  expect(batch.status()).toBe(201);
  const card = await prisma.card.findFirstOrThrow({
    where: { flashcardId },
    include: { schedulingRecords: true },
  });
  const byDirection = (d: string) => card.schedulingRecords.find((r) => r.direction === d)!;
  return {
    cardId: card.id,
    forward: byDirection("TERM_TO_DEFINITION"),
    backward: byDirection("DEFINITION_TO_TERM"),
  };
}

function grade(s: Session, base: string, schedulingRecordId: string, g: string) {
  return s.request.post(`${base}/api/review/grade`, {
    data: { schedulingRecordId, grade: g },
  });
}

// spec-4-2: Grade a Card & persist the scheduling update.
test.describe("POST /api/review/grade", () => {
  test("unauthenticated requests return 401", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const ctx = await playwright.request.newContext();
    const res = await ctx.post(`${base}/api/review/grade`, {
      data: { schedulingRecordId: "x", grade: "good" },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("invalid bodies return 400 and change nothing", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const { forward } = await createCard(s, base);

    const notJson = await s.request.post(`${base}/api/review/grade`, {
      headers: { "Content-Type": "application/json" },
      data: Buffer.from("{not json"),
    });
    expect(notJson.status()).toBe(400);
    expect((await notJson.json()).error.code).toBe("INVALID_JSON");

    const badGrade = await grade(s, base, forward.id, "perfect");
    expect(badGrade.status()).toBe(400);
    const badBody = await badGrade.json();
    expect(badBody.error.code).toBe("VALIDATION_ERROR");
    expect(badBody.error.fields.grade).toBeTruthy();

    const noId = await s.request.post(`${base}/api/review/grade`, { data: { grade: "good" } });
    expect(noId.status()).toBe(400);
    expect((await noId.json()).error.fields.schedulingRecordId).toBeTruthy();

    const after = await prisma.schedulingRecord.findUniqueOrThrow({ where: { id: forward.id } });
    expect(after).toMatchObject({ interval: 0, repetitions: 0, easeFactor: 2.5 });
  });

  test("another user's or an unknown record returns 404", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const { forward } = await createCard(owner, base);

    const res = await grade(other, base, forward.id, "good");
    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
    expect((await grade(other, base, "no-such-record", "good")).status()).toBe(404);

    const after = await prisma.schedulingRecord.findUniqueOrThrow({ where: { id: forward.id } });
    expect(after.repetitions).toBe(0);
  });

  test("Good on a new record persists SM-2 state and leaves the other direction alone", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base, "Asia/Ho_Chi_Minh");
    const { cardId, forward, backward } = await createCard(s, base);

    const res = await grade(s, base, forward.id, "good");
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    // Creation set the record to the start of today in +07:00 (no DST), so
    // one day later is the next local midnight, independent of the test clock.
    const tomorrow = new Date(forward.nextReviewDate.getTime() + DAY_MS);
    expect(data).toEqual({
      id: forward.id,
      cardId,
      direction: "TERM_TO_DEFINITION",
      interval: 1,
      repetitions: 1,
      easeFactor: 2.5,
      nextReviewDate: tomorrow.toISOString(),
    });

    const stored = await prisma.schedulingRecord.findUniqueOrThrow({ where: { id: forward.id } });
    expect(stored).toMatchObject({ interval: 1, repetitions: 1, easeFactor: 2.5 });
    expect(stored.nextReviewDate.toISOString()).toBe(tomorrow.toISOString());

    const untouched = await prisma.schedulingRecord.findUniqueOrThrow({
      where: { id: backward.id },
    });
    expect(untouched).toEqual(backward);

    // The other direction is still due and can be graded on its own.
    const second = await grade(s, base, backward.id, "again");
    expect(second.status()).toBe(200);
    expect((await second.json()).data).toMatchObject({
      direction: "DEFINITION_TO_TERM",
      interval: 1,
      repetitions: 0,
      easeFactor: 2.5,
    });
  });

  test("Again/Hard/Good/Easy map to quality 1/3/4/5", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    // From a mature, due state (reps 2, interval 6, EF 2.5): the interval is
    // round(6 × 2.5) = 15 for every pass grade; EF moves by q's SM-2 delta.
    const expected = {
      again: { interval: 1, repetitions: 0, easeFactor: 2.5 },
      hard: { interval: 15, repetitions: 3, easeFactor: 2.36 },
      good: { interval: 15, repetitions: 3, easeFactor: 2.5 },
      easy: { interval: 15, repetitions: 3, easeFactor: 2.6 },
    } as const;

    for (const [g, want] of Object.entries(expected)) {
      const { forward } = await createCard(s, base);
      await prisma.schedulingRecord.update({
        where: { id: forward.id },
        data: { interval: 6, repetitions: 2, easeFactor: 2.5 },
      });
      const res = await grade(s, base, forward.id, g);
      expect(res.status(), g).toBe(200);
      const data = (await res.json()).data;
      expect(data, g).toMatchObject(want);
      // UTC user: due exactly `interval` days after today's start.
      expect(data.nextReviewDate, g).toBe(
        new Date(forward.nextReviewDate.getTime() + want.interval * DAY_MS).toISOString()
      );
    }
  });

  test("two concurrent grades of one record apply exactly once", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const { forward } = await createCard(s, base);

    const statuses = (
      await Promise.all([
        grade(s, base, forward.id, "good"),
        grade(s, base, forward.id, "good"),
      ])
    )
      .map((r) => r.status())
      .sort();
    expect(statuses).toEqual([200, 409]);

    const stored = await prisma.schedulingRecord.findUniqueOrThrow({ where: { id: forward.id } });
    expect(stored).toMatchObject({ interval: 1, repetitions: 1 });
  });

  test("grading a record that is not due returns 409 and does not advance it", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const { forward } = await createCard(s, base);

    expect((await grade(s, base, forward.id, "good")).status()).toBe(200);
    const repeat = await grade(s, base, forward.id, "good");
    expect(repeat.status()).toBe(409);
    expect((await repeat.json()).error.code).toBe("NOT_DUE");

    const stored = await prisma.schedulingRecord.findUniqueOrThrow({ where: { id: forward.id } });
    expect(stored).toMatchObject({ interval: 1, repetitions: 1 });
  });
});
