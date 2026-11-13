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
  const email = `queue-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Queue Test", timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id };
}

async function createClass(s: Session, base: string, name: string) {
  const res = await s.request.post(`${base}/api/classes`, { data: { name } });
  expect(res.status()).toBe(201);
  return (await res.json()).data.id as string;
}

async function createFolder(s: Session, base: string, classId: string, name: string) {
  const res = await s.request.post(`${base}/api/classes/${classId}/folders`, { data: { name } });
  expect(res.status()).toBe(201);
  return (await res.json()).data.id as string;
}

async function createFlashcard(s: Session, base: string, folderId: string, name: string) {
  const res = await s.request.post(`${base}/api/folders/${folderId}/flashcards`, {
    data: { name },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data.id as string;
}

/**
 * Adds one Card to a Flashcard and returns its two Scheduling Records. API-created
 * Cards start unlearned (spec-4-6); by default both records are marked learned so
 * the Card is eligible for Review. Pass `learned: false` to keep it new.
 */
async function addCard(
  s: Session,
  base: string,
  flashcardId: string,
  term: string,
  { learned = true }: { learned?: boolean } = {}
) {
  const res = await s.request.post(`${base}/api/cards/batch`, {
    data: { flashcardId, cards: [{ term, definition: `${term} meaning` }] },
  });
  expect(res.status()).toBe(201);
  if (learned) {
    await prisma.schedulingRecord.updateMany({
      where: { card: { flashcardId, term } },
      data: { firstGradedAt: new Date() },
    });
  }
  const card = await prisma.card.findFirstOrThrow({
    where: { flashcardId, term },
    include: { schedulingRecords: true },
  });
  const byDirection = (d: string) => card.schedulingRecords.find((r) => r.direction === d)!;
  return {
    cardId: card.id,
    forward: byDirection("TERM_TO_DEFINITION"),
    backward: byDirection("DEFINITION_TO_TERM"),
  };
}

async function setDue(ids: string[], nextReviewDate: Date) {
  await prisma.schedulingRecord.updateMany({ where: { id: { in: ids } }, data: { nextReviewDate } });
}

function queue(s: Session, base: string, query = "") {
  return s.request.get(`${base}/api/review/queue${query}`);
}

// spec-4-3, spec-4-6: GET /api/review/queue (learned Cards only).
test.describe("GET /api/review/queue", () => {
  test("unauthenticated requests return 401", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const ctx = await playwright.request.newContext();
    const res = await ctx.get(`${base}/api/review/queue`);
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("returns every due record across Classes, oldest-due-first; not-due is absent", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const a = await createFlashcard(
      s,
      base,
      await createFolder(s, base, await createClass(s, base, "IELTS"), "Speaking"),
      "Weather idioms"
    );
    const b = await createFlashcard(
      s,
      base,
      await createFolder(s, base, await createClass(s, base, "TOEFL"), "Reading"),
      "Academic verbs"
    );
    const older = await addCard(s, base, b, "collate");
    const newer = await addCard(s, base, a, "drizzle");
    const notDue = await addCard(s, base, a, "breeze");

    const now = Date.now();
    await setDue([older.forward.id, older.backward.id], new Date(now - 3 * DAY_MS));
    await setDue([newer.forward.id], new Date(now - 2 * DAY_MS));
    await setDue([newer.backward.id], new Date(now - DAY_MS));
    await setDue([notDue.forward.id, notDue.backward.id], new Date(now + DAY_MS));

    const res = await queue(s, base);
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(data.scope).toBeNull();
    const ids = data.entries.map((e: { schedulingRecordId: string }) => e.schedulingRecordId);
    // Equal due dates tie-break on cardId, then direction.
    expect(ids).toEqual([older.forward.id, older.backward.id, newer.forward.id, newer.backward.id]);
    expect(data.entries[0]).toEqual({
      schedulingRecordId: older.forward.id,
      cardId: older.cardId,
      direction: "TERM_TO_DEFINITION",
      nextReviewDate: new Date(now - 3 * DAY_MS).toISOString(),
      flashcardName: "Academic verbs",
      term: "collate",
      definition: "collate meaning",
      example: null,
      context: null,
      partOfSpeech: null,
    });
    expect(data.entries[2].flashcardName).toBe("Weather idioms");
  });

  test("a learned Card is due in both directions as two entries", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const fc = await createFlashcard(
      s,
      base,
      await createFolder(s, base, await createClass(s, base, "C"), "F"),
      "W"
    );
    const { cardId } = await addCard(s, base, fc, "collate");

    const { data } = await (await queue(s, base)).json();
    expect(data.entries).toHaveLength(2);
    expect(data.entries.map((e: { cardId: string }) => e.cardId)).toEqual([cardId, cardId]);
    expect(data.entries.map((e: { direction: string }) => e.direction).sort()).toEqual([
      "DEFINITION_TO_TERM",
      "TERM_TO_DEFINITION",
    ]);
  });

  test("scopes to a Class or Folder and names the scope", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const classId = await createClass(s, base, "IELTS");
    const folderId = await createFolder(s, base, classId, "Speaking");
    const otherFolderId = await createFolder(s, base, classId, "Writing");
    const flashcardId = await createFlashcard(s, base, folderId, "Weather idioms");
    const siblingFlashcardId = await createFlashcard(s, base, folderId, "Food idioms");
    const otherFlashcardId = await createFlashcard(s, base, otherFolderId, "Linkers");
    const otherClassFlashcardId = await createFlashcard(
      s,
      base,
      await createFolder(s, base, await createClass(s, base, "TOEFL"), "Reading"),
      "Academic verbs"
    );
    const inFlashcard = await addCard(s, base, flashcardId, "drizzle");
    const inFolder = await addCard(s, base, siblingFlashcardId, "peckish");
    const inClass = await addCard(s, base, otherFlashcardId, "moreover");
    await addCard(s, base, otherClassFlashcardId, "collate");

    const cardsOf = (entries: { cardId: string }[]) => [...new Set(entries.map((e) => e.cardId))].sort();

    const byFolder = (await (await queue(s, base, `?folderId=${folderId}`)).json()).data;
    expect(byFolder.scope).toEqual({ kind: "folder", id: folderId, name: "Speaking" });
    expect(cardsOf(byFolder.entries)).toEqual([inFlashcard.cardId, inFolder.cardId].sort());

    const byClass = (await (await queue(s, base, `?classId=${classId}`)).json()).data;
    expect(byClass.scope).toEqual({ kind: "class", id: classId, name: "IELTS" });
    expect(cardsOf(byClass.entries)).toEqual(
      [inFlashcard.cardId, inFolder.cardId, inClass.cardId].sort()
    );

  });

  test("a foreign or missing scope returns 404", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const classId = await createClass(owner, base, "Private");
    const folderId = await createFolder(owner, base, classId, "F");

    for (const query of [
      `?classId=${classId}`,
      `?folderId=${folderId}`,
      "?classId=does-not-exist",
    ]) {
      const res = await queue(other, base, query);
      expect(res.status(), query).toBe(404);
      expect((await res.json()).error.code, query).toBe("NOT_FOUND");
    }
  });

  test("two scopes or an empty scope return 400", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    for (const query of ["?classId=a&folderId=b", "?classId="]) {
      const res = await queue(s, base, query);
      expect(res.status(), query).toBe(400);
      expect((await res.json()).error.code, query).toBe("VALIDATION_ERROR");
    }
  });

  test("another user's due records never appear", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const fc = await createFlashcard(
      owner,
      base,
      await createFolder(owner, base, await createClass(owner, base, "C"), "F"),
      "W"
    );
    await addCard(owner, base, fc, "collate");

    const { data } = await (await queue(other, base)).json();
    expect(data).toEqual({ scope: null, entries: [] });
  });

  test("flashcard scope returns 400: review moved to Learn", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcardId = await createFlashcard(
      s,
      base,
      await createFolder(s, base, await createClass(s, base, "C"), "F"),
      "W"
    );
    await addCard(s, base, flashcardId, "collate");
    for (const query of [`?flashcardId=${flashcardId}`, "?folderId=b&flashcardId=c", "?flashcardId="]) {
      const res = await queue(s, base, query);
      expect(res.status(), query).toBe(400);
      const { error } = await res.json();
      expect(error.code, query).toBe("VALIDATION_ERROR");
      expect(error.message, query).toBe("Flashcard review moved to Learn.");
    }
  });

  test("unlearned and half-learned Cards never appear, in any scope (AD-14)", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const classId = await createClass(s, base, "C");
    const folderId = await createFolder(s, base, classId, "F");
    const fc = await createFlashcard(s, base, folderId, "W");
    const unlearned = await addCard(s, base, fc, "brand-new", { learned: false });
    const half = await addCard(s, base, fc, "half", { learned: false });
    await prisma.schedulingRecord.update({
      where: { id: half.forward.id },
      data: { firstGradedAt: new Date(), interval: 1, repetitions: 1 },
    });
    const learned = await addCard(s, base, fc, "learned");

    // Every record above is due today.
    const recordsOf = (entries: { schedulingRecordId: string }[]) =>
      entries.map((e) => e.schedulingRecordId);
    for (const query of ["", `?classId=${classId}`, `?folderId=${folderId}`]) {
      const { data } = await (await queue(s, base, query)).json();
      const ids = recordsOf(data.entries);
      expect(ids, query).toEqual([learned.forward.id, learned.backward.id]);
      for (const absent of [unlearned, half]) {
        expect(ids, query).not.toContain(absent.forward.id);
        expect(ids, query).not.toContain(absent.backward.id);
      }
    }
  });

  test("a Card becomes learned only after both directions are graded", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const fc = await createFlashcard(
      s,
      base,
      await createFolder(s, base, await createClass(s, base, "C"), "F"),
      "W"
    );
    const { forward, backward } = await addCard(s, base, fc, "collate", { learned: false });
    const gradeRecord = (id: string) =>
      s.request.post(`${base}/api/review/grade`, { data: { schedulingRecordId: id, grade: "good" } });
    const queuedIds = async () =>
      (await (await queue(s, base)).json()).data.entries.map(
        (e: { schedulingRecordId: string }) => e.schedulingRecordId
      );

    expect((await gradeRecord(forward.id)).status()).toBe(200);
    // Half-learned: the still-due backward record stays out of Review.
    expect(await queuedIds()).toEqual([]);

    expect((await gradeRecord(backward.id)).status()).toBe(200);
    await setDue([forward.id, backward.id], new Date(Date.now() - DAY_MS));
    expect(await queuedIds()).toEqual([forward.id, backward.id]);
  });

  test("a learned record graded Again stays learned and returns when due", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const fc = await createFlashcard(
      s,
      base,
      await createFolder(s, base, await createClass(s, base, "C"), "F"),
      "W"
    );
    const { forward, backward } = await addCard(s, base, fc, "collate");
    const graded = await s.request.post(`${base}/api/review/grade`, {
      data: { schedulingRecordId: forward.id, grade: "again" },
    });
    expect(graded.status()).toBe(200);
    expect((await graded.json()).data.repetitions).toBe(0);

    // Not due until tomorrow; then it is back.
    let { data } = await (await queue(s, base)).json();
    expect(data.entries.map((e: { schedulingRecordId: string }) => e.schedulingRecordId)).toEqual([
      backward.id,
    ]);
    await setDue([forward.id], new Date(Date.now() - DAY_MS));
    ({ data } = await (await queue(s, base)).json());
    expect(data.entries.map((e: { schedulingRecordId: string }) => e.schedulingRecordId)).toEqual([
      forward.id,
      backward.id,
    ]);
  });

  test("a graded record leaves the queue while its other direction stays", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const fc = await createFlashcard(
      s,
      base,
      await createFolder(s, base, await createClass(s, base, "C"), "F"),
      "W"
    );
    const { forward, backward } = await addCard(s, base, fc, "collate");

    const graded = await s.request.post(`${base}/api/review/grade`, {
      data: { schedulingRecordId: forward.id, grade: "good" },
    });
    expect(graded.status()).toBe(200);

    const { data } = await (await queue(s, base)).json();
    expect(data.entries.map((e: { schedulingRecordId: string }) => e.schedulingRecordId)).toEqual([
      backward.id,
    ]);
  });
});
