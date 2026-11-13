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
  const email = `learn-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Learn Test", timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id };
}

/** A Class / Folder / Flashcard chain; returns the Flashcard id. */
async function createFlashcard(s: Session, base: string, name = "Weather idioms") {
  const cls = await s.request.post(`${base}/api/classes`, { data: { name: `C ${randomUUID()}` } });
  expect(cls.status()).toBe(201);
  const folder = await s.request.post(`${base}/api/classes/${(await cls.json()).data.id}/folders`, {
    data: { name: "Speaking" },
  });
  expect(folder.status()).toBe(201);
  const res = await s.request.post(`${base}/api/folders/${(await folder.json()).data.id}/flashcards`, {
    data: { name },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data.id as string;
}

/**
 * Adds one Card through the API (it starts unlearned, spec-4-6) and returns
 * its two Scheduling Records. `createdAt` is pinned so creation order is exact;
 * `learned: true` marks both records graded.
 */
async function addCard(
  s: Session,
  base: string,
  flashcardId: string,
  term: string,
  { learned = false, createdAt }: { learned?: boolean; createdAt?: Date } = {}
) {
  const res = await s.request.post(`${base}/api/cards/batch`, {
    data: { flashcardId, cards: [{ term, definition: `${term} meaning` }] },
  });
  expect(res.status()).toBe(201);
  const card = await prisma.card.findFirstOrThrow({
    where: { flashcardId, term },
    include: { schedulingRecords: true },
  });
  if (createdAt) await prisma.card.update({ where: { id: card.id }, data: { createdAt } });
  if (learned) {
    await prisma.schedulingRecord.updateMany({
      where: { cardId: card.id },
      data: { firstGradedAt: new Date() },
    });
  }
  const byDirection = (d: string) => card.schedulingRecords.find((r) => r.direction === d)!;
  return {
    cardId: card.id,
    forward: byDirection("TERM_TO_DEFINITION"),
    backward: byDirection("DEFINITION_TO_TERM"),
  };
}

async function setRecord(ids: string[], data: { nextReviewDate?: Date; firstGradedAt?: Date }) {
  await prisma.schedulingRecord.updateMany({ where: { id: { in: ids } }, data });
}

function learn(s: Session, base: string, flashcardId?: string) {
  const query = flashcardId === undefined ? "" : `?flashcardId=${encodeURIComponent(flashcardId)}`;
  return s.request.get(`${base}/api/review/learn${query}`);
}

async function learnData(s: Session, base: string, flashcardId: string) {
  const res = await learn(s, base, flashcardId);
  expect(res.status()).toBe(200);
  return (await res.json()).data as {
    flashcard: { id: string; name: string };
    counts: { newCards: number; due: number };
    entries: { schedulingRecordId: string; direction: string; flashcardName: string }[];
  };
}

const ids = (entries: { schedulingRecordId: string }[]) => entries.map((e) => e.schedulingRecordId);

async function setStudyDirections(s: Session, base: string, studyDirections: string) {
  const res = await s.request.patch(`${base}/api/settings`, { data: { studyDirections } });
  expect(res.status()).toBe(200);
}

async function reviewIds(s: Session, base: string) {
  const res = await s.request.get(`${base}/api/review/queue`);
  expect(res.status()).toBe(200);
  return ids((await res.json()).data.entries);
}

function grade(s: Session, base: string, schedulingRecordId: string, value: string) {
  return s.request.post(`${base}/api/review/grade`, { data: { schedulingRecordId, grade: value } });
}

// spec-4-8: GET /api/review/learn?flashcardId= (FR-17).
test.describe("GET /api/review/learn", () => {
  test("unauthenticated requests return 401", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const ctx = await playwright.request.newContext();
    const res = await ctx.get(`${base}/api/review/learn?flashcardId=abc`);
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("a missing or blank flashcardId returns 400", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    for (const flashcardId of [undefined, "", "   "]) {
      const res = await learn(s, base, flashcardId);
      expect(res.status(), String(flashcardId)).toBe(400);
      const { error } = await res.json();
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.fields.flashcardId).toBe("Choose a flashcard to learn.");
    }
  });

  test("another user's or an unknown Flashcard returns 404", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const flashcardId = await createFlashcard(owner, base);
    await addCard(owner, base, flashcardId, "drizzle");

    for (const id of [flashcardId, "does-not-exist"]) {
      const res = await learn(other, base, id);
      expect(res.status(), id).toBe(404);
      expect((await res.json()).error.code).toBe("NOT_FOUND");
    }
  });

  test("order: new Cards oldest first, both directions together, then due learned records", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcardId = await createFlashcard(s, base);
    const now = Date.now();
    // B is added first but created later, so creation time, not insert order, decides.
    const b = await addCard(s, base, flashcardId, "breeze", { createdAt: new Date(now - DAY_MS) });
    const a = await addCard(s, base, flashcardId, "drizzle", {
      createdAt: new Date(now - 2 * DAY_MS),
    });
    const learned = await addCard(s, base, flashcardId, "squall", { learned: true });
    await setRecord([learned.forward.id], { nextReviewDate: new Date(now - DAY_MS) });
    await setRecord([learned.backward.id], { nextReviewDate: new Date(now + DAY_MS) });

    // Another Flashcard's Cards never leak in.
    const otherId = await createFlashcard(s, base, "Academic verbs");
    await addCard(s, base, otherId, "collate");

    const data = await learnData(s, base, flashcardId);
    expect(data.flashcard).toEqual({ id: flashcardId, name: "Weather idioms" });
    expect(data.counts).toEqual({ newCards: 2, due: 1 });
    expect(ids(data.entries)).toEqual([
      a.forward.id,
      a.backward.id,
      b.forward.id,
      b.backward.id,
      learned.forward.id,
    ]);
    expect(data.entries[0]).toMatchObject({
      direction: "TERM_TO_DEFINITION",
      flashcardName: "Weather idioms",
      term: "drizzle",
      definition: "drizzle meaning",
    });
    expect(data.entries[1].direction).toBe("DEFINITION_TO_TERM");
  });

  test("due learned records come oldest-due first", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcardId = await createFlashcard(s, base);
    const now = Date.now();
    const x = await addCard(s, base, flashcardId, "drizzle", { learned: true });
    const y = await addCard(s, base, flashcardId, "squall", { learned: true });
    await setRecord([x.forward.id, x.backward.id], { nextReviewDate: new Date(now - DAY_MS) });
    await setRecord([y.forward.id], { nextReviewDate: new Date(now - 3 * DAY_MS) });
    await setRecord([y.backward.id], { nextReviewDate: new Date(now + DAY_MS) });

    const data = await learnData(s, base, flashcardId);
    expect(data.counts).toEqual({ newCards: 0, due: 3 });
    expect(ids(data.entries)).toEqual([y.forward.id, ...[x.forward.id, x.backward.id]]);
  });

  test("half-learned: only the ungraded direction is offered; the Card still counts as new", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcardId = await createFlashcard(s, base);
    const card = await addCard(s, base, flashcardId, "drizzle");
    await setRecord([card.forward.id], {
      firstGradedAt: new Date(),
      nextReviewDate: new Date(Date.now() + DAY_MS),
    });

    const data = await learnData(s, base, flashcardId);
    expect(data.counts).toEqual({ newCards: 1, due: 0 });
    expect(ids(data.entries)).toEqual([card.backward.id]);
  });

  test("half-learned, Both: the graded, due direction is in Review and Learn's due part (spec-4-9)", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcardId = await createFlashcard(s, base);
    const card = await addCard(s, base, flashcardId, "drizzle");
    await setRecord([card.forward.id], {
      firstGradedAt: new Date(),
      nextReviewDate: new Date(Date.now() - DAY_MS),
    });

    expect(await reviewIds(s, base)).toEqual([card.forward.id]);
    const data = await learnData(s, base, flashcardId);
    expect(data.counts).toEqual({ newCards: 1, due: 1 });
    expect(ids(data.entries)).toEqual([card.backward.id, card.forward.id]);
  });

  test("a learned Card due tomorrow is absent", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcardId = await createFlashcard(s, base);
    const card = await addCard(s, base, flashcardId, "drizzle", { learned: true });
    await setRecord([card.forward.id, card.backward.id], {
      nextReviewDate: new Date(Date.now() + DAY_MS),
    });

    const data = await learnData(s, base, flashcardId);
    expect(data.counts).toEqual({ newCards: 0, due: 0 });
    expect(data.entries).toEqual([]);
  });

  test("an empty Flashcard has nothing to learn", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcardId = await createFlashcard(s, base);

    const data = await learnData(s, base, flashcardId);
    expect(data.counts).toEqual({ newCards: 0, due: 0 });
    expect(data.entries).toEqual([]);
  });

  test("a first Again saves once; the Card counts as new until the other direction is graded", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcardId = await createFlashcard(s, base);
    const card = await addCard(s, base, flashcardId, "drizzle");

    const graded = await grade(s, base, card.forward.id, "again");
    expect(graded.status()).toBe(200);
    expect((await graded.json()).data.repetitions).toBe(0);

    const data = await learnData(s, base, flashcardId);
    expect(data.counts).toEqual({ newCards: 1, due: 0 });
    expect(ids(data.entries)).toEqual([card.backward.id]);
    const review = await s.request.get(`${base}/api/review/queue`);
    expect((await review.json()).data.entries).toEqual([]);
  });

  test("learned after Learn: absent from Review today, present once its SM-2 date comes due", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcardId = await createFlashcard(s, base);
    const card = await addCard(s, base, flashcardId, "drizzle");

    for (const id of [card.forward.id, card.backward.id]) {
      expect((await grade(s, base, id, "good")).status()).toBe(200);
    }

    const data = await learnData(s, base, flashcardId);
    expect(data.counts).toEqual({ newCards: 0, due: 0 });
    expect(data.entries).toEqual([]);

    const today = await s.request.get(`${base}/api/review/queue`);
    expect((await today.json()).data.entries).toEqual([]);

    // Its SM-2 date is tomorrow; move it to now to stand in for that day.
    const records = await prisma.schedulingRecord.findMany({ where: { cardId: card.cardId } });
    for (const r of records) {
      expect(r.firstGradedAt).not.toBeNull();
      expect(r.nextReviewDate.getTime()).toBeGreaterThan(Date.now());
    }
    await setRecord([card.forward.id, card.backward.id], {
      nextReviewDate: new Date(Date.now() - 60_000),
    });
    const later = await s.request.get(`${base}/api/review/queue`);
    expect(ids((await later.json()).data.entries).sort()).toEqual(
      [card.forward.id, card.backward.id].sort()
    );
  });
});

test.describe("GET /api/flashcards/[id] Learn counts", () => {
  test("match the Learn queue's counts", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcardId = await createFlashcard(s, base);

    const empty = await s.request.get(`${base}/api/flashcards/${flashcardId}`);
    expect((await empty.json()).data.learn).toEqual({ newCards: 0, due: 0 });

    await addCard(s, base, flashcardId, "breeze");
    const half = await addCard(s, base, flashcardId, "drizzle");
    await setRecord([half.forward.id], { firstGradedAt: new Date() });
    const learned = await addCard(s, base, flashcardId, "squall", { learned: true });
    await setRecord([learned.forward.id, learned.backward.id], {
      nextReviewDate: new Date(Date.now() - DAY_MS),
    });
    const notDue = await addCard(s, base, flashcardId, "gale", { learned: true });
    await setRecord([notDue.forward.id, notDue.backward.id], {
      nextReviewDate: new Date(Date.now() + DAY_MS),
    });

    const res = await s.request.get(`${base}/api/flashcards/${flashcardId}`);
    expect(res.status()).toBe(200);
    const { learn: counts } = (await res.json()).data;
    // spec-4-9: drizzle's graded, due Term -> Definition is in the due part too.
    expect(counts).toEqual({ newCards: 2, due: 3 });
    expect((await learnData(s, base, flashcardId)).counts).toEqual(counts);
  });
});

// spec-4-9: Learn, its counts and Review follow the study directions setting (FR-18).
test.describe("Study directions in Learn", () => {
  test("Term -> Definition only: new Card A, then learned Card B, one direction each", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcardId = await createFlashcard(s, base);
    const a = await addCard(s, base, flashcardId, "breeze", { createdAt: new Date("2026-01-02") });
    const b = await addCard(s, base, flashcardId, "squall", {
      learned: true,
      createdAt: new Date("2026-01-01"),
    });
    await setRecord([b.forward.id, b.backward.id], { nextReviewDate: new Date(Date.now() - DAY_MS) });
    await setStudyDirections(s, base, "TERM_TO_DEFINITION");

    const data = await learnData(s, base, flashcardId);
    expect(ids(data.entries)).toEqual([a.forward.id, b.forward.id]);
    expect(data.entries.every((e) => e.direction === "TERM_TO_DEFINITION")).toBe(true);
    expect(data.counts).toEqual({ newCards: 1, due: 1 });
    expect(await reviewIds(s, base)).toEqual([b.forward.id]);

    const detail = await s.request.get(`${base}/api/flashcards/${flashcardId}`);
    const body = (await detail.json()).data;
    expect(body.learn).toEqual({ newCards: 1, due: 1 });
    expect(body.studyDirections).toBe("TERM_TO_DEFINITION");
  });

  test("Definition -> Term only: a Card learned Term -> Definition is offered Definition -> Term", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcardId = await createFlashcard(s, base);
    const card = await addCard(s, base, flashcardId, "drizzle");
    await setRecord([card.forward.id], {
      firstGradedAt: new Date(),
      nextReviewDate: new Date(Date.now() - DAY_MS),
    });
    await setStudyDirections(s, base, "DEFINITION_TO_TERM");

    const data = await learnData(s, base, flashcardId);
    expect(ids(data.entries)).toEqual([card.backward.id]);
    expect(data.counts).toEqual({ newCards: 1, due: 0 });
    const detail = await s.request.get(`${base}/api/flashcards/${flashcardId}`);
    expect(detail.status()).toBe(200);
    expect((await detail.json()).data.learn).toEqual(data.counts);
    expect(await reviewIds(s, base)).toEqual([]);
  });

  test("a Card graded in its studied direction no longer counts as new", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcardId = await createFlashcard(s, base);
    const card = await addCard(s, base, flashcardId, "drizzle");
    await setStudyDirections(s, base, "TERM_TO_DEFINITION");

    expect((await grade(s, base, card.forward.id, "good")).status()).toBe(200);
    const data = await learnData(s, base, flashcardId);
    expect(data.counts).toEqual({ newCards: 0, due: 0 });
    const detail = await s.request.get(`${base}/api/flashcards/${flashcardId}`);
    expect(detail.status()).toBe(200);
    expect((await detail.json()).data.learn).toEqual(data.counts);
    expect(data.entries).toEqual([]);
    // The unstudied direction was never written.
    const backward = await prisma.schedulingRecord.findUniqueOrThrow({
      where: { id: card.backward.id },
    });
    expect(backward).toEqual(card.backward);
  });
});
