import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  EMPTY_MAPPING,
  IMPORT_FILE_CELL_MESSAGE,
  IMPORT_FILE_COLUMNS_MESSAGE,
  IMPORT_FILE_EMPTY_MESSAGE,
  IMPORT_GRID_ROWS_MESSAGE,
  MAP_COLUMN_MISSING_MESSAGE,
  IMPORT_ROW_LIMIT_MESSAGE,
  MAP_COLUMN_TWICE_MESSAGE,
  MAP_DEFINITION_MESSAGE,
  MAP_TERM_MESSAGE,
  MAX_IMPORT_FILE_BYTES,
  type ImportColumnMapping,
  columnLetter,
  columnNames,
  guessMapping,
  importFileParseSchema,
  importMappingProblems,
  parseCsv,
  parseImportTable,
  previewImportTable,
} from "@training-sanctum/domain";
import {
  FILE_UNREADABLE_MESSAGE,
  XLSX_UNREADABLE_MESSAGE,
  readSpreadsheet,
  xlsxCellText,
} from "../../apps/web/lib/read-spreadsheet";

const map = (patch: Partial<ImportColumnMapping>): ImportColumnMapping => ({
  ...EMPTY_MAPPING,
  ...patch,
});
const AB = map({ term: 0, definition: 1 });

describe("parseCsv (spec-3-2)", () => {
  it("parses comma CSV with a header", () => {
    expect(parseCsv("pos,meaning,word\nnoun,táo,apple\n")).toEqual([
      ["pos", "meaning", "word"],
      ["noun", "táo", "apple"],
    ]);
  });

  it("quoted fields keep delimiters, line breaks and \"\" escapes", () => {
    expect(parseCsv('"a, b","line1\nline2"\r\n"say ""hi""",x')).toEqual([
      ["a, b", "line1\nline2"],
      ['say "hi"', "x"],
    ]);
  });

  it("detects semicolon and tab from the first record, outside quotes", () => {
    expect(parseCsv("term;definition\na;b")).toEqual([
      ["term", "definition"],
      ["a", "b"],
    ]);
    expect(parseCsv("term\tdefinition\na,1\tb")).toEqual([
      ["term", "definition"],
      ["a,1", "b"],
    ]);
    // The commas inside quotes do not count.
    expect(parseCsv('"a,b,c";d\nx;y')[1]).toEqual(["x", "y"]);
  });

  it("strips the UTF-8 BOM and keeps Unicode", () => {
    expect(parseCsv("﻿café,日本語")).toEqual([["café", "日本語"]]);
  });

  it("keeps blank lines as records so row numbers match; no record after a final break", () => {
    expect(parseCsv("a,b\n\nc,d\n")).toEqual([["a", "b"], [""], ["c", "d"]]);
    expect(parseCsv("")).toEqual([]);
  });

  it("handles CR-only line endings and empty trailing fields", () => {
    expect(parseCsv("a,b\rc,")).toEqual([
      ["a", "b"],
      ["c", ""],
    ]);
  });
});

describe("guessMapping (spec-3-2)", () => {
  it("maps header aliases in any order, case-insensitively", () => {
    expect(guessMapping(["pos", "meaning", "word"], 3)).toEqual(
      map({ term: 2, definition: 1, partOfSpeech: 0 })
    );
    expect(
      guessMapping(["Front", "BACK", "Example sentence", "Context / Collocation", "Part of Speech"], 5)
    ).toEqual({ term: 0, definition: 1, example: 2, context: 3, partOfSpeech: 4 });
  });

  it("without a header (or unknown names) maps A → Term, B → Definition", () => {
    expect(guessMapping(null, 2)).toEqual(AB);
    expect(guessMapping(["foo", "bar", "baz"], 3)).toEqual(AB);
  });

  it("matches Vietnamese headers, composed or decomposed", () => {
    expect(
      guessMapping(
        ["Từ loại", "Nghĩa".normalize("NFD"), "Từ vựng", "Câu ví dụ", "Ngữ cảnh"],
        5
      )
    ).toEqual({ term: 2, definition: 1, example: 3, context: 4, partOfSpeech: 0 });
  });

  it("fills a missing Term or Definition with the first unused column", () => {
    expect(guessMapping(["meaning", "x"], 2)).toEqual(map({ term: 1, definition: 0 }));
  });
});

