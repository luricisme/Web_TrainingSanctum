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
