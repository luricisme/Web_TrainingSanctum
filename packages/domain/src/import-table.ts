/**
 * File import rules (spec-3-2): CSV parsing, column mapping and the
 * grid → rows step shared by `POST /api/import/parse` (source "file") and the
 * Upload view. The browser reads the file into a grid of text cells; these
 * pure functions turn the grid plus the mapping into the same `ParsedRow`s
 * paste import produces. AD-1: no next, react, prisma or HTTP imports. Cell
 * text is only trimmed, never normalized.
 */
import { z } from "zod";
import {
  IMPORT_FIELDS,
  type ImportField,
  type ImportPreviewRow,
  MAX_IMPORT_CARDS,
  type ParsedRow,
  validateImportCard,
  withDuplicateFlags,
} from "./import";

/** Largest file the Upload view reads (decision 2026-11-13). */
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
/** Transport caps on the grid sent to the server. */
export const MAX_IMPORT_GRID_ROWS = 1000;
export const MAX_IMPORT_GRID_COLUMNS = 50;
export const MAX_IMPORT_CELL_LENGTH = 2000;

export const IMPORT_ROW_LIMIT_MESSAGE = `Upload at most ${MAX_IMPORT_CARDS} rows per import.`;
export const IMPORT_GRID_ROWS_MESSAGE = `This file has more than ${MAX_IMPORT_GRID_ROWS} rows. Remove blank rows or split the file.`;
export const IMPORT_FILE_TYPE_MESSAGE = "Choose a .csv or .xlsx file.";
export const IMPORT_FILE_SIZE_MESSAGE = "Choose a file of 2 MB or less.";
export const IMPORT_FILE_ENCODING_MESSAGE = "Save the file as CSV UTF-8 and try again.";
export const IMPORT_FILE_EMPTY_MESSAGE = "This file has no rows to import.";
export const IMPORT_FILE_COLUMNS_MESSAGE = `Use a file with at most ${MAX_IMPORT_GRID_COLUMNS} columns.`;
export const IMPORT_FILE_CELL_MESSAGE = `A cell in this file is longer than ${MAX_IMPORT_CELL_LENGTH} characters.`;
export const MAP_TERM_MESSAGE = "Map a column to Term.";
export const MAP_DEFINITION_MESSAGE = "Map a column to Definition.";
export const MAP_COLUMN_TWICE_MESSAGE = "Each column can be mapped once.";
export const MAP_COLUMN_MISSING_MESSAGE = "Choose a column from the file.";

/** Column index (0-based) per Card field; null is "Not mapped". */
export type ImportColumnMapping = Record<ImportField, number | null>;

export interface ImportTableOptions {
  hasHeader: boolean;
  mapping: ImportColumnMapping;
}

// ---------------------------------------------------------------------------
// CSV

const CSV_DELIMITERS = [",", ";", "\t"] as const;

/**
 * The delimiter of the first record: whichever of comma, semicolon and tab
 * occurs most often outside quotes (comma on a tie or when there is none).
 */
function detectCsvDelimiter(text: string): string {
  const counts = new Map<string, number>(CSV_DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted) {
      if (ch === "\n" || ch === "\r") break;
      if (counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
    }
  }
  let best: string = ",";
  for (const d of CSV_DELIMITERS) {
    if (counts.get(d)! > counts.get(best)!) best = d;
  }
  return best;
}

/**
 * RFC 4180 CSV → rows of cells. Quoted fields may hold delimiters, line
 * breaks and `""` escapes. A leading UTF-8 BOM is dropped, the delimiter is
 * detected from the first record, and every line (blank ones included) is a
 * record so row numbers match the spreadsheet; a final line break adds none.
 * Lenient on malformed input: a stray quote inside an unquoted field is kept.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (text === "") return [];
  const delimiter = detectCsvDelimiter(text);
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStart = true;
  let i = 0;

  const endField = () => {
    record.push(field);
    field = "";
    fieldStart = true;
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && fieldStart) {
      quoted = true;
      fieldStart = false;
      i++;
      continue;
    }
    if (ch === delimiter) {
      endField();
      i++;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      endRecord();
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch;
    fieldStart = false;
    i++;
  }
  // No record after a final line break.
  if (!(fieldStart && field === "" && record.length === 0)) endRecord();
  return records;
}

// ---------------------------------------------------------------------------
// Columns and mapping

/** "A", "B", … "Z", "AA", … for a 0-based column index. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Number of columns that hold any non-blank cell, counted from column A. */
export function gridColumnCount(grid: readonly (readonly string[])[]): number {
  let count = 0;
  for (const row of grid) {
    for (let c = row.length - 1; c >= count; c--) {
      if (row[c]!.trim() !== "") {
        count = c + 1;
        break;
      }
    }
  }
  return count;
}

