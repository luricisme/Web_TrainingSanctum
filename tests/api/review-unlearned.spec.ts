import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";
const MINUTE_MS = 60_000;

interface Session {
  request: APIRequestContext;
  userId: string;
}

async function newUser(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  base: string
): Promise<Session> {
  const request = await playwright.request.newContext();
  const email = `unlearned-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Unlearned Test", timezone: "UTC" },
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
 * Adds one Card, created `minutesAgo` minutes ago. API-created Cards start
 * unlearned in both directions; `learned` marks the listed directions graded.
 */
async function addCard(
  s: Session,
  base: string,
  flashcardId: string,
  term: string,
  { minutesAgo = 0, learned = [] as string[] } = {}
) {
  const res = await s.request.post(`${base}/api/cards/batch`, {
    data: { flashcardId, cards: [{ term, definition: `${term} meaning` }] },
  });
  expect(res.status()).toBe(201);
  const card = await prisma.card.findFirstOrThrow({ where: { flashcardId, term } });
  await prisma.card.update({
    where: { id: card.id },
    data: { createdAt: new Date(Date.now() - minutesAgo * MINUTE_MS) },
  });
  if (learned.length > 0) {
    await prisma.schedulingRecord.updateMany({
      where: { cardId: card.id, direction: { in: learned as never } },
      data: { firstGradedAt: new Date() },
    });
  }
  return card.id;
}

const BOTH = ["TERM_TO_DEFINITION", "DEFINITION_TO_TERM"];

async function setStudyDirections(s: Session, base: string, studyDirections: string) {
  const res = await s.request.patch(`${base}/api/settings`, { data: { studyDirections } });
  expect(res.status()).toBe(200);
}

async function unlearned(s: Session, base: string, query = "") {
  const res = await s.request.get(`${base}/api/review/unlearned${query}`);
  return { status: res.status(), body: await res.json() };
}

// spec-4-5: GET /api/review/unlearned feeds the Empty due-queue state.
test.describe("GET /api/review/unlearned", () => {
  test("unauthenticated requests return 401", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const ctx = await playwright.request.newContext();
    const res = await ctx.get(`${base}/api/review/unlearned`);
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("no Flashcards: an empty list and a null Add card target", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const { status, body } = await unlearned(s, base);
    expect(status).toBe(200);
    expect(body.data).toEqual({ flashcards: [], addCardTarget: null });
  });

  test("lists at most 3 Flashcards with Unlearned Cards, newest unlearned Card first", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const folder = await createFolder(s, base, await createClass(s, base, "IELTS"), "Speaking");
    const a = await createFlashcard(s, base, folder, "Weather idioms");
    const b = await createFlashcard(s, base, folder, "Academic verbs");
    const c = await createFlashcard(s, base, folder, "Phrasal verbs");
    const d = await createFlashcard(s, base, folder, "Oldest");
    const learnedOnly = await createFlashcard(s, base, folder, "All learned");

    await addCard(s, base, a, "drizzle", { minutesAgo: 50 });
    await addCard(s, base, a, "squall", { minutesAgo: 10 });
    // A learned Card is not counted, and does not make its Flashcard "newest".
    await addCard(s, base, a, "gale", { minutesAgo: 1, learned: BOTH });
    await addCard(s, base, b, "collate", { minutesAgo: 5 });
    await addCard(s, base, c, "put off", { minutesAgo: 20 });
    await addCard(s, base, d, "ancient", { minutesAgo: 90 });
    await addCard(s, base, learnedOnly, "newest", { minutesAgo: 0, learned: BOTH });

    const { status, body } = await unlearned(s, base);
    expect(status).toBe(200);
    expect(body.data.flashcards).toEqual([
      { id: b, name: "Academic verbs", newCards: 1 },
      { id: a, name: "Weather idioms", newCards: 2 },
      { id: c, name: "Phrasal verbs", newCards: 1 },
    ]);
    // "+ Add card" targets the Flashcard of the newest Card, learned or not.
    expect(body.data.addCardTarget).toEqual({ id: learnedOnly, name: "All learned" });
  });

  test("only studied directions count: a Card unlearned only in an unstudied direction is not listed", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const folder = await createFolder(s, base, await createClass(s, base, "IELTS"), "Speaking");
    const half = await createFlashcard(s, base, folder, "Half learned");
    const fresh = await createFlashcard(s, base, folder, "Fresh");
    // Term → Definition graded; only Definition → Term is still unlearned.
    await addCard(s, base, half, "drizzle", { minutesAgo: 1, learned: ["TERM_TO_DEFINITION"] });
    await addCard(s, base, fresh, "squall", { minutesAgo: 5 });

    expect((await unlearned(s, base)).body.data.flashcards.map((f: { id: string }) => f.id)).toEqual(
      [half, fresh]
    );

    await setStudyDirections(s, base, "TERM_TO_DEFINITION");
    expect((await unlearned(s, base)).body.data.flashcards).toEqual([
      { id: fresh, name: "Fresh", newCards: 1 },
    ]);

    await setStudyDirections(s, base, "DEFINITION_TO_TERM");
    expect((await unlearned(s, base)).body.data.flashcards.map((f: { id: string }) => f.id)).toEqual(
      [half, fresh]
    );
  });

  test("a Class or Folder scope limits the list and the Add card target", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const ielts = await createClass(s, base, "IELTS");
    const speaking = await createFolder(s, base, ielts, "Speaking");
    const writing = await createFolder(s, base, ielts, "Writing");
    const toefl = await createClass(s, base, "TOEFL");
    const reading = await createFolder(s, base, toefl, "Reading");

    const weather = await createFlashcard(s, base, speaking, "Weather idioms");
    const essays = await createFlashcard(s, base, writing, "Essay verbs");
    const academic = await createFlashcard(s, base, reading, "Academic verbs");
    await addCard(s, base, weather, "drizzle", { minutesAgo: 30 });
    await addCard(s, base, essays, "argue", { minutesAgo: 20 });
    await addCard(s, base, academic, "collate", { minutesAgo: 10 });

    const byClass = await unlearned(s, base, `?classId=${ielts}`);
    expect(byClass.status).toBe(200);
    expect(byClass.body.data.flashcards.map((f: { id: string }) => f.id)).toEqual([
      essays,
      weather,
    ]);
    expect(byClass.body.data.addCardTarget).toEqual({ id: essays, name: "Essay verbs" });

    const byFolder = await unlearned(s, base, `?folderId=${speaking}`);
    expect(byFolder.body.data.flashcards).toEqual([
      { id: weather, name: "Weather idioms", newCards: 1 },
    ]);
    expect(byFolder.body.data.addCardTarget).toEqual({ id: weather, name: "Weather idioms" });

    // A scope with a Flashcard but no Cards targets its newest Flashcard.
    const empty = await createFolder(s, base, toefl, "Listening");
    const lectures = await createFlashcard(s, base, empty, "Lectures");
    const byEmpty = await unlearned(s, base, `?folderId=${empty}`);
    expect(byEmpty.body.data).toEqual({
      flashcards: [],
      addCardTarget: { id: lectures, name: "Lectures" },
    });
  });

  test("a flashcard scope is 400; a foreign or missing scope is 404", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const foreignClass = await createClass(other, base, "Theirs");

    for (const query of ["?flashcardId=x", "?classId=a&folderId=b"]) {
      expect((await unlearned(s, base, query)).status, query).toBe(400);
    }
    for (const query of [`?classId=${foreignClass}`, "?folderId=does-not-exist"]) {
      const { status, body } = await unlearned(s, base, query);
      expect(status, query).toBe(404);
      expect(body.error.code).toBe("NOT_FOUND");
    }
  });
});
