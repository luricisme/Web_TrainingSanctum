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
  base: string
): Promise<Session> {
  const request = await playwright.request.newContext();
  const email = `undo-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Undo Test", timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id };
}

async function createRecord(s: Session, base: string) {
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
  await s.request.post(`${base}/api/cards/batch`, {
    data: { flashcardId, cards: [{ term: "collate", definition: "gather" }] },
  });
  const card = await prisma.card.findFirstOrThrow({
    where: { flashcardId },
    include: { schedulingRecords: true },
  });
  return card.schedulingRecords.find((r) => r.direction === "TERM_TO_DEFINITION")!;
}

function grade(s: Session, base: string, id: string, g: string) {
  return s.request.post(`${base}/api/review/grade`, {
    data: { schedulingRecordId: id, grade: g },
  });
}

function undo(s: Session, base: string, data: unknown) {
  return s.request.post(`${base}/api/review/undo`, { data });
}

test.describe("POST /api/review/undo", () => {
  test("unauthenticated requests return 401", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const ctx = await playwright.request.newContext();
    const res = await ctx.post(`${base}/api/review/undo`, { data: {} });
    expect(res.status()).toBe(401);
  });

  test("restores every field, firstGradedAt back to null, and a regrade equals one grade", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const original = await createRecord(s, base);

    const first = (await (await grade(s, base, original.id, "good")).json()).data;
    expect(first.previous.firstGradedAt).toBeNull();
    const afterFirst = await prisma.schedulingRecord.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(afterFirst.firstGradedAt).not.toBeNull();

    const res = await undo(s, base, {
      schedulingRecordId: original.id,
      previous: first.previous,
      expectedNextReviewDate: first.nextReviewDate,
    });
    expect(res.status()).toBe(200);
    const restored = await prisma.schedulingRecord.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(restored).toEqual(original);

    // Grading again leaves the same state as a single grade from the original.
    const again = (await (await grade(s, base, original.id, "good")).json()).data;
    expect(again).toMatchObject({
      interval: first.interval,
      repetitions: first.repetitions,
      easeFactor: first.easeFactor,
      nextReviewDate: first.nextReviewDate,
    });
  });

  test("restores a mature state with a set firstGradedAt and updatedAt", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const r = await createRecord(s, base);
    // Written in two steps: Prisma stamps updatedAt on every update unless it is given.
    const seeded = await prisma.schedulingRecord.update({
      where: { id: r.id },
      data: {
        interval: 6,
        repetitions: 2,
        easeFactor: 2.36,
        nextReviewDate: new Date(Date.now() - DAY_MS),
        firstGradedAt: new Date(Date.now() - 9 * DAY_MS),
        updatedAt: new Date(Date.now() - 3 * DAY_MS),
      },
    });

    const graded = (await (await grade(s, base, r.id, "easy")).json()).data;
    const res = await undo(s, base, {
      schedulingRecordId: r.id,
      previous: graded.previous,
      expectedNextReviewDate: graded.nextReviewDate,
    });
    expect(res.status()).toBe(200);
    const restored = await prisma.schedulingRecord.findUniqueOrThrow({ where: { id: r.id } });
    expect(restored).toEqual(seeded);
  });

  test("a record graded again elsewhere returns 409 CONFLICT and changes nothing", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const r = await createRecord(s, base);
    const graded = (await (await grade(s, base, r.id, "good")).json()).data;
    const before = await prisma.schedulingRecord.findUniqueOrThrow({ where: { id: r.id } });

    const res = await undo(s, base, {
      schedulingRecordId: r.id,
      previous: graded.previous,
      expectedNextReviewDate: new Date(Date.now() + 99 * DAY_MS).toISOString(),
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
    const after = await prisma.schedulingRecord.findUniqueOrThrow({ where: { id: r.id } });
    expect(after).toEqual(before);
  });

  test("another user's or an unknown record returns 404", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const r = await createRecord(owner, base);
    const graded = (await (await grade(owner, base, r.id, "good")).json()).data;
    const body = {
      previous: graded.previous,
      expectedNextReviewDate: graded.nextReviewDate,
    };

    const res = await undo(other, base, { ...body, schedulingRecordId: r.id });
    expect(res.status()).toBe(404);
    expect(
      (await undo(other, base, { ...body, schedulingRecordId: "no-such-record" })).status()
    ).toBe(404);
    const after = await prisma.schedulingRecord.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.repetitions).toBe(1);
  });

  test("invalid bodies return 400", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const r = await createRecord(s, base);
    const graded = (await (await grade(s, base, r.id, "good")).json()).data;

    const notJson = await s.request.post(`${base}/api/review/undo`, {
      headers: { "Content-Type": "application/json" },
      data: Buffer.from("{nope"),
    });
    expect(notJson.status()).toBe(400);

    for (const body of [
      { schedulingRecordId: r.id, expectedNextReviewDate: graded.nextReviewDate },
      {
        schedulingRecordId: r.id,
        previous: { ...graded.previous, easeFactor: 0.5 },
        expectedNextReviewDate: graded.nextReviewDate,
      },
      { schedulingRecordId: r.id, previous: graded.previous },
    ]) {
      const res = await undo(s, base, body);
      expect(res.status()).toBe(400);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
    const after = await prisma.schedulingRecord.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.repetitions).toBe(1);
  });
});