/**
 * Display name per column for the mapping selects: the header text when the
 * first row holds column names and the cell is not blank, else "Column A"…
 */
export function columnNames(
  grid: readonly (readonly string[])[],
  hasHeader: boolean
): string[] {
  const header = hasHeader ? (grid[0] ?? []) : [];
  return Array.from({ length: gridColumnCount(grid) }, (_, c) => {
    const name = (header[c] ?? "").trim();
    return name !== "" ? name : `Column ${columnLetter(c)}`;
  });
}

/** Header aliases per field, compared on letters and digits only, lower case. */
const FIELD_ALIASES: Record<ImportField, readonly string[]> = {
  term: ["term", "terms", "word", "words", "front", "vocabulary", "vocab", "phrase", "expression", "idiom", "từ", "từvựng"],
  definition: ["definition", "definitions", "meaning", "meanings", "back", "translation", "definitionmeaning", "nghĩa", "địnhnghĩa"],
  example: ["example", "examples", "examplesentence", "examplesentences", "sentence", "usage", "vídụ", "câuvídụ"],
  context: ["context", "collocation", "collocations", "contextcollocation", "contextcollocations", "ngữcảnh", "cụmtừ"],
  partOfSpeech: ["partofspeech", "pos", "wordclass", "wordtype", "từloại"],
};

/** NFC first, so a decomposed "nghĩa" matches the composed alias. */
const headerKey = (name: string) =>
  name.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export const EMPTY_MAPPING: ImportColumnMapping = {
  term: null,
  definition: null,
  example: null,
  context: null,
  partOfSpeech: null,
};

/**
 * Prefills the mapping selects. With header names, each field takes the
 * first column whose name is one of its aliases (case-insensitive, spaces and
 * punctuation ignored). Term and Definition still unmapped then take the
 * first unused columns, so a file without names maps A → Term, B → Definition.
 */
export function guessMapping(
  headers: readonly string[] | null,
  columnCount: number
): ImportColumnMapping {
  const mapping: ImportColumnMapping = { ...EMPTY_MAPPING };
  const used = new Set<number>();
  if (headers) {
    for (const field of IMPORT_FIELDS) {
      const aliases = FIELD_ALIASES[field].map(headerKey);
      for (let c = 0; c < Math.min(headers.length, columnCount); c++) {
        if (used.has(c)) continue;
        if (aliases.includes(headerKey(headers[c] ?? ""))) {
          mapping[field] = c;
          used.add(c);
          break;
        }
      }
    }
  }
  for (const field of ["term", "definition"] as const) {
    if (mapping[field] !== null) continue;
    for (let c = 0; c < columnCount; c++) {
      if (!used.has(c)) {
        mapping[field] = c;
        used.add(c);
        break;
      }
    }
  }
  return mapping;
}

/**
 * Mapping problems per field: Term and Definition must be mapped, a column
 * may feed one field only (every field sharing it is flagged), and a column
 * must exist in the file.
 */
