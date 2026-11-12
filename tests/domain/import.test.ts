import { describe, expect, it } from "vitest";
import {
  CARD_SEPARATORS,
  CARD_TERM_MAX_LENGTH,
  DEFAULT_IMPORT_SEPARATORS,
  IMPORT_CARD_LIMIT_MESSAGE,
  IMPORT_TEXT_TOO_LONG_MESSAGE,
  type ImportSeparators,
  MAX_CARDS_PER_BATCH,
  MAX_IMPORT_CARDS,
  MAX_IMPORT_TEXT_LENGTH,
  TERM_SEPARATORS,
  countImportCards,
  createCardsBatchSchema,
  detectDuplicates,
  importCardLineSchema,
  importParseSchema,
  normalizeTermKey,
  parseImportBlock,
  previewImport,
  resolveSeparators,
  validateImportCard,
} from "@training-sanctum/domain";

const TAB = DEFAULT_IMPORT_SEPARATORS;
const sep = (
  term: ImportSeparators["termSeparator"],
  card: ImportSeparators["cardSeparator"]
): ImportSeparators => ({ termSeparator: term, cardSeparator: card });
const custom = (value: string) => ({ kind: "custom" as const, custom: value });
const SEMI = { kind: "semicolon" } as const;
const NEWLINE = { kind: "newline" } as const;

describe("parseImportBlock (spec-3-1)", () => {
  it("happy path: Tab splits Term and Definition and keeps Unicode", () => {
    expect(parseImportBlock("apple\tquả táo", TAB)).toEqual([
      { line: 1, card: 1, term: "apple", definition: "quả táo" },
    ]);
  });

  it("keeps IPA, accents and non-Latin scripts exactly, trimming only the sides", () => {
    expect(parseImportBlock("  café \t /ˈkɒl.ə.keɪt/ 日本語  ", TAB)).toEqual([
      { line: 1, card: 1, term: "café", definition: "/ˈkɒl.ə.keɪt/ 日本語" },
    ]);
  });

  it("a card without the term separator is a row with 'No separator found'", () => {
    const rows = parseImportBlock("a\tb\n\nbanana", TAB);
    expect(rows[1]).toEqual({
      line: 3,
      card: 2,
      term: "banana",
      definition: "",
      error: "No separator found",
      errorField: "definition",
    });
  });

  it("an empty side is 'Term is required' / 'Definition is required'", () => {
    expect(parseImportBlock("\tdef", TAB)[0]).toMatchObject({
      term: "",
      definition: "def",
      error: "Term is required",
      errorField: "term",
    });
    expect(parseImportBlock("term\t", TAB)[0]).toMatchObject({
      term: "term",
      definition: "",
      error: "Definition is required",
      errorField: "definition",
    });
  });

  it("an over-long Term uses the cardInputSchema message", () => {
    const long = "x".repeat(CARD_TERM_MAX_LENGTH + 1);
    expect(parseImportBlock(`${long}\tdef`, TAB)[0]).toMatchObject({
      error: `Use ${CARD_TERM_MAX_LENGTH} characters or fewer.`,
      errorField: "term",
    });
  });

  it("splits on the first term separator only", () => {
    expect(parseImportBlock("a\tb\tc", TAB)).toEqual([
      { line: 1, card: 1, term: "a", definition: "b\tc" },
    ]);
    expect(parseImportBlock("ratio: 3:4", sep(custom(":"), NEWLINE))[0]).toMatchObject({
      term: "ratio",
      definition: "3:4",
    });
  });

  it("blank lines produce no row but still count for line numbers", () => {
    const rows = parseImportBlock("one\t1\n\nthree\t3\n   \n\t\nsix\t6\r\nseven\t7", TAB);
    expect(rows.map((r) => r.line)).toEqual([1, 3, 6, 7]);
    expect(rows.map((r) => r.card)).toEqual([1, 2, 3, 4]);
  });

  it("offers the Quizlet option sets, Tab and New line first", () => {
    expect(TERM_SEPARATORS.map((s) => s.id)).toEqual(["tab", "comma", "custom"]);
    expect(CARD_SEPARATORS.map((s) => s.id)).toEqual(["newline", "semicolon", "custom"]);
    expect(TAB).toEqual({ termSeparator: { kind: "tab" }, cardSeparator: { kind: "newline" } });
  });

  it("all malformed cards still produce one row each with a reason", () => {
    const rows = parseImportBlock("a\nb\n\tc\nd\t", TAB);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.error)).toBe(true);
  });
});

