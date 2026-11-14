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
  const email = `folders-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Folders Test", timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id };
}

async function createClass(s: Session, base: string, name: string) {
  const res = await s.request.post(`${base}/api/classes`, { data: { name } });
  expect(res.status()).toBe(201);
  return (await res.json()).data as { id: string; name: string };
}

async function createFolder(s: Session, base: string, classId: string, name: string) {
  const res = await s.request.post(`${base}/api/classes/${classId}/folders`, {
    data: { name },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data as {
    id: string;
    name: string;
    isUnsorted: boolean;
    flashcardCount: number;
    cardCount: number;
  };
}

/** One Flashcard named `name` holding `count` Cards, each with two Scheduling Records. */
async function seedFlashcard(s: Session, folderId: string, name: string, count: number) {
  const flashcard = await prisma.flashcard.create({
    data: { name, folderId, userId: s.userId },
  });
  const cardIds: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const card = await prisma.card.create({
      data: { term: `t${i}`, definition: `d${i}`, flashcardId: flashcard.id, userId: s.userId },
    });
    cardIds.push(card.id);
    await prisma.schedulingRecord.createMany({
      data: (["TERM_TO_DEFINITION", "DEFINITION_TO_TERM"] as const).map((direction) => ({
        cardId: card.id,
        direction,
        nextReviewDate: new Date(),
      })),
    });
  }
  return { flashcard, cardIds };
}

/** A uniquely named Flashcard in the Folder holding `count` Cards. */
async function seedCards(s: Session, folderId: string, count: number) {
  return (await seedFlashcard(s, folderId, `seed-${randomUUID()}`, count)).cardIds;
}

async function unsortedOf(classId: string) {
  return prisma.folder.findFirstOrThrow({ where: { classId, isUnsorted: true } });
}

// spec-2-2: Folder CRUD inside a Class.
test.describe("/api/classes/:id/folders and /api/folders/:id", () => {
  test("unauthenticated requests return the 401 envelope", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const ctx = await playwright.request.newContext();
    for (const res of [
      await ctx.get(`${base}/api/classes/abc/folders`),
      await ctx.post(`${base}/api/classes/abc/folders`, { data: { name: "x" } }),
      await ctx.patch(`${base}/api/folders/abc`, { data: { name: "x" } }),
      await ctx.delete(`${base}/api/folders/abc`, { data: { mode: "move" } }),
    ]) {
      expect(res.status()).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
    }
  });

  test("list returns the class, Unsorted first then by name, with flashcard and card counts", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const cls = await createClass(s, base, "IELTS");
    const zeta = await createFolder(s, base, cls.id, "Zeta");
    await createFolder(s, base, cls.id, "Alpha");
    await seedCards(s, zeta.id, 2);
    await seedCards(s, (await unsortedOf(cls.id)).id, 1);

    const res = await s.request.get(`${base}/api/classes/${cls.id}/folders`);
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    expect(data.class).toMatchObject({ id: cls.id, name: "IELTS", color: "LAVENDER" });
    expect(data.folders.map((f: { name: string }) => f.name)).toEqual([
      "Unsorted",
      "Alpha",
      "Zeta",
    ]);
    expect(data.folders.map((f: { cardCount: number }) => f.cardCount)).toEqual([1, 0, 2]);
    expect(data.folders.map((f: { flashcardCount: number }) => f.flashcardCount)).toEqual([
      1, 0, 1,
    ]);
    expect(data.folders[0].isUnsorted).toBe(true);
  });

  test("create returns 201 with zero counts and trims the name", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const cls = await createClass(s, base, "C");
    const folder = await createFolder(s, base, cls.id, "  Weather  ");
    expect(folder).toMatchObject({
      name: "Weather",
      isUnsorted: false,
      flashcardCount: 0,
      cardCount: 0,
    });
    const row = await prisma.folder.findUniqueOrThrow({ where: { id: folder.id } });
    expect(row).toMatchObject({ classId: cls.id, userId: s.userId, isUnsorted: false });
  });

  test("create rejects blank, long and clashing names with fields.name", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const cls = await createClass(s, base, "C");
    await createFolder(s, base, cls.id, "Weather");
    for (const name of ["", "   ", "a".repeat(81), "weather", " WEATHER ", "unsorted"]) {
      const res = await s.request.post(`${base}/api/classes/${cls.id}/folders`, {
        data: { name },
      });
      expect(res.status(), name).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(typeof body.error.fields.name).toBe("string");
    }
    expect(await prisma.folder.count({ where: { classId: cls.id } })).toBe(2);

    // The same name is fine in another class.
    const other = await createClass(s, base, "D");
    await createFolder(s, base, other.id, "Weather");
  });

  test("foreign and unknown ids are 404 for every route", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const a = await newUser(playwright, base);
    const b = await newUser(playwright, base);
    const cls = await createClass(a, base, "Mine");
    const folder = await createFolder(a, base, cls.id, "Private");
    await seedCards(a, folder.id, 1);

    for (const res of [
      await b.request.get(`${base}/api/classes/${cls.id}/folders`),
      await b.request.post(`${base}/api/classes/${cls.id}/folders`, { data: { name: "x" } }),
      await b.request.patch(`${base}/api/folders/${folder.id}`, { data: { name: "x" } }),
      await b.request.delete(`${base}/api/folders/${folder.id}`, { data: { mode: "delete" } }),
      await a.request.get(`${base}/api/classes/nope/folders`),
      await a.request.patch(`${base}/api/folders/nope`, { data: { name: "x" } }),
      await a.request.delete(`${base}/api/folders/nope`, { data: { mode: "move" } }),
    ]) {
      expect(res.status()).toBe(404);
      expect((await res.json()).error.code).toBe("NOT_FOUND");
    }
    expect(await prisma.folder.count({ where: { id: folder.id } })).toBe(1);
    expect(await prisma.card.count({ where: { flashcard: { folderId: folder.id } } })).toBe(1);
  });

  test("rename changes a custom folder; clashes and Unsorted are 400", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const cls = await createClass(s, base, "C");
    const a = await createFolder(s, base, cls.id, "Alpha");
    await createFolder(s, base, cls.id, "Beta");
    await seedCards(s, a.id, 2);

    const ok = await s.request.patch(`${base}/api/folders/${a.id}`, {
      data: { name: " Gamma " },
    });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).data).toMatchObject({
      id: a.id,
      name: "Gamma",
      flashcardCount: 1,
      cardCount: 2,
    });

    // Case-only change of its own name is allowed.
    const same = await s.request.patch(`${base}/api/folders/${a.id}`, {
      data: { name: "GAMMA" },
    });
    expect(same.status()).toBe(200);

    for (const name of ["beta", "UNSORTED", "", "a".repeat(81)]) {
      const res = await s.request.patch(`${base}/api/folders/${a.id}`, { data: { name } });
      expect(res.status(), name).toBe(400);
      expect(typeof (await res.json()).error.fields.name).toBe("string");
    }

    const unsorted = await unsortedOf(cls.id);
    const locked = await s.request.patch(`${base}/api/folders/${unsorted.id}`, {
      data: { name: "Renamed" },
    });
    expect(locked.status()).toBe(400);
    expect((await prisma.folder.findUniqueOrThrow({ where: { id: unsorted.id } })).name).toBe(
      "Unsorted"
    );
  });

  test("delete with move puts the flashcards in the class's Unsorted", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const cls = await createClass(s, base, "C");
    const other = await createClass(s, base, "Other");
    const folder = await createFolder(s, base, cls.id, "Doomed");
    const otherFolder = await createFolder(s, base, other.id, "Elsewhere");
    const cardIds = await seedCards(s, folder.id, 3);
    await seedCards(s, otherFolder.id, 1);

    const res = await s.request.delete(`${base}/api/folders/${folder.id}`, {
      data: { mode: "move" },
    });
    expect(res.status()).toBe(200);

    const unsorted = await unsortedOf(cls.id);
    expect(await prisma.folder.count({ where: { id: folder.id } })).toBe(0);
    const cards = await prisma.card.findMany({
      where: { id: { in: cardIds } },
      include: { flashcard: true },
    });
    expect(cards).toHaveLength(3);
    expect(cards.every((c) => c.flashcard.folderId === unsorted.id)).toBe(true);
    expect(await prisma.schedulingRecord.count({ where: { cardId: { in: cardIds } } })).toBe(6);
    // The other class is untouched.
    expect(await prisma.card.count({ where: { flashcard: { folderId: otherFolder.id } } })).toBe(1);
  });

  test("delete with flashcards removes the folder, flashcards, cards and scheduling records", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const cls = await createClass(s, base, "C");
    const folder = await createFolder(s, base, cls.id, "Doomed");
    const keep = await createFolder(s, base, cls.id, "Keep");
    const doomed = await seedCards(s, folder.id, 2);
    const kept = await seedCards(s, keep.id, 1);

    const res = await s.request.delete(`${base}/api/folders/${folder.id}`, {
      data: { mode: "delete" },
    });
    expect(res.status()).toBe(200);
    expect(await prisma.folder.count({ where: { id: folder.id } })).toBe(0);
    expect(await prisma.card.count({ where: { id: { in: doomed } } })).toBe(0);
    expect(await prisma.schedulingRecord.count({ where: { cardId: { in: doomed } } })).toBe(0);
    expect(await prisma.card.count({ where: { id: { in: kept } } })).toBe(1);
    expect(await prisma.schedulingRecord.count({ where: { cardId: { in: kept } } })).toBe(2);
    expect(await prisma.flashcard.count({ where: { folderId: folder.id } })).toBe(0);
    expect(await prisma.flashcard.count({ where: { folderId: (await unsortedOf(cls.id)).id } })).toBe(0);
  });

  test("a failure mid-delete rolls everything back", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const cls = await createClass(s, base, "C");
    const folder = await createFolder(s, base, cls.id, "Stays");
    const cards = await seedCards(s, folder.id, 2);
    // Break the invariant so the move step throws after the transaction began.
    await prisma.folder.delete({ where: { id: (await unsortedOf(cls.id)).id } });

    const res = await s.request.delete(`${base}/api/folders/${folder.id}`, {
      data: { mode: "move" },
    });
    expect(res.status()).toBe(500);
    expect((await res.json()).error.code).toBe("INTERNAL_ERROR");
    expect(await prisma.folder.count({ where: { id: folder.id } })).toBe(1);
    expect(
      await prisma.card.count({ where: { id: { in: cards }, flashcard: { folderId: folder.id } } })
    ).toBe(2);
    expect(await prisma.schedulingRecord.count({ where: { cardId: { in: cards } } })).toBe(4);
  });

  test("delete rejects Unsorted and bad bodies without changing anything", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const cls = await createClass(s, base, "C");
    const unsorted = await unsortedOf(cls.id);
    await seedCards(s, unsorted.id, 2);
    const folder = await createFolder(s, base, cls.id, "F");

    for (const mode of ["move", "delete"]) {
      const res = await s.request.delete(`${base}/api/folders/${unsorted.id}`, {
        data: { mode },
      });
      expect(res.status()).toBe(400);
    }
    expect(await prisma.folder.count({ where: { id: unsorted.id } })).toBe(1);
    expect(await prisma.card.count({ where: { flashcard: { folderId: unsorted.id } } })).toBe(2);

    const bad = await s.request.delete(`${base}/api/folders/${folder.id}`, {
      data: { mode: "nope" },
    });
    expect(bad.status()).toBe(400);
    expect(await prisma.folder.count({ where: { id: folder.id } })).toBe(1);
  });

  test("class counts follow folder create, move-delete and delete-all", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const cls = await createClass(s, base, "C");
    const classRow = async () =>
      ((await (await s.request.get(`${base}/api/classes`)).json()).data as {
        id: string;
        folderCount: number;
        flashcardCount: number;
        cardCount: number;
      }[]).find((c) => c.id === cls.id);

    expect(await classRow()).toMatchObject({ folderCount: 1, flashcardCount: 0, cardCount: 0 });
    const a = await createFolder(s, base, cls.id, "A");
    const b = await createFolder(s, base, cls.id, "B");
    await seedCards(s, a.id, 2);
    await seedCards(s, b.id, 3);
    expect(await classRow()).toMatchObject({ folderCount: 3, flashcardCount: 2, cardCount: 5 });

    await s.request.delete(`${base}/api/folders/${a.id}`, { data: { mode: "move" } });
    expect(await classRow()).toMatchObject({ folderCount: 2, flashcardCount: 2, cardCount: 5 });

    await s.request.delete(`${base}/api/folders/${b.id}`, { data: { mode: "delete" } });
    expect(await classRow()).toMatchObject({ folderCount: 1, flashcardCount: 1, cardCount: 2 });
  });

  test("delete with move renames a clashing flashcard name (2), (3)", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const cls = await createClass(s, base, "C");
    const unsorted = await unsortedOf(cls.id);
    await seedFlashcard(s, unsorted.id, "Idioms", 1);
    await seedFlashcard(s, unsorted.id, "Idioms (2)", 0);
    const folder = await createFolder(s, base, cls.id, "Doomed");
    const clashing = await seedFlashcard(s, folder.id, "idioms", 2);
    const free = await seedFlashcard(s, folder.id, "Unique", 1);

    const res = await s.request.delete(`${base}/api/folders/${folder.id}`, {
      data: { mode: "move" },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toMatchObject({ flashcards: 2, cards: 3 });

    const names = (
      await prisma.flashcard.findMany({ where: { folderId: unsorted.id } })
    ).map((f) => f.name);
    expect(names.sort()).toEqual(["Idioms", "Idioms (2)", "Unique", "idioms (3)"].sort());
    expect(
      (await prisma.flashcard.findUniqueOrThrow({ where: { id: clashing.flashcard.id } })).name
    ).toBe("idioms (3)");
    expect(
      (await prisma.flashcard.findUniqueOrThrow({ where: { id: free.flashcard.id } })).folderId
    ).toBe(unsorted.id);
  });

  test("GET /api/folders/:id lists Flashcards with Card counts; 404 for foreign", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const cls = await createClass(s, base, "IELTS");
    const folder = await createFolder(s, base, cls.id, "Speaking");
    await seedFlashcard(s, folder.id, "Zebra", 2);
    await seedFlashcard(s, folder.id, "Apple", 0);

    const res = await s.request.get(`${base}/api/folders/${folder.id}`);
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    expect(data.folder).toEqual({ id: folder.id, name: "Speaking", isUnsorted: false });
    expect(data.class).toMatchObject({ id: cls.id, name: "IELTS", color: "LAVENDER" });
    expect(
      data.flashcards.map((f: { name: string; cardCount: number }) => [f.name, f.cardCount])
    ).toEqual([
      ["Apple", 0],
      ["Zebra", 2],
    ]);
    expect(data.cards).toBeUndefined();

    expect((await other.request.get(`${base}/api/folders/${folder.id}`)).status()).toBe(404);
    expect((await s.request.get(`${base}/api/folders/nope`)).status()).toBe(404);
  });
});
