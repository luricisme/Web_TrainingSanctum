import { describe, expect, it } from "vitest";
import {
  CARD_TERM_MAX_LENGTH,
  IMPORT_DELIMITERS,
  IMPORT_LINE_LIMIT_MESSAGE,
  IMPORT_TEXT_TOO_LONG_MESSAGE,
  MAX_CARDS_PER_BATCH,
  MAX_IMPORT_LINES,
  MAX_IMPORT_TEXT_LENGTH,
  createCardsBatchSchema,
  detectDuplicates,
  importCardLineSchema,
  importParseSchema,
  normalizeTermKey,
  parseImportBlock,
  previewImport,
  validateImportCard,
} from "@training-sanctum/domain";

describe("parseImportBlock (spec-3-1)", () => {
  it("happy path: Tab splits Term and Definition and keeps Unicode", () => {
    expect(parseImportBlock("apple\tquả táo", "tab")).toEqual([
      { line: 1, term: "apple", definition: "quả táo" },
    ]);
  });

  it("keeps IPA, accents and non-Latin scripts exactly, trimming only the sides", () => {
    expect(parseImportBlock("  café \t /ˈkɒl.ə.keɪt/ 日本語  ", "tab")).toEqual([
      { line: 1, term: "café", definition: "/ˈkɒl.ə.keɪt/ 日本語" },
    ]);
  });

  it("a line without the delimiter is a row with 'No delimiter found'", () => {
    const rows = parseImportBlock("a\tb\n\nbanana", "tab");
    expect(rows[1]).toEqual({
      line: 3,
      term: "banana",
      definition: "",
      error: "No delimiter found",
      errorField: "definition",
    });
  });

  it("an empty side is 'Term is required' / 'Definition is required'", () => {
    expect(parseImportBlock("\tdef", "tab")[0]).toMatchObject({
      term: "",
      definition: "def",
      error: "Term is required",
      errorField: "term",
    });
    expect(parseImportBlock("term\t", "tab")[0]).toMatchObject({
      term: "term",
      definition: "",
      error: "Definition is required",
      errorField: "definition",
    });
  });

  it("an over-long Term uses the cardInputSchema message", () => {
    const long = "x".repeat(CARD_TERM_MAX_LENGTH + 1);
    expect(parseImportBlock(`${long}\tdef`, "tab")[0]).toMatchObject({
      error: `Use ${CARD_TERM_MAX_LENGTH} characters or fewer.`,
      errorField: "term",
    });
  });

  it("splits on the first delimiter only", () => {
    expect(parseImportBlock("a\tb\tc", "tab")).toEqual([
      { line: 1, term: "a", definition: "b\tc" },
    ]);
    expect(parseImportBlock("ratio: 3:4", "colon")[0]).toMatchObject({
      term: "ratio",
      definition: "3:4",
    });
  });

  it("blank lines produce no row but still count for line numbers", () => {
    const rows = parseImportBlock("one\t1\n\nthree\t3\n   \n\t\nsix\t6\r\nseven\t7", "tab");
    expect(rows.map((r) => r.line)).toEqual([1, 3, 6, 7]);
  });

  it("supports every offered delimiter", () => {
    const samples: Record<string, string> = {
      tab: "rain\theavy rain",
      "em-dash": "rain — heavy rain",
      hyphen: "rain - heavy rain",
      colon: "rain: heavy rain",
      comma: "rain, heavy rain",
      semicolon: "rain; heavy rain",
    };
    expect(IMPORT_DELIMITERS.map((d) => d.id)).toEqual(Object.keys(samples));
    for (const d of IMPORT_DELIMITERS) {
      expect(parseImportBlock(samples[d.id]!, d.id)).toEqual([
        { line: 1, term: "rain", definition: "heavy rain" },
      ]);
    }
    // The spaced hyphen does not split a hyphenated word.
    expect(parseImportBlock("well-known - famous", "hyphen")[0]).toMatchObject({
      term: "well-known",
      definition: "famous",
    });
  });

  it("all malformed lines still produce one row each with a reason", () => {
    const rows = parseImportBlock("a\nb\n\tc\nd\t", "tab");
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.error)).toBe(true);
  });
});