describe("column names and mapping problems (spec-3-2)", () => {
  it("names columns by header text, else by letter", () => {
    const grid = [["word", "", "pos"], ["a", "b", "c"]];
    expect(columnNames(grid, true)).toEqual(["word", "Column B", "pos"]);
    expect(columnNames(grid, false)).toEqual(["Column A", "Column B", "Column C"]);
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
  });

  it("Term and Definition must be mapped; a column maps once", () => {
    expect(importMappingProblems(map({ definition: 1 }), 2)).toEqual({ term: MAP_TERM_MESSAGE });
    expect(importMappingProblems(map({ term: 0 }), 2)).toEqual({
      definition: MAP_DEFINITION_MESSAGE,
    });
    expect(importMappingProblems(map({ term: 0, definition: 1, example: 0 }), 2)).toEqual({
      term: MAP_COLUMN_TWICE_MESSAGE,
      example: MAP_COLUMN_TWICE_MESSAGE,
    });
    expect(importMappingProblems(AB, 2)).toEqual({});
  });
});

describe("parseImportTable (spec-3-2)", () => {
  it("happy CSV in any column order: rows labelled by spreadsheet row", () => {
    const grid = parseCsv("pos,meaning,word\nnoun,quả táo,apple\nverb,chạy,run\nadj,nhanh,fast");
    const mapping = guessMapping(grid[0]!, 3);
    const rows = parseImportTable(grid, { hasHeader: true, mapping });
    expect(rows.map((r) => r.line)).toEqual([2, 3, 4]);
    expect(rows[0]).toEqual({
      line: 2,
      card: 1,
      term: "apple",
      definition: "quả táo",
      example: "",
      context: "",
      partOfSpeech: "noun",
    });
  });

  it("no header: the first row is Row 1", () => {
    const rows = parseImportTable([["a", "b"], ["c", "d"]], { hasHeader: false, mapping: AB });
    expect(rows.map((r) => [r.line, r.term, r.definition])).toEqual([
      [1, "a", "b"],
      [2, "c", "d"],
    ]);
  });

  it("quoted CSV: Term `a, b`, Definition keeps the line break", () => {
    const rows = parseImportTable(parseCsv('"a, b","line1\nline2"'), {
      hasHeader: false,
      mapping: AB,
    });
    expect(rows[0]).toMatchObject({ term: "a, b", definition: "line1\nline2" });
  });

  it("a blank Definition cell is 'Definition is required' on that row", () => {
    const grid = [["t", "d"], ["a", "1"], ["b", "2"], ["c", "3"], ["e", "  "]];
    const rows = parseImportTable(grid, { hasHeader: true, mapping: AB });
    expect(rows[3]).toMatchObject({
      line: 5,
      term: "e",
      error: "Definition is required",
      errorField: "definition",
    });
    expect(rows.slice(0, 3).every((r) => !r.error)).toBe(true);
  });

  it("rows whose mapped cells are all blank produce nothing; later rows keep their numbers", () => {
    const grid = [["t", "d", "note"], ["a", "1", ""], ["", " ", "unmapped text"], ["b", "2", ""]];
    const rows = parseImportTable(grid, { hasHeader: true, mapping: AB });
    expect(rows.map((r) => [r.line, r.card])).toEqual([
      [2, 1],
      [4, 2],
    ]);
  });

  it("trims cells only, keeps Unicode, and flags field-length problems", () => {
    const long = "x".repeat(51);
    const rows = parseImportTable([["  café ", " /ˈkɒl/ ", long]], {
      hasHeader: false,
      mapping: map({ term: 0, definition: 1, partOfSpeech: 2 }),
    });
    expect(rows[0]).toMatchObject({
      term: "café",
      definition: "/ˈkɒl/",
      errorField: "partOfSpeech",
    });
  });

  it("previewImportTable flags Terms already in the Flashcard and repeats by row", () => {
    const grid = [["t", "d"], ["Apple", "1"], ["pear", "2"], ["apple", "3"]];
    const rows = previewImportTable(grid, { hasHeader: true, mapping: AB }, ["PEAR"]);
    expect(rows.map((r) => [r.duplicate, r.duplicateOfLine])).toEqual([
      [false, null],
      [true, null],
      [true, 2],
    ]);
  });
});

