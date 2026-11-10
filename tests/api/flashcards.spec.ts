import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";

interface Session {
  request: APIRequestContext;
  userId: string;
}

async function newUser(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  base: string
): Promise<Session> {
  const request = await playwright.request.newContext();
  const email = `flashcards-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Flashcards Test", timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id };
}

async function createFolder(s: Session, base: string, className = "C", name = "F") {
  const cls = await s.request.post(`${base}/api/classes`, { data: { name: className } });
  const classId = (await cls.json()).data.id as string;
  const res = await s.request.post(`${base}/api/classes/${classId}/folders`, {
    data: { name },
  });
  expect(res.status()).toBe(201);
  return { id: (await res.json()).data.id as string, classId };
}

async function createFlashcard(s: Session, base: string, folderId: string, name: string) {
  const res = await s.request.post(`${base}/api/folders/${folderId}/flashcards`, {
    data: { name },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data as { id: string; name: string; cardCount: number };
}

async function seedCards(s: Session, flashcardId: string, count: number) {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const card = await prisma.card.create({
      data: { term: `t${i}`, definition: `d${i}`, flashcardId, userId: s.userId },
    });
    ids.push(card.id);
    await prisma.schedulingRecord.createMany({
      data: (["TERM_TO_DEFINITION", "DEFINITION_TO_TERM"] as const).map((direction) => ({
        cardId: card.id,
        direction,
        nextReviewDate: new Date(),
      })),
    });
  }
  return ids;
}

// spec-2-7: Flashcard CRUD inside a Folder.
test.describe("/api/folders/:id/flashcards and /api/flashcards/:id", () => {
  test("unauthenticated requests return the 401 envelope", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const ctx = await playwright.request.newContext();
    for (const res of [
      await ctx.get(`${base}/api/folders/abc/flashcards`),
      await ctx.post(`${base}/api/folders/abc/flashcards`, { data: { name: "x" } }),
      await ctx.get(`${base}/api/flashcards/abc`),
      await ctx.patch(`${base}/api/flashcards/abc`, { data: { name: "x" } }),
      await ctx.delete(`${base}/api/flashcards/abc`),
    ]) {
      expect(res.status()).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
    }
  });

  test("create returns 201 with 0 cards, trims the name, scopes to the user", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const folder = await createFolder(s, base);
    const flashcard = await createFlashcard(s, base, folder.id, "  Weather idioms  ");
    expect(flashcard).toMatchObject({ name: "Weather idioms", cardCount: 0 });
    const row = await prisma.flashcard.findUniqueOrThrow({ where: { id: flashcard.id } });
    expect(row).toMatchObject({ folderId: folder.id, userId: s.userId });

    const list = await s.request.get(`${base}/api/folders/${folder.id}/flashcards`);
    expect(list.status()).toBe(200);
    expect((await list.json()).data.flashcards).toEqual([
      { id: flashcard.id, name: "Weather idioms", cardCount: 0 },
    ]);
  });

  test("create rejects blank, long and clashing names with fields.name", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const folder = await createFolder(s, base);
    await createFlashcard(s, base, folder.id, "Weather");
    for (const name of ["", "   ", "a".repeat(81), "weather", " WEATHER "]) {
      const res = await s.request.post(`${base}/api/folders/${folder.id}/flashcards`, {
        data: { name },
      });
      expect(res.status(), name).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(typeof body.error.fields.name).toBe("string");
    }
    expect(await prisma.flashcard.count({ where: { folderId: folder.id } })).toBe(1);

    // The same name is fine in another Folder.
    const other = await createFolder(s, base, "D");
    await createFlashcard(s, base, other.id, "Weather");
  });

  test("the database enforces a case-insensitive unique name per Folder", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const folder = await createFolder(s, base);
    await createFlashcard(s, base, folder.id, "Weather");
    await expect(
      prisma.flashcard.create({
        data: { name: "WEATHER", folderId: folder.id, userId: s.userId },
      })
    ).rejects.toThrow();
  });

  test("GET returns the flashcard, folder, class and Cards", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const folder = await createFolder(s, base, "IELTS", "Speaking");
    const flashcard = await createFlashcard(s, base, folder.id, "Idioms");
    await seedCards(s, flashcard.id, 2);

    const res = await s.request.get(`${base}/api/flashcards/${flashcard.id}`);
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    expect(data.flashcard).toEqual({ id: flashcard.id, name: "Idioms" });
    expect(data.folder).toEqual({ id: folder.id, name: "Speaking", isUnsorted: false });
    expect(data.class).toEqual({ id: folder.classId, name: "IELTS" });
    expect(data.cards).toHaveLength(2);
    expect(Object.keys(data.cards[0]).sort()).toEqual(
      ["context", "definition", "example", "id", "partOfSpeech", "term"].sort()
    );
  });

  test("foreign and unknown ids are 404 for every route", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const a = await newUser(playwright, base);
    const b = await newUser(playwright, base);
    const folder = await createFolder(a, base);
    const flashcard = await createFlashcard(a, base, folder.id, "Private");
    const ids = await seedCards(a, flashcard.id, 1);

    for (const res of [
      await b.request.get(`${base}/api/folders/${folder.id}/flashcards`),
      await b.request.post(`${base}/api/folders/${folder.id}/flashcards`, {
        data: { name: "x" },
      }),
      await b.request.get(`${base}/api/flashcards/${flashcard.id}`),
      await b.request.patch(`${base}/api/flashcards/${flashcard.id}`, { data: { name: "x" } }),
      await b.request.delete(`${base}/api/flashcards/${flashcard.id}`),
      await a.request.get(`${base}/api/flashcards/nope`),
      await a.request.patch(`${base}/api/flashcards/nope`, { data: { name: "x" } }),
      await a.request.delete(`${base}/api/flashcards/nope`),
      await a.request.post(`${base}/api/folders/nope/flashcards`, { data: { name: "x" } }),
    ]) {
      expect(res.status()).toBe(404);
      expect((await res.json()).error.code).toBe("NOT_FOUND");
    }
    expect((await prisma.flashcard.findUniqueOrThrow({ where: { id: flashcard.id } })).name).toBe(
      "Private"
    );
    expect(await prisma.card.count({ where: { id: { in: ids } } })).toBe(1);
  });

  test("rename changes the name; clashes are 400, own name in another case is allowed", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const folder = await createFolder(s, base);
    const a = await createFlashcard(s, base, folder.id, "Alpha");
    await createFlashcard(s, base, folder.id, "Beta");
    await seedCards(s, a.id, 2);

    const ok = await s.request.patch(`${base}/api/flashcards/${a.id}`, {
      data: { name: " Gamma " },
    });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).data).toEqual({ id: a.id, name: "Gamma", cardCount: 2 });

    const same = await s.request.patch(`${base}/api/flashcards/${a.id}`, {
      data: { name: "GAMMA" },
    });
    expect(same.status()).toBe(200);

    for (const name of ["beta", " BETA ", "", "a".repeat(81)]) {
      const res = await s.request.patch(`${base}/api/flashcards/${a.id}`, { data: { name } });
      expect(res.status(), name).toBe(400);
      expect(typeof (await res.json()).error.fields.name).toBe("string");
    }
    expect((await prisma.flashcard.findUniqueOrThrow({ where: { id: a.id } })).name).toBe(
      "GAMMA"
    );

    const bad = await s.request.patch(`${base}/api/flashcards/${a.id}`, {
      headers: { "Content-Type": "application/json" },
      data: Buffer.from("{not json"),
    });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error.code).toBe("INVALID_JSON");
  });

  test("delete removes the flashcard, its Cards and Scheduling Records only", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const folder = await createFolder(s, base);
    const doomed = await createFlashcard(s, base, folder.id, "Doomed");
    const keep = await createFlashcard(s, base, folder.id, "Keep");
    const doomedCards = await seedCards(s, doomed.id, 3);
    const keptCards = await seedCards(s, keep.id, 1);

    const res = await s.request.delete(`${base}/api/flashcards/${doomed.id}`);
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toEqual({
      id: doomed.id,
      cards: 3,
      schedulingRecords: 6,
    });
    expect(await prisma.flashcard.count({ where: { id: doomed.id } })).toBe(0);
    expect(await prisma.card.count({ where: { id: { in: doomedCards } } })).toBe(0);
    expect(await prisma.schedulingRecord.count({ where: { cardId: { in: doomedCards } } })).toBe(
      0
    );
    expect(await prisma.flashcard.count({ where: { id: keep.id } })).toBe(1);
    expect(await prisma.card.count({ where: { id: { in: keptCards } } })).toBe(1);
    expect(await prisma.schedulingRecord.count({ where: { cardId: { in: keptCards } } })).toBe(
      2
    );

    expect((await s.request.delete(`${base}/api/flashcards/${doomed.id}`)).status()).toBe(404);
  });

  test("deleting a Folder cascades to Flashcards; Class counts include flashcards", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const folder = await createFolder(s, base);
    const flashcard = await createFlashcard(s, base, folder.id, "Set");
    await seedCards(s, flashcard.id, 2);

    const classes = (await (await s.request.get(`${base}/api/classes`)).json()).data as {
      id: string;
      folderCount: number;
      flashcardCount: number;
      cardCount: number;
    }[];
    expect(classes.find((c) => c.id === folder.classId)).toMatchObject({
      folderCount: 2,
      flashcardCount: 1,
      cardCount: 2,
    });

    const res = await s.request.delete(`${base}/api/folders/${folder.id}`, {
      data: { mode: "delete" },
    });
    expect(res.status()).toBe(200);
    expect(await prisma.flashcard.count({ where: { id: flashcard.id } })).toBe(0);
  });
});