export function importMappingProblems(
  mapping: ImportColumnMapping,
  columnCount: number
): Partial<Record<ImportField, string>> {
  const problems: Partial<Record<ImportField, string>> = {};
  if (mapping.term === null) problems.term = MAP_TERM_MESSAGE;
  if (mapping.definition === null) problems.definition = MAP_DEFINITION_MESSAGE;
  const uses = new Map<number, number>();
  for (const field of IMPORT_FIELDS) {
    const column = mapping[field];
    if (column !== null) uses.set(column, (uses.get(column) ?? 0) + 1);
  }
  for (const field of IMPORT_FIELDS) {
    const column = mapping[field];
    if (column === null) continue;
    if (column >= columnCount) problems[field] ??= MAP_COLUMN_MISSING_MESSAGE;
    else if (uses.get(column)! > 1) problems[field] ??= MAP_COLUMN_TWICE_MESSAGE;
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Grid → rows

/**
 * Turns the grid into import rows. `line` is the 1-based spreadsheet row
 * (the header counted), `card` the ordinal among non-blank rows. A row whose
 * mapped cells are all blank produces nothing. Every row carries all five
 * fields (unmapped ones empty) and the first `validateImportCard` problem.
 */
export function parseImportTable(
  grid: readonly (readonly string[])[],
  { hasHeader, mapping }: ImportTableOptions
): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const cell = (row: readonly string[], column: number | null) =>
    column === null ? "" : (row[column] ?? "").trim();
  for (let r = hasHeader ? 1 : 0; r < grid.length; r++) {
    const source = grid[r]!;
    const fields = {
      term: cell(source, mapping.term),
      definition: cell(source, mapping.definition),
      example: cell(source, mapping.example),
      context: cell(source, mapping.context),
      partOfSpeech: cell(source, mapping.partOfSpeech),
    };
    if (Object.values(fields).every((v) => v === "")) continue;
    const row: ParsedRow = { line: r + 1, card: rows.length + 1, ...fields };
    const checked = validateImportCard(fields);
    if (!checked.ok) {
      row.error = checked.problem.message;
      row.errorField = checked.problem.field;
    }
    rows.push(row);
  }
  return rows;
}

/** Parse plus duplicate flags for a file import; nothing persisted. */
export function previewImportTable(
  grid: readonly (readonly string[])[],
  options: ImportTableOptions,
  existingTerms: Iterable<string>
): ImportPreviewRow[] {
  return withDuplicateFlags(parseImportTable(grid, options), existingTerms);
}

// ---------------------------------------------------------------------------
// Request body

const columnIndex = z
  .number({ error: MAP_COLUMN_MISSING_MESSAGE })
  .int(MAP_COLUMN_MISSING_MESSAGE)
  .min(0, MAP_COLUMN_MISSING_MESSAGE)
  .max(MAX_IMPORT_GRID_COLUMNS - 1, MAP_COLUMN_MISSING_MESSAGE)
  .nullable();

/** Request body of `POST /api/import/parse` with `source: "file"`. */
export const importFileParseSchema = z
  .object({
    source: z.literal("file"),
    flashcardId: z
      .string({ error: "Choose a flashcard." })
      .min(1, "Choose a flashcard."),
    hasHeader: z.boolean({ error: "Say whether the first row has column names." }),
    grid: z
      .array(
        z
          .array(
            z
              .string({ error: "Send the cells as text." })
              .max(MAX_IMPORT_CELL_LENGTH, IMPORT_FILE_CELL_MESSAGE),
            { error: "Send each row as a list of cells." }
          )
          .max(MAX_IMPORT_GRID_COLUMNS, IMPORT_FILE_COLUMNS_MESSAGE),
        { error: IMPORT_FILE_EMPTY_MESSAGE }
      )
      .max(MAX_IMPORT_GRID_ROWS, IMPORT_GRID_ROWS_MESSAGE),
    mapping: z.object({
      term: columnIndex,
      definition: columnIndex,
      example: columnIndex,
      context: columnIndex,
      partOfSpeech: columnIndex,
    }),
  })
  .superRefine((body, ctx) => {
    const problems = importMappingProblems(body.mapping, gridColumnCount(body.grid));
    let mappingOk = true;
    for (const field of IMPORT_FIELDS) {
      const message = problems[field];
      if (!message) continue;
      mappingOk = false;
      ctx.addIssue({ code: "custom", path: ["mapping", field], message });
    }
    if (!mappingOk) return;
    const count = parseImportTable(body.grid, body).length;
    if (count === 0) {
      ctx.addIssue({ code: "custom", path: ["grid"], message: IMPORT_FILE_EMPTY_MESSAGE });
    } else if (count > MAX_IMPORT_CARDS) {
      ctx.addIssue({ code: "custom", path: ["grid"], message: IMPORT_ROW_LIMIT_MESSAGE });
    }
  });

export type ImportFileParseInput = z.infer<typeof importFileParseSchema>;