describe("importFileParseSchema (spec-3-2)", () => {
  const body = (patch: Record<string, unknown> = {}) => ({
    source: "file",
    flashcardId: "f1",
    hasHeader: true,
    grid: [["term", "definition"], ["a", "b"]],
    mapping: AB,
    ...patch,
  });
  const firstMessage = (input: unknown) => {
    const parsed = importFileParseSchema.safeParse(input);
    return parsed.success ? null : parsed.error.issues[0]?.message;
  };

  it("accepts a mapped grid", () => {
    expect(importFileParseSchema.safeParse(body()).success).toBe(true);
  });

  it("Term unmapped blocks the preview", () => {
    expect(firstMessage(body({ mapping: map({ definition: 1 }) }))).toBe(MAP_TERM_MESSAGE);
  });

  it("a column mapped twice is rejected", () => {
    expect(firstMessage(body({ mapping: map({ term: 0, definition: 0 }) }))).toBe(
      MAP_COLUMN_TWICE_MESSAGE
    );
  });

  it("201 data rows are over the limit; 200 are not", () => {
    const rows = (n: number) => [["t", "d"], ...Array.from({ length: n }, (_, i) => [`t${i}`, "d"])];
    expect(firstMessage(body({ grid: rows(201) }))).toBe(IMPORT_ROW_LIMIT_MESSAGE);
    expect(firstMessage(body({ grid: rows(200) }))).toBeNull();
  });

  it("a mapped column outside the grid is 'Choose a column from the file.'", () => {
    expect(firstMessage(body({ mapping: map({ term: 0, definition: 5 }) }))).toBe(
      MAP_COLUMN_MISSING_MESSAGE
    );
  });

  it("caps the grid at 1000 rows, 50 columns and 2000-character cells", () => {
    const tall = Array.from({ length: 1001 }, () => ["", ""]);
    expect(firstMessage(body({ grid: tall }))).toBe(IMPORT_GRID_ROWS_MESSAGE);
    const wide = [Array.from({ length: 51 }, (_, i) => `c${i}`), ["a", "b"]];
    expect(firstMessage(body({ grid: wide }))).toBe(IMPORT_FILE_COLUMNS_MESSAGE);
    const long = [["t", "d"], ["a", "x".repeat(2001)]];
    expect(firstMessage(body({ grid: long }))).toBe(IMPORT_FILE_CELL_MESSAGE);
  });

  it("a file with only a header has no rows to import", () => {
    expect(firstMessage(body({ grid: [["term", "definition"]] }))).toBe(IMPORT_FILE_EMPTY_MESSAGE);
  });
});

describe("readSpreadsheet (spec-3-2)", () => {
  const fixture = fileURLToPath(new URL("../fixtures/vocab.xlsx", import.meta.url));

  it("reads the first sheet of an .xlsx into display text", async () => {
    const file = new File([readFileSync(fixture)], "vocab.xlsx");
    const result = await readSpreadsheet(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spreadsheet.sheetName).toBe("Words");
    expect(result.spreadsheet.grid).toEqual([
      ["Word", "Meaning", "POS"],
      ["café", "quán cà phê", "noun"],
      ["42", "0.5", "TRUE"],
      ["", "", ""],
      ["deadline", "2026-01-15", "  noun  "],
    ]);
  });

  it("reads a UTF-8 CSV and rejects other encodings, types and sizes", async () => {
    const ok = await readSpreadsheet(new File(["﻿term;definition\ncafé;x\n\n"], "a.CSV"));
    expect(ok).toEqual({
      ok: true,
      spreadsheet: {
        fileName: "a.CSV",
        sheetName: null,
        grid: [
          ["term", "definition"],
          ["café", "x"],
        ],
      },
    });
    // A real U+FFFD in valid UTF-8 is kept.
    const replacement = await readSpreadsheet(new File(["a,�"], "r.csv"));
    expect(replacement.ok && replacement.spreadsheet.grid).toEqual([["a", "�"]]);
    // "café" in Windows-1252.
    const latin1 = new File([new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x2c, 0x78])], "b.csv");
    expect(await readSpreadsheet(latin1)).toEqual({
      ok: false,
      message: "Save the file as CSV UTF-8 and try again.",
    });
    expect(await readSpreadsheet(new File(["%PDF"], "c.pdf"))).toEqual({
      ok: false,
      message: "Choose a .csv or .xlsx file.",
    });
    const big = new File([new Uint8Array(MAX_IMPORT_FILE_BYTES + 1)], "d.csv");
    expect(await readSpreadsheet(big)).toEqual({
      ok: false,
      message: "Choose a file of 2 MB or less.",
    });
    expect(await readSpreadsheet(new File([""], "e.csv"))).toEqual({
      ok: false,
      message: IMPORT_FILE_EMPTY_MESSAGE,
    });
  });

  it("an .xlsx that is not a spreadsheet returns the unreadable message", async () => {
    expect(await readSpreadsheet(new File(["not a zip"], "broken.xlsx"))).toEqual({
      ok: false,
      message: XLSX_UNREADABLE_MESSAGE,
    });
  });

  it("never rejects when the file cannot be read", async () => {
    const file = new File(["a,b"], "gone.csv");
    file.arrayBuffer = () => Promise.reject(new Error("NotReadableError"));
    expect(await readSpreadsheet(file)).toEqual({ ok: false, message: FILE_UNREADABLE_MESSAGE });
  });

  it("formats xlsx cell values as their displayed text", () => {
    expect(xlsxCellText(new Date(Date.UTC(2026, 0, 15, 9, 30)))).toBe("2026-01-15 09:30");
    expect(xlsxCellText(false)).toBe("FALSE");
    expect(xlsxCellText(null)).toBe("");
  });
});
