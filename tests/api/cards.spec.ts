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
  base: string,
  timezone = "UTC"
): Promise<Session> {
  const request = await playwright.request.newContext();
  const email = `cards-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Cards Test", timezone },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id };
}

async function createFolder(s: Session, base: string, name: string) {
  const cls = await s.request.post(`${base}/api/classes`, { data: { name: "C" } });
  const classId = (await cls.json()).data.id as string;
  const res = await s.request.post(`${base}/api/classes/${classId}/folders`, {
    data: { name },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data as { id: string };
}

// spec-2-3: Add cards, Manual mode.
test.describe("POST /api/cards/batch and GET /api/folders/:id", () => {
  test("unauthenticated requests return 401", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const ctx = await playwright.request.newContext();
    const post = await ctx.post(`${base}/api/cards/batch`, {
      data: { folderId: "x", cards: [] },
    });
    expect(post.status()).toBe(401);
    expect((await post.json()).error.code).toBe("UNAUTHENTICATED");
    expect((await ctx.get(`${base}/api/folders/x`)).status()).toBe(401);
  });

  test("creates Cards with two Scheduling Records at defaults and Unicode intact", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base, "Asia/Ho_Chi_Minh");
    const folder = await createFolder(s, base, "Words");

    const res = await s.request.post(`${base}/api/cards/batch`, {
      data: {
        folderId: folder.id,
        cards: [
          { term: "  collate ", definition: "/ˈkɒl.ə.keɪt/" },
          { term: "café", definition: "日本語", example: "  ", partOfSpeech: "noun" },
        ],
      },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).data).toEqual({ created: 2 });

    const cards = await prisma.card.findMany({
      where: { folderId: folder.id },
      include: { schedulingRecords: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      term: "collate",
      definition: "/ˈkɒl.ə.keɪt/",
      userId: s.userId,
    });
    expect(cards[1]).toMatchObject({
      term: "café",
      definition: "日本語",
      example: null,
      partOfSpeech: "noun",
    });
    for (const card of cards) {
      expect(card.schedulingRecords.map((r) => r.direction).sort()).toEqual([
        "DEFINITION_TO_TERM",
        "TERM_TO_DEFINITION",
      ]);
      for (const r of card.schedulingRecords) {
        expect(r).toMatchObject({ easeFactor: 2.5, repetitions: 0, interval: 0 });
        // Start of a day in +07:00 is 17:00Z.
        expect(r.nextReviewDate.getUTCHours()).toBe(17);
        expect(r.nextReviewDate.getUTCMinutes()).toBe(0);
        expect(r.nextReviewDate.getTime()).toBeLessThanOrEqual(Date.now());
      }
    }

    const detail = await s.request.get(`${base}/api/folders/${folder.id}`);
    expect(detail.status()).toBe(200);
    const data = (await detail.json()).data;
    expect(data.folder).toMatchObject({ id: folder.id, name: "Words", isUnsorted: false });
    expect(data.class.name).toBe("C");
    expect(data.cards.map((c: { term: string }) => c.term).sort()).toEqual(["café", "collate"]);
  });

  test("an invalid row returns 400 with line details and creates nothing", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const folder = await createFolder(s, base, "Words");
    const res = await s.request.post(`${base}/api/cards/batch`, {
      data: {
        folderId: folder.id,
        cards: [
          { term: "ok", definition: "ok" },
          { term: "", definition: "x" },
          { term: "x", definition: "y".repeat(1001) },
        ],
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.map((d: { line: number }) => d.line)).toEqual([2, 3]);
    expect(body.error.fields).toBeUndefined();
    expect(await prisma.card.count({ where: { folderId: folder.id } })).toBe(0);
    expect(
      await prisma.schedulingRecord.count({ where: { card: { folderId: folder.id } } })
    ).toBe(0);
  });

  test("0 rows and more than 200 rows return 400; 200 is accepted", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const folder = await createFolder(s, base, "Words");
    const row = { term: "t", definition: "d" };
    for (const cards of [[], Array(201).fill(row)]) {
      const res = await s.request.post(`${base}/api/cards/batch`, {
        data: { folderId: folder.id, cards },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error.details).toHaveLength(1);
      expect(body.error.fields).toBeUndefined();
    }
    const max = await s.request.post(`${base}/api/cards/batch`, {
      data: { folderId: folder.id, cards: Array(200).fill(row) },
    });
    expect(max.status()).toBe(201);
    expect(await prisma.card.count({ where: { folderId: folder.id } })).toBe(200);
  });

  test("a foreign or unknown Folder returns 404", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const folder = await createFolder(owner, base, "Private");
    const cards = [{ term: "t", definition: "d" }];

    for (const folderId of [folder.id, "does-not-exist"]) {
      const res = await other.request.post(`${base}/api/cards/batch`, {
        data: { folderId, cards },
      });
      expect(res.status()).toBe(404);
    }
    expect((await other.request.get(`${base}/api/folders/${folder.id}`)).status()).toBe(404);
    expect(await prisma.card.count({ where: { folderId: folder.id } })).toBe(0);
  });

  test("a malformed body returns 400", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const res = await s.request.post(`${base}/api/cards/batch`, {
      data: { cards: "nope" },
    });
    expect(res.status()).toBe(400);
  });
});

// spec-2-4: Edit a Card.
test.describe("PATCH /api/cards/:id", () => {
  async function seedCard(s: Session, base: string) {
    const folder = await createFolder(s, base, "Words");
    await s.request.post(`${base}/api/cards/batch`, {
      data: {
        folderId: folder.id,
        cards: [{ term: "old", definition: "old def", example: "ex", context: "ctx" }],
      },
    });
    const card = await prisma.card.findFirstOrThrow({ where: { folderId: folder.id } });
    return { folder, card };
  }

  test("replaces fields, clears optionals, keeps Unicode and Scheduling Records", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const { folder, card } = await seedCard(s, base);
    const snapshot = () =>
      prisma.schedulingRecord.findMany({
        where: { cardId: card.id },
        orderBy: { direction: "asc" },
      });
    const before = await snapshot();
    expect(before).toHaveLength(2);

    const res = await s.request.patch(`${base}/api/cards/${card.id}`, {
      data: {
        term: "  café ",
        definition: "/ˈkɒl.ə.keɪt/ 日本語",
        example: "",
        partOfSpeech: "noun",
      },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toEqual({
      id: card.id,
      term: "café",
      definition: "/ˈkɒl.ə.keɪt/ 日本語",
      example: null,
      context: null,
      partOfSpeech: "noun",
    });

    const after = await prisma.card.findUniqueOrThrow({ where: { id: card.id } });
    expect(after).toMatchObject({
      term: "café",
      example: null,
      context: null,
      folderId: folder.id,
    });
    expect(after.createdAt.getTime()).toBe(card.createdAt.getTime());
    expect(await snapshot()).toEqual(before);
  });

  test("empty or over-length fields return 400 fields and change nothing", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const { card } = await seedCard(s, base);
    const cases: [Record<string, string>, string][] = [
      [{ term: "   ", definition: "d" }, "term"],
      [{ term: "t", definition: "" }, "definition"],
      [{ term: "t".repeat(201), definition: "d" }, "term"],
    ];
    for (const [data, field] of cases) {
      const res = await s.request.patch(`${base}/api/cards/${card.id}`, { data });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.fields[field]).toBeTruthy();
      expect(body.error.details).toBeUndefined();
    }
    const row = await prisma.card.findUniqueOrThrow({ where: { id: card.id } });
    expect(row.term).toBe("old");
    expect(row.definition).toBe("old def");
  });

  test("foreign or unknown Card 404, unauthenticated 401, bad JSON 400", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const { card } = await seedCard(owner, base);
    const data = { term: "hacked", definition: "x" };

    for (const id of [card.id, "does-not-exist"]) {
      expect((await other.request.patch(`${base}/api/cards/${id}`, { data })).status()).toBe(404);
    }
    expect((await prisma.card.findUniqueOrThrow({ where: { id: card.id } })).term).toBe("old");

    const anon = await playwright.request.newContext();
    expect((await anon.patch(`${base}/api/cards/${card.id}`, { data })).status()).toBe(401);

    const bad = await owner.request.patch(`${base}/api/cards/${card.id}`, {
      headers: { "Content-Type": "application/json" },
      data: Buffer.from("{not json"),
    });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error.code).toBe("INVALID_JSON");
  });
});

// spec-2-5: Delete a Card.
test.describe("DELETE /api/cards/:id", () => {
  async function seedTwo(s: Session, base: string) {
    const folder = await createFolder(s, base, "Words");
    await s.request.post(`${base}/api/cards/batch`, {
      data: {
        folderId: folder.id,
        cards: [
          { term: "gone", definition: "x" },
          { term: "stays", definition: "y" },
        ],
      },
    });
    const gone = await prisma.card.findFirstOrThrow({
      where: { folderId: folder.id, term: "gone" },
    });
    const stays = await prisma.card.findFirstOrThrow({
      where: { folderId: folder.id, term: "stays" },
    });
    return { folder, gone, stays };
  }

  test("removes the Card and both Scheduling Records, siblings untouched, second delete 404", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const { gone, stays } = await seedTwo(s, base);
    expect(await prisma.schedulingRecord.count({ where: { cardId: gone.id } })).toBe(2);

    const res = await s.request.delete(`${base}/api/cards/${gone.id}`);
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toEqual({ id: gone.id });
    expect(await prisma.card.findUnique({ where: { id: gone.id } })).toBeNull();
    expect(await prisma.schedulingRecord.count({ where: { cardId: gone.id } })).toBe(0);
    // Not in any due queue: no Scheduling Record remains for it.
    expect(
      await prisma.schedulingRecord.count({
        where: { cardId: gone.id, nextReviewDate: { lte: new Date() } },
      })
    ).toBe(0);
    expect(await prisma.card.findUnique({ where: { id: stays.id } })).not.toBeNull();
    expect(await prisma.schedulingRecord.count({ where: { cardId: stays.id } })).toBe(2);

    expect((await s.request.delete(`${base}/api/cards/${gone.id}`)).status()).toBe(404);
  });

  test("foreign or unknown Card 404 and intact, unauthenticated 401", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const { gone } = await seedTwo(owner, base);

    for (const id of [gone.id, "does-not-exist"]) {
      expect((await other.request.delete(`${base}/api/cards/${id}`)).status()).toBe(404);
    }
    expect(await prisma.card.findUnique({ where: { id: gone.id } })).not.toBeNull();
    expect(await prisma.schedulingRecord.count({ where: { cardId: gone.id } })).toBe(2);

    const anon = await playwright.request.newContext();
    expect((await anon.delete(`${base}/api/cards/${gone.id}`)).status()).toBe(401);
  });
});

// spec-2-6: Move a Card.
test.describe("POST /api/cards/:id/move", () => {
  async function seedCard(s: Session, base: string) {
    const from = await createFolder(s, base, "From");
    await s.request.post(`${base}/api/cards/batch`, {
      data: { folderId: from.id, cards: [{ term: "mover", definition: "x" }] },
    });
    const card = await prisma.card.findFirstOrThrow({ where: { folderId: from.id } });
    return { from, card };
  }

  async function counts(s: Session, base: string) {
    const res = await s.request.get(`${base}/api/classes`);
    const list = (await res.json()).data as {
      id: string;
      folderCount: number;
      cardCount: number;
    }[];
    return list;
  }

  test("moves within a Class and across Classes, Scheduling Records unchanged", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const { from, card } = await seedCard(s, base);
    const before = await prisma.schedulingRecord.findMany({
      where: { cardId: card.id },
      orderBy: { direction: "asc" },
    });
    const fromFolder = await prisma.folder.findUniqueOrThrow({ where: { id: from.id } });

    // Same Class: the Class's Unsorted Folder.
    const unsorted = await prisma.folder.findFirstOrThrow({
      where: { classId: fromFolder.classId, isUnsorted: true },
    });
    let res = await s.request.post(`${base}/api/cards/${card.id}/move`, {
      data: { folderId: unsorted.id },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toEqual({ id: card.id, folderId: unsorted.id });
    expect((await prisma.card.findUniqueOrThrow({ where: { id: card.id } })).folderId).toBe(
      unsorted.id
    );

    // Another Class.
    const other = await createFolder(s, base, "Elsewhere");
    res = await s.request.post(`${base}/api/cards/${card.id}/move`, {
      data: { folderId: other.id },
    });
    expect(res.status()).toBe(200);
    const after = await prisma.card.findUniqueOrThrow({
      where: { id: card.id },
      include: { schedulingRecords: { orderBy: { direction: "asc" } } },
    });
    expect(after.folderId).toBe(other.id);
    expect(after.term).toBe("mover");
    expect(after.createdAt).toEqual(card.createdAt);
    expect(after.schedulingRecords).toEqual(before);

    const detail = await (await s.request.get(`${base}/api/folders/${other.id}`)).json();
    expect(detail.data.cards.map((c: { id: string }) => c.id)).toEqual([card.id]);
    const old = await (await s.request.get(`${base}/api/folders/${from.id}`)).json();
    expect(old.data.cards).toEqual([]);

    const otherFolder = await prisma.folder.findUniqueOrThrow({ where: { id: other.id } });
    const list = await counts(s, base);
    expect(list.find((c) => c.id === otherFolder.classId)?.cardCount).toBe(1);
    expect(list.find((c) => c.id === fromFolder.classId)?.cardCount).toBe(0);
  });

  test("moving to the current Folder is a no-op 200", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const { from, card } = await seedCard(s, base);
    const res = await s.request.post(`${base}/api/cards/${card.id}/move`, {
      data: { folderId: from.id },
    });
    expect(res.status()).toBe(200);
    expect((await prisma.card.findUniqueOrThrow({ where: { id: card.id } })).folderId).toBe(
      from.id
    );
  });

  test("foreign or unknown Card and Folder return 404 and change nothing", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const { from, card } = await seedCard(owner, base);
    const mine = await createFolder(owner, base, "Mine");
    const theirs = await createFolder(other, base, "Theirs");

    let res = await other.request.post(`${base}/api/cards/${card.id}/move`, {
      data: { folderId: theirs.id },
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).error.message).toBe("Card not found.");
    res = await owner.request.post(`${base}/api/cards/does-not-exist/move`, {
      data: { folderId: mine.id },
    });
    expect(res.status()).toBe(404);

    for (const folderId of [theirs.id, "does-not-exist"]) {
      res = await owner.request.post(`${base}/api/cards/${card.id}/move`, {
        data: { folderId },
      });
      expect(res.status()).toBe(404);
      expect((await res.json()).error.message).toBe("Folder not found.");
      expect((await res.json()).error.code).toBe("FOLDER_NOT_FOUND");
    }
    expect((await prisma.card.findUniqueOrThrow({ where: { id: card.id } })).folderId).toBe(
      from.id
    );
  });

  test("bad body 400, unauthenticated 401", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const { card } = await seedCard(s, base);
    for (const data of [{}, { folderId: 5 }, { folderId: "" }]) {
      const res = await s.request.post(`${base}/api/cards/${card.id}/move`, { data });
      expect(res.status()).toBe(400);
    }
    const bad = await s.request.post(`${base}/api/cards/${card.id}/move`, {
      headers: { "Content-Type": "application/json" },
      data: Buffer.from("{not json"),
    });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error.code).toBe("INVALID_JSON");

    const anon = await playwright.request.newContext();
    const res = await anon.post(`${base}/api/cards/${card.id}/move`, {
      data: { folderId: "x" },
    });
    expect(res.status()).toBe(401);
  });
});