describe("normalizeTermKey and detectDuplicates (spec-3-1)", () => {
  it("compares trimmed Terms case-insensitively", () => {
    expect(normalizeTermKey("  Apple ")).toBe("apple");
    expect(detectDuplicates([{ term: "Apple " }, { term: "pear" }], ["apple"])).toEqual([
      { duplicate: true, duplicateOf: null },
      { duplicate: false, duplicateOf: null },
    ]);
  });

  it("matches NFC and NFD forms of the same Term without changing the text", () => {
    const nfd = "café";
    expect(normalizeTermKey(nfd)).toBe(normalizeTermKey("café"));
    expect(detectDuplicates([{ term: nfd }], ["Café"])[0]).toEqual({
      duplicate: true,
      duplicateOf: null,
    });
    expect(parseImportBlock(`${nfd}	coffee`, "tab")[0]!.term).toBe(nfd);
  });

  it("flags a later repeat within the paste as a duplicate of the earlier row", () => {
    const flags = detectDuplicates(
      [{ term: "dog" }, { term: "cat" }, { term: "Cat" }],
      []
    );
    expect(flags[2]).toEqual({ duplicate: true, duplicateOf: 1 });
    expect(flags[1]).toEqual({ duplicate: false, duplicateOf: null });
  });

  it("a malformed row never makes a later valid row a repeat", () => {
    const flags = detectDuplicates(
      [{ term: "cat", error: "Definition is required" }, { term: "cat" }],
      []
    );
    expect(flags[1]).toEqual({ duplicate: false, duplicateOf: null });
  });

  it("never flags an empty Term", () => {
    expect(detectDuplicates([{ term: "" }, { term: " " }], [""])).toEqual([
      { duplicate: false, duplicateOf: null },
      { duplicate: false, duplicateOf: null },
    ]);
  });
});

describe("previewImport (spec-3-1)", () => {
  it("flags Terms already in the Flashcard", () => {
    const rows = previewImport("Apple \tquả táo\npear\tlê", "tab", ["apple"]);
    expect(rows[0]).toMatchObject({ term: "Apple", duplicate: true, duplicateOfLine: null });
    expect(rows[1]).toMatchObject({ term: "pear", duplicate: false });
  });

  it("reports a repeat by the earlier source line", () => {
    const text = ["x\t1", "cat\tmèo", "", "", "", "", "", "", "Cat\tcon mèo"].join("\n");
    const rows = previewImport(text, "tab", []);
    const nine = rows.find((r) => r.line === 9);
    expect(nine).toMatchObject({ duplicate: true, duplicateOfLine: 2 });
  });
});

describe("importParseSchema (spec-3-1)", () => {
  const base = { flashcardId: "f1", delimiter: "tab" as const };

  it("accepts up to 200 non-blank lines, blank lines not counted", () => {
    const lines = Array.from({ length: MAX_IMPORT_LINES }, (_, i) => `t${i}\td`);
    const text = lines.join("\n\n");
    expect(importParseSchema.safeParse({ ...base, text }).success).toBe(true);
  });

  it("rejects 201 non-blank lines", () => {
    const text = Array.from({ length: MAX_IMPORT_LINES + 1 }, (_, i) => `t${i}\td`).join("\n");
    const parsed = importParseSchema.safeParse({ ...base, text });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(IMPORT_LINE_LIMIT_MESSAGE);
    expect(IMPORT_LINE_LIMIT_MESSAGE).toBe("Paste at most 200 lines per import.");
  });

  it("the line limit follows the batch limit", () => {
    expect(MAX_IMPORT_LINES).toBe(MAX_CARDS_PER_BATCH);
  });

  it("a long paste with few lines gets its own message", () => {
    const text = `t	${"x".repeat(MAX_IMPORT_TEXT_LENGTH)}`;
    const parsed = importParseSchema.safeParse({ ...base, text });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(IMPORT_TEXT_TOO_LONG_MESSAGE);
  });

  it("rejects an empty paste, an unknown delimiter and a missing flashcard", () => {
    expect(importParseSchema.safeParse({ ...base, text: "\n  \n" }).success).toBe(false);
    expect(
      importParseSchema.safeParse({ ...base, delimiter: "pipe", text: "a|b" }).success
    ).toBe(false);
    expect(importParseSchema.safeParse({ delimiter: "tab", text: "a\tb" }).success).toBe(false);
  });
});

describe("import commit helpers (spec-3-1)", () => {
  it("validateImportCard uses the import reasons and Card rules", () => {
    expect(validateImportCard({ term: " ", definition: "d" })).toEqual({
      ok: false,
      problem: { field: "term", message: "Term is required" },
    });
    expect(validateImportCard({ term: "t", definition: "" })).toEqual({
      ok: false,
      problem: { field: "definition", message: "Definition is required" },
    });
    expect(validateImportCard({ term: " t ", definition: "d", example: "" })).toEqual({
      ok: true,
      card: { term: "t", definition: "d", example: null, context: null, partOfSpeech: null },
    });
  });

  it("the batch schema takes an optional source; import rows carry a line", () => {
    const body = { flashcardId: "f", cards: [{ term: "a", definition: "b" }] };
    expect(createCardsBatchSchema.parse(body).source).toBeUndefined();
    expect(createCardsBatchSchema.parse({ ...body, source: "import" }).source).toBe("import");
    expect(createCardsBatchSchema.safeParse({ ...body, source: "csv" }).success).toBe(false);
    expect(importCardLineSchema.parse({ line: 14 }).line).toBe(14);
    expect(importCardLineSchema.parse({ line: null }).line).toBeNull();
    expect(importCardLineSchema.safeParse({ line: 0 }).success).toBe(false);
  });
});