describe("term and card separators (spec-3-1b)", () => {
  it("custom term + semicolon: a-b;c-d gives Card 1 a/b and Card 2 c/d", () => {
    expect(parseImportBlock("a-b;c-d", sep(custom("-"), SEMI))).toEqual([
      { line: 1, card: 1, term: "a", definition: "b" },
      { line: 1, card: 2, term: "c", definition: "d" },
    ]);
  });

  it("custom both: a:d;b:e gives Card 1 a/d and Card 2 b/e", () => {
    expect(parseImportBlock("a:d;b:e", sep(custom(":"), custom(";")))).toEqual([
      { line: 1, card: 1, term: "a", definition: "d" },
      { line: 1, card: 2, term: "b", definition: "e" },
    ]);
  });

  it("comma + new line splits on the first comma only", () => {
    expect(parseImportBlock("hi,xin chào, bạn", sep({ kind: "comma" }, NEWLINE))).toEqual([
      { line: 1, card: 1, term: "hi", definition: "xin chào, bạn" },
    ]);
  });

  it("line breaks always separate cards too", () => {
    const rows = parseImportBlock("a-b;c-d\ne-f", sep(custom("-"), SEMI));
    expect(rows.map((r) => [r.card, r.line, r.term, r.definition])).toEqual([
      [1, 1, "a", "b"],
      [2, 1, "c", "d"],
      [3, 2, "e", "f"],
    ]);
  });

  it("a trailing or doubled card separator adds no row", () => {
    expect(parseImportBlock("a-b;c-d;", sep(custom("-"), SEMI))).toHaveLength(2);
    expect(parseImportBlock("a-b;; ;c-d", sep(custom("-"), SEMI)).map((r) => r.card)).toEqual([
      1, 2,
    ]);
  });

  it("a card without the term separator reads 'No separator found'", () => {
    expect(parseImportBlock("a-b;cd", sep(custom("-"), SEMI))[1]).toEqual({
      line: 1,
      card: 2,
      term: "cd",
      definition: "",
      error: "No separator found",
      errorField: "definition",
    });
  });

  it("a Custom separator is literal: no trimming, no regex", () => {
    expect(parseImportBlock("a.b - c", sep(custom(" - "), NEWLINE))[0]).toMatchObject({
      term: "a.b",
      definition: "c",
    });
    expect(parseImportBlock("a.b", sep(custom("."), NEWLINE))[0]).toMatchObject({
      term: "a",
      definition: "b",
    });
    expect(parseImportBlock("x|y|z", sep(custom("|"), NEWLINE))[0]).toMatchObject({
      term: "x",
      definition: "y|z",
    });
    // A spaced custom separator does not split a hyphenated word.
    expect(parseImportBlock("well-known - famous", sep(custom(" - "), NEWLINE))[0]).toMatchObject(
      { term: "well-known", definition: "famous" }
    );
  });

  it("an empty Custom separator reads 'Enter a separator.'", () => {
    expect(resolveSeparators(sep(custom(""), NEWLINE))).toEqual({
      ok: false,
      field: "termSeparator",
      message: "Enter a separator.",
    });
    expect(resolveSeparators(sep({ kind: "tab" }, { kind: "custom" }))).toEqual({
      ok: false,
      field: "cardSeparator",
      message: "Enter a separator.",
    });
    expect(() => parseImportBlock("a\tb", sep(custom(""), NEWLINE))).toThrow();
  });

  it("equal or overlapping separators read 'Use different separators…' on the Custom group", () => {
    const clash = "Use different separators for terms and cards.";
    const cases: [ImportSeparators, "termSeparator" | "cardSeparator"][] = [
      // Equal.
      [sep(custom(";"), SEMI), "termSeparator"],
      [sep({ kind: "comma" }, custom(",")), "cardSeparator"],
      [sep(custom("|"), custom("|")), "termSeparator"],
      // One contains the other.
      [sep(custom(";;"), SEMI), "termSeparator"],
      [sep(custom(":;"), SEMI), "termSeparator"],
      [sep(custom(", "), custom(",")), "termSeparator"],
      [sep({ kind: "comma" }, custom(", ")), "cardSeparator"],
      [sep(custom(";"), custom(";;")), "termSeparator"],
    ];
    for (const [choice, field] of cases) {
      expect(resolveSeparators(choice)).toEqual({ ok: false, field, message: clash });
    }
    expect(resolveSeparators(sep(custom("-"), SEMI))).toEqual({ ok: true, term: "-", card: ";" });
    expect(resolveSeparators(sep(custom("--"), custom("|")))).toMatchObject({ ok: true });
    expect(resolveSeparators(TAB)).toEqual({ ok: true, term: "\t", card: null });
  });

  it("a Custom separator with a line break is rejected", () => {
    expect(resolveSeparators(sep(custom("a\nb"), SEMI))).toEqual({
      ok: false,
      field: "termSeparator",
      message: "A separator cannot contain a line break.",
    });
    expect(resolveSeparators(sep({ kind: "tab" }, custom("\r")))).toEqual({
      ok: false,
      field: "cardSeparator",
      message: "A separator cannot contain a line break.",
    });
  });

  it("countImportCards counts the non-blank cards the parser produces", () => {
    expect(countImportCards("a-b;c-d\ne-f;", SEMI)).toBe(3);
    expect(countImportCards("a\tb\n\n  \nc\td", NEWLINE)).toBe(2);
    expect(countImportCards("", NEWLINE)).toBe(0);
    expect(countImportCards("a;b", { kind: "custom", custom: "" })).toBeNull();
    const text = "x-1;y-2\n\nz-3;;w";
    expect(countImportCards(text, SEMI)).toBe(parseImportBlock(text, sep(custom("-"), SEMI)).length);
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
    expect(parseImportBlock(`${nfd}	coffee`, TAB)[0]!.term).toBe(nfd);
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
    const rows = previewImport("Apple \tquả táo\npear\tlê", TAB, ["apple"]);
    expect(rows[0]).toMatchObject({
      term: "Apple",
      duplicate: true,
      duplicateOfLine: null,
    });
    expect(rows[0]).not.toHaveProperty("duplicateOfCard");
    expect(rows[1]).toMatchObject({ term: "pear", duplicate: false });
  });

  it("reports a repeat by the earlier source line", () => {
    const text = ["x\t1", "cat\tmèo", "", "", "", "", "", "", "Cat\tcon mèo"].join("\n");
    const rows = previewImport(text, TAB, []);
    const nine = rows.find((r) => r.line === 9);
    expect(nine).toMatchObject({ duplicate: true, duplicateOfLine: 2 });
  });

  it("card mode rows carry their card number and flag repeats (spec-3-1b)", () => {
    const rows = previewImport("dog-chó;cat-mèo\nCat-con mèo", sep(custom("-"), SEMI), []);
    expect(rows[2]).toEqual({
      line: 2,
      card: 3,
      term: "Cat",
      definition: "con mèo",
      duplicate: true,
      duplicateOfLine: 1,
    });
  });
});

