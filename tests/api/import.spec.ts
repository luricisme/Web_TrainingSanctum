import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";
/** Default separators: Tab between term and definition, one card per line. */
const TAB = { termSeparator: { kind: "tab" }, cardSeparator: { kind: "newline" } };

interface Session {
  request: APIRequestContext;
  userId: string;
}

async function newUser(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  base: string
): Promise<Session> {
  const request = await playwright.request.newContext();
  const email = `import-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Import Test", timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id };
}

async function createFlashcard(s: Session, base: string, name: string) {
  const cls = await s.request.post(`${base}/api/classes`, { data: { name: "C" } });
  const classId = (await cls.json()).data.id as string;
  const folderRes = await s.request.post(`${base}/api/classes/${classId}/folders`, {
    data: { name: "F" },
  });
  const folderId = (await folderRes.json()).data.id as string;
  const res = await s.request.post(`${base}/api/folders/${folderId}/flashcards`, {
    data: { name },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data as { id: string };
}

async function addCards(s: Session, base: string, flashcardId: string, terms: string[]) {
  const res = await s.request.post(`${base}/api/cards/batch`, {
    data: { flashcardId, cards: terms.map((term) => ({ term, definition: "d" })) },
  });
  expect(res.status()).toBe(201);
}

const count = (flashcardId: string) => prisma.card.count({ where: { flashcardId } });

// spec-3-1: Paste import preview.
test.describe("POST /api/import/parse", () => {
  test("requires a session", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const ctx = await playwright.request.newContext();
    const res = await ctx.post(`${base}/api/import/parse`, {
      data: { flashcardId: "x", ...TAB, text: "a\tb" },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("a foreign or unknown Flashcard returns 404", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const flashcard = await createFlashcard(owner, base, "Private");
    for (const flashcardId of [flashcard.id, "does-not-exist"]) {
      const res = await other.request.post(`${base}/api/import/parse`, {
        data: { flashcardId, ...TAB, text: "a\tb" },
      });
      expect(res.status()).toBe(404);
      expect((await res.json()).error.code).toBe("NOT_FOUND");
    }
  });

  test("returns rows with lines, problems and duplicate flags; writes nothing", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcard = await createFlashcard(s, base, "Words");
    await addCards(s, base, flashcard.id, ["apple"]);

    const text = ["Apple \tquả táo", "", "banana", "cat\t/kæt/", "\tno term", "Cat\tmèo"].join(
      "\n"
    );
    const res = await s.request.post(`${base}/api/import/parse`, {
      data: { flashcardId: flashcard.id, ...TAB, text },
    });
    expect(res.status()).toBe(200);
    const { rows } = (await res.json()).data;
    const none = { duplicateOfLine: null };
    expect(rows).toEqual([
      { line: 1, card: 1, term: "Apple", definition: "quả táo", duplicate: true, ...none },
      {
        line: 3,
        card: 2,
        term: "banana",
        definition: "",
        error: "No separator found",
        errorField: "definition",
        duplicate: false,
        ...none,
      },
      { line: 4, card: 3, term: "cat", definition: "/kæt/", duplicate: false, ...none },
      {
        line: 5,
        card: 4,
        term: "",
        definition: "no term",
        error: "Term is required",
        errorField: "term",
        duplicate: false,
        ...none,
      },
      {
        line: 6,
        card: 5,
        term: "Cat",
        definition: "mèo",
        duplicate: true,
        duplicateOfLine: 4,
      },
    ]);
    expect(await count(flashcard.id)).toBe(1);
  });

  test("more than 200 cards returns 400 VALIDATION_ERROR", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcard = await createFlashcard(s, base, "Words");
    const text = Array.from({ length: 201 }, (_, i) => `t${i}\td`).join("\n");
    const res = await s.request.post(`${base}/api/import/parse`, {
      data: { flashcardId: flashcard.id, ...TAB, text },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Paste at most 200 cards per import.");
    expect(body.data).toBeUndefined();
  });
});

// spec-3-1b: term and card separators.
test.describe("POST /api/import/parse (separators)", () => {
  test("custom - with semicolon splits a-b;c-d into two cards", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcard = await createFlashcard(s, base, "Words");
    const res = await s.request.post(`${base}/api/import/parse`, {
      data: {
        flashcardId: flashcard.id,
        termSeparator: { kind: "custom", custom: "-" },
        cardSeparator: { kind: "semicolon" },
        text: "a-b;c-d",
      },
    });
    expect(res.status()).toBe(200);
    const none = { duplicate: false, duplicateOfLine: null };
    expect((await res.json()).data.rows).toEqual([
      { line: 1, card: 1, term: "a", definition: "b", ...none },
      { line: 1, card: 2, term: "c", definition: "d", ...none },
    ]);
    expect(await count(flashcard.id)).toBe(0);
  });

  test("an empty Custom or equal separators return 400 with the inline message", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcard = await createFlashcard(s, base, "Words");
    const cases = [
      {
        body: { termSeparator: { kind: "custom", custom: "" }, cardSeparator: { kind: "newline" } },
        message: "Enter a separator.",
      },
      {
        body: { termSeparator: { kind: "custom", custom: ";" }, cardSeparator: { kind: "semicolon" } },
        message: "Use different separators for terms and cards.",
      },
    ];
    for (const { body, message } of cases) {
      const res = await s.request.post(`${base}/api/import/parse`, {
        data: { flashcardId: flashcard.id, text: "a;b", ...body },
      });
      expect(res.status()).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
      expect(json.error.message).toBe(message);
    }
  });

  test("201 cards on one line with ; returns 400", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcard = await createFlashcard(s, base, "Words");
    const text = Array.from({ length: 201 }, (_, i) => `t${i}-d`).join(";");
    const res = await s.request.post(`${base}/api/import/parse`, {
      data: {
        flashcardId: flashcard.id,
        termSeparator: { kind: "custom", custom: "-" },
        cardSeparator: { kind: "semicolon" },
        text,
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.message).toBe("Paste at most 200 cards per import.");
  });
});

// spec-3-1: Import commit through POST /api/cards/batch with source "import".
test.describe("POST /api/cards/batch (source: import)", () => {
  test("saves valid rows, skips duplicates and reports errors by line", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcard = await createFlashcard(s, base, "Words");
    await addCards(s, base, flashcard.id, ["apple"]);

    const res = await s.request.post(`${base}/api/cards/batch`, {
      data: {
        flashcardId: flashcard.id,
        source: "import",
        cards: [
          { line: 1, term: "café", definition: "/kaˈfeɪ/ 日本語" },
          { line: 2, term: " APPLE ", definition: "quả táo" },
          { line: 3, term: "banana", definition: "" },
          { line: 4, term: "dog", definition: "chó", example: "", partOfSpeech: "noun" },
          { line: 9, term: "Dog", definition: "con chó" },
          { line: null, term: "x".repeat(201), definition: "long" },
        ],
      },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toEqual({
      created: 2,
      duplicates: [
        { line: 2, term: "APPLE" },
        { line: 9, term: "Dog" },
      ],
      errors: [
        { line: 3, reason: "Definition is required" },
        { line: null, reason: "Use 200 characters or fewer." },
      ],
    });

    const cards = await prisma.card.findMany({
      where: { flashcardId: flashcard.id },
      include: { schedulingRecords: true },
    });
    expect(cards.map((c) => c.term).sort()).toEqual(["apple", "café", "dog"]);
    const cafe = cards.find((c) => c.term === "café")!;
    expect(cafe.definition).toBe("/kaˈfeɪ/ 日本語");
    for (const card of cards) {
      expect(card.schedulingRecords.map((r) => r.direction).sort()).toEqual([
        "DEFINITION_TO_TERM",
        "TERM_TO_DEFINITION",
      ]);
    }
  });

  test("re-checks duplicates at Save against Cards added after Preview", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcard = await createFlashcard(s, base, "Words");

    const preview = await s.request.post(`${base}/api/import/parse`, {
      data: {
        flashcardId: flashcard.id,
        termSeparator: { kind: "custom", custom: " — " },
        cardSeparator: { kind: "newline" },
        text: "storm — bão\nrain — mưa",
      },
    });
    const { rows } = (await preview.json()).data;
    expect(rows.every((r: { duplicate: boolean }) => !r.duplicate)).toBe(true);

    // Added between Preview and Save.
    await addCards(s, base, flashcard.id, ["Storm"]);

    const res = await s.request.post(`${base}/api/cards/batch`, {
      data: {
        flashcardId: flashcard.id,
        source: "import",
        cards: rows.map((r: { line: number; term: string; definition: string }) => ({
          line: r.line,
          term: r.term,
          definition: r.definition,
        })),
      },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toEqual({
      created: 1,
      duplicates: [{ line: 1, term: "storm" }],
      errors: [],
    });
    expect(await count(flashcard.id)).toBe(2);
  });

  test("all malformed rows: created 0, every row under errors", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcard = await createFlashcard(s, base, "Words");
    const res = await s.request.post(`${base}/api/cards/batch`, {
      data: {
        flashcardId: flashcard.id,
        source: "import",
        cards: [
          { line: 1, term: "a", definition: "" },
          { line: 2, term: "", definition: "b" },
          { line: 4, term: "c", definition: " " },
          { line: 5, term: "d" },
        ],
      },
    });
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    expect(data.created).toBe(0);
    expect(data.duplicates).toEqual([]);
    expect(data.errors.map((e: { line: number }) => e.line)).toEqual([1, 2, 4, 5]);
    expect(await count(flashcard.id)).toBe(0);
  });

  test("a foreign Flashcard returns 404 and creates nothing", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const flashcard = await createFlashcard(owner, base, "Private");
    const res = await other.request.post(`${base}/api/cards/batch`, {
      data: {
        flashcardId: flashcard.id,
        source: "import",
        cards: [{ line: 1, term: "t", definition: "d" }],
      },
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
    expect(await count(flashcard.id)).toBe(0);
  });

  test("30 valid rows save with two Scheduling Records each", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcard = await createFlashcard(s, base, "Words");
    const text = Array.from({ length: 30 }, (_, i) => `word${i}\tdefinition ${i}`).join("\n");

    const started = Date.now();
    const preview = await s.request.post(`${base}/api/import/parse`, {
      data: { flashcardId: flashcard.id, ...TAB, text },
    });
    const { rows } = (await preview.json()).data;
    const res = await s.request.post(`${base}/api/cards/batch`, {
      data: { flashcardId: flashcard.id, source: "import", cards: rows },
    });
    expect(Date.now() - started).toBeLessThan(5000);
    expect((await res.json()).data).toMatchObject({ created: 30 });
    expect(await count(flashcard.id)).toBe(30);
    expect(
      await prisma.schedulingRecord.count({ where: { card: { flashcardId: flashcard.id } } })
    ).toBe(60);
  });
});

// spec-3-2: File import preview. The browser sends the grid it read from the
// file plus the column mapping; nothing is written.
test.describe("POST /api/import/parse with source: file", () => {
  const NONE = { example: null, context: null, partOfSpeech: null };
  const mapping = (m: Record<string, number | null>) => ({ ...NONE, ...m });
  const fileBody = (flashcardId: string, patch: Record<string, unknown> = {}) => ({
    source: "file",
    flashcardId,
    hasHeader: true,
    grid: [
      ["pos", "meaning", "word"],
      ["noun", "quả táo", "apple"],
      ["", "", ""],
      ["verb", "", "run"],
    ],
    mapping: mapping({ term: 2, definition: 1, partOfSpeech: 0 }),
    ...patch,
  });

  test("requires a session", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const ctx = await playwright.request.newContext();
    const res = await ctx.post(`${base}/api/import/parse`, { data: fileBody("x") });
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("a foreign or unknown Flashcard returns 404", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const owner = await newUser(playwright, base);
    const other = await newUser(playwright, base);
    const flashcard = await createFlashcard(owner, base, "Private");
    for (const flashcardId of [flashcard.id, "does-not-exist"]) {
      const res = await other.request.post(`${base}/api/import/parse`, {
        data: fileBody(flashcardId),
      });
      expect(res.status()).toBe(404);
      expect((await res.json()).error.code).toBe("NOT_FOUND");
    }
  });

  test("returns rows by spreadsheet row with all five fields; writes nothing", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcard = await createFlashcard(s, base, "Words");
    await addCards(s, base, flashcard.id, ["Apple"]);
    const res = await s.request.post(`${base}/api/import/parse`, {
      data: fileBody(flashcard.id),
    });
    expect(res.status()).toBe(200);
    const { rows } = (await res.json()).data;
    expect(rows).toEqual([
      {
        line: 2,
        card: 1,
        term: "apple",
        definition: "quả táo",
        example: "",
        context: "",
        partOfSpeech: "noun",
        duplicate: true,
        duplicateOfLine: null,
      },
      {
        line: 4,
        card: 2,
        term: "run",
        definition: "",
        example: "",
        context: "",
        partOfSpeech: "verb",
        error: "Definition is required",
        errorField: "definition",
        duplicate: false,
        duplicateOfLine: null,
      },
    ]);
    expect(await count(flashcard.id)).toBe(1);
  });

  test("without a header the first row is line 1", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcard = await createFlashcard(s, base, "Words");
    const res = await s.request.post(`${base}/api/import/parse`, {
      data: fileBody(flashcard.id, {
        hasHeader: false,
        grid: [["apple", "táo"], ["pear", "lê"]],
        mapping: mapping({ term: 0, definition: 1 }),
      }),
    });
    expect(res.status()).toBe(200);
    const { rows } = (await res.json()).data;
    expect(rows.map((r: { line: number; term: string }) => [r.line, r.term])).toEqual([
      [1, "apple"],
      [2, "pear"],
    ]);
    expect(await count(flashcard.id)).toBe(0);
  });

  test("mapping, empty and over-limit errors return 400", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcard = await createFlashcard(s, base, "Words");
    const cases: [Record<string, unknown>, string][] = [
      [{ mapping: mapping({ term: null, definition: 1 }) }, "Map a column to Term."],
      [{ mapping: mapping({ term: 0, definition: 0 }) }, "Each column can be mapped once."],
      [
        { grid: [["term", "definition"]], mapping: mapping({ term: 0, definition: 1 }) },
        "This file has no rows to import.",
      ],
      [{ mapping: mapping({ term: 5, definition: 1 }) }, "Choose a column from the file."],
      [
        {
          grid: [["t", "d"], ...Array.from({ length: 201 }, (_, i) => [`t${i}`, "d"])],
          mapping: mapping({ term: 0, definition: 1 }),
        },
        "Upload at most 200 rows per import.",
      ],
    ];
    for (const [patch, message] of cases) {
      const res = await s.request.post(`${base}/api/import/parse`, {
        data: fileBody(flashcard.id, patch),
      });
      expect(res.status()).toBe(400);
      const { error } = await res.json();
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.message).toBe(message);
    }
    expect(await count(flashcard.id)).toBe(0);
  });

  test("30 file rows save with every mapped field and two Scheduling Records each", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcard = await createFlashcard(s, base, "Words");
    const grid = [
      ["Definition", "Example", "Term", "Context", "POS"],
      ...Array.from({ length: 30 }, (_, i) => [`def ${i}`, `ex ${i}`, `w${i}`, `ctx ${i}`, "noun"]),
    ];
    const started = Date.now();
    const preview = await s.request.post(`${base}/api/import/parse`, {
      data: fileBody(flashcard.id, {
        grid,
        mapping: { term: 2, definition: 0, example: 1, context: 3, partOfSpeech: 4 },
      }),
    });
    const { rows } = (await preview.json()).data;
    const res = await s.request.post(`${base}/api/cards/batch`, {
      data: { flashcardId: flashcard.id, source: "import", cards: rows },
    });
    expect(Date.now() - started).toBeLessThan(5000);
    expect((await res.json()).data).toMatchObject({ created: 30 });
    const card = await prisma.card.findFirstOrThrow({
      where: { flashcardId: flashcard.id, term: "w7" },
    });
    expect(card).toMatchObject({
      definition: "def 7",
      example: "ex 7",
      context: "ctx 7",
      partOfSpeech: "noun",
    });
    expect(
      await prisma.schedulingRecord.count({ where: { card: { flashcardId: flashcard.id } } })
    ).toBe(60);
  });

  test("all-malformed rows save nothing and report every row", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const s = await newUser(playwright, base);
    const flashcard = await createFlashcard(s, base, "Words");
    const preview = await s.request.post(`${base}/api/import/parse`, {
      data: fileBody(flashcard.id, {
        grid: [["t", "d"], ["a", ""], ["", "b"]],
        mapping: mapping({ term: 0, definition: 1 }),
      }),
    });
    const { rows } = (await preview.json()).data;
    const res = await s.request.post(`${base}/api/cards/batch`, {
      data: { flashcardId: flashcard.id, source: "import", cards: rows },
    });
    expect((await res.json()).data).toEqual({
      created: 0,
      duplicates: [],
      errors: [
        { line: 2, reason: "Definition is required" },
        { line: 3, reason: "Term is required" },
      ],
    });
  });
});