describe("importParseSchema (spec-3-1, spec-3-1b)", () => {
  const base = { flashcardId: "f1", ...TAB };

  it("accepts up to 200 non-blank cards, blank lines not counted", () => {
    const lines = Array.from({ length: MAX_IMPORT_CARDS }, (_, i) => `t${i}\td`);
    const text = lines.join("\n\n");
    expect(importParseSchema.safeParse({ ...base, text }).success).toBe(true);
  });

  it("rejects 201 non-blank lines", () => {
    const text = Array.from({ length: MAX_IMPORT_CARDS + 1 }, (_, i) => `t${i}\td`).join("\n");
    const parsed = importParseSchema.safeParse({ ...base, text });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(IMPORT_CARD_LIMIT_MESSAGE);
    expect(IMPORT_CARD_LIMIT_MESSAGE).toBe("Paste at most 200 cards per import.");
  });

  it("counts cards, not lines: 201 cards on one line with ; is rejected", () => {
    const body = { flashcardId: "f1", termSeparator: custom("-"), cardSeparator: SEMI };
    const ok = Array.from({ length: MAX_IMPORT_CARDS }, (_, i) => `t${i}-d`).join(";");
    expect(importParseSchema.safeParse({ ...body, text: `${ok};` }).success).toBe(true);
    const parsed = importParseSchema.safeParse({ ...body, text: `${ok};extra-d` });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Paste at most 200 cards per import.");
  });

  it("rejects an empty Custom separator and equal separators", () => {
    const empty = importParseSchema.safeParse({
      ...base,
      termSeparator: { kind: "custom", custom: "" },
      text: "a-b",
    });
    expect(empty.error?.issues[0]).toMatchObject({
      message: "Enter a separator.",
      path: ["termSeparator", "custom"],
    });
    const missing = importParseSchema.safeParse({
      ...base,
      cardSeparator: { kind: "custom" },
      text: "a\tb",
    });
    expect(missing.error?.issues[0]?.message).toBe("Enter a separator.");
    const equal = importParseSchema.safeParse({
      ...base,
      termSeparator: custom(";"),
      cardSeparator: SEMI,
      text: "a;b",
    });
    expect(equal.error?.issues[0]?.message).toBe(
      "Use different separators for terms and cards."
    );
  });

  it("a paste made only of card separators is empty", () => {
    const body = { flashcardId: "f1", termSeparator: custom("-"), cardSeparator: SEMI };
    for (const text of [";;", " ; ;\n;"]) {
      const parsed = importParseSchema.safeParse({ ...body, text });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]).toMatchObject({
        message: "Paste some lines to import.",
        path: ["text"],
      });
    }
    expect(countImportCards(";;", SEMI)).toBe(0);
  });

  it("caps a Custom separator at 10 characters", () => {
    const ok = importParseSchema.safeParse({
      ...base,
      termSeparator: custom("x".repeat(10)),
      text: "axxxxxxxxxxb",
    });
    expect(ok.success).toBe(true);
    const long = importParseSchema.safeParse({
      ...base,
      cardSeparator: custom("y".repeat(11)),
      text: "a\tb",
    });
    expect(long.success).toBe(false);
    expect(long.error?.issues[0]).toMatchObject({
      message: "Use 10 characters or fewer.",
      path: ["cardSeparator", "custom"],
    });
  });

  it("the card limit follows the batch limit", () => {
    expect(MAX_IMPORT_CARDS).toBe(MAX_CARDS_PER_BATCH);
  });

  it("a long paste with few lines gets its own message", () => {
    const text = `t	${"x".repeat(MAX_IMPORT_TEXT_LENGTH)}`;
    const parsed = importParseSchema.safeParse({ ...base, text });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(IMPORT_TEXT_TOO_LONG_MESSAGE);
  });

  it("rejects an empty paste, an unknown separator and a missing flashcard", () => {
    expect(importParseSchema.safeParse({ ...base, text: "\n  \n" }).success).toBe(false);
    expect(
      importParseSchema.safeParse({ ...base, termSeparator: { kind: "pipe" }, text: "a|b" })
        .success
    ).toBe(false);
    expect(importParseSchema.safeParse({ ...TAB, text: "a\tb" }).success).toBe(false);
    expect(
      importParseSchema.safeParse({ flashcardId: "f1", delimiter: "tab", text: "a\tb" }).success
    ).toBe(false);
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
