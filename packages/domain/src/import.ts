/**
 * Paste import rules (spec-3-1).
 *
 * Pure parsing and duplicate detection shared by `POST /api/import/parse`, the
 * import commit in `POST /api/cards/batch` and the review editor. AD-1: no
 * next, react, prisma or HTTP imports. Text is only trimmed, never normalized,
 * so IPA, accents and non-Latin scripts pass through untouched.
 */
import { z } from "zod";
import { type CardInput, MAX_CARDS_PER_BATCH, cardInputSchema } from "./cards";

/** Most non-blank lines one paste may contain (decision 2026-11-12). */
export const MAX_IMPORT_LINES = MAX_CARDS_PER_BATCH;
/** Upper bound on the raw paste, well above 200 full-length lines. */
export const MAX_IMPORT_TEXT_LENGTH = 500_000;

export const IMPORT_LINE_LIMIT_MESSAGE = `Paste at most ${MAX_IMPORT_LINES} lines per import.`;
export const IMPORT_TEXT_TOO_LONG_MESSAGE =
  "This paste is too long. Shorten the lines and try again.";
export const NO_DELIMITER_MESSAGE = "No delimiter found";
export const TERM_REQUIRED_MESSAGE = "Term is required";
export const DEFINITION_REQUIRED_MESSAGE = "Definition is required";

/** Delimiters offered by the paste picker, in display order (Tab first). */
export const IMPORT_DELIMITERS = [
  { id: "tab", label: "Tab", value: "\t" },
  { id: "em-dash", label: "— (em dash)", value: " — " },
  { id: "hyphen", label: "- (spaced hyphen)", value: " - " },
  { id: "colon", label: ": (colon)", value: ":" },
  { id: "comma", label: ", (comma)", value: "," },
  { id: "semicolon", label: "; (semicolon)", value: ";" },
] as const;

export type ImportDelimiter = (typeof IMPORT_DELIMITERS)[number]["id"];

export const DEFAULT_IMPORT_DELIMITER: ImportDelimiter = "tab";

const DELIMITER_IDS = IMPORT_DELIMITERS.map((d) => d.id) as [
  ImportDelimiter,
  ...ImportDelimiter[],
];

function delimiterValue(delimiter: ImportDelimiter): string {
  const found = IMPORT_DELIMITERS.find((d) => d.id === delimiter);
  if (!found) throw new Error(`Unknown import delimiter: ${delimiter}`);
  return found.value;
}

function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

function countNonBlankLines(text: string): number {
  return splitLines(text).filter((line) => line.trim() !== "").length;
}

/** Request body of `POST /api/import/parse`. */
export const importParseSchema = z.object({
  flashcardId: z
    .string({ error: "Choose a flashcard." })
    .min(1, "Choose a flashcard."),
  delimiter: z.enum(DELIMITER_IDS, { error: "Choose a delimiter." }),
  text: z
    .string({ error: "Paste some lines to import." })
    .max(MAX_IMPORT_TEXT_LENGTH, IMPORT_TEXT_TOO_LONG_MESSAGE)
    .refine((text) => countNonBlankLines(text) > 0, "Paste some lines to import.")
    .refine(
      (text) => countNonBlankLines(text) <= MAX_IMPORT_LINES,
      IMPORT_LINE_LIMIT_MESSAGE
    ),
});

export type ImportParseInput = z.infer<typeof importParseSchema>;

export type ImportField = "term" | "definition" | "example" | "context" | "partOfSpeech";

export interface ImportRowProblem {
  field: ImportField;
  message: string;
}

/** One parsed line. `line` is the 1-based source line, blank lines counted. */
export interface ParsedRow {
  line: number;
  term: string;
  definition: string;
  error?: string;
  /** The field the error belongs to, so the editor can show it in place. */
  errorField?: ImportField;
}

export type ImportCardResult =
  | { ok: true; card: CardInput }
  | { ok: false; problem: ImportRowProblem };

/**
 * Validates one import row with the Card rules. Empty sides read "Term is
 * required" / "Definition is required"; other problems use the
 * `cardInputSchema` message (e.g. the length limit).
 */
export function validateImportCard(row: unknown): ImportCardResult {
  const value = (row ?? {}) as Record<string, unknown>;
  if (typeof value.term !== "string" || value.term.trim() === "") {
    return { ok: false, problem: { field: "term", message: TERM_REQUIRED_MESSAGE } };
  }
  if (typeof value.definition !== "string" || value.definition.trim() === "") {
    return {
      ok: false,
      problem: { field: "definition", message: DEFINITION_REQUIRED_MESSAGE },
    };
  }
  const parsed = cardInputSchema.safeParse(row);
  if (parsed.success) return { ok: true, card: parsed.data };
  const issue = parsed.error.issues[0];
  return {
    ok: false,
    problem: {
      field: (issue?.path[0] as ImportField | undefined) ?? "term",
      message: issue?.message ?? "Invalid card.",
    },
  };
}

/**
 * Splits pasted text into rows. Each line splits on the first delimiter only:
 * the left side is the Term, the rest (further delimiters included) the
 * Definition. Blank lines produce no row but still count for line numbers.
 */
export function parseImportBlock(text: string, delimiter: ImportDelimiter): ParsedRow[] {
  const separator = delimiterValue(delimiter);
  const rows: ParsedRow[] = [];
  splitLines(text).forEach((raw, index) => {
    if (raw.trim() === "") return;
    const line = index + 1;
    const at = raw.indexOf(separator);
    if (at === -1) {
      rows.push({
        line,
        term: raw.trim(),
        definition: "",
        error: NO_DELIMITER_MESSAGE,
        errorField: "definition",
      });
      return;
    }
    const term = raw.slice(0, at).trim();
    const definition = raw.slice(at + separator.length).trim();
    const checked = validateImportCard({ term, definition });
    rows.push(
      checked.ok
        ? { line, term, definition }
        : {
            line,
            term,
            definition,
            error: checked.problem.message,
            errorField: checked.problem.field,
          }
    );
  });
  return rows;
}

/**
 * Duplicate key: the Term trimmed, NFC-normalized (so composed and decomposed
 * accents match) and compared case-insensitively. Only the key is normalized;
 * stored text is never changed.
 */
export function normalizeTermKey(term: string): string {
  return term.trim().normalize("NFC").toLowerCase();
}

export interface DuplicateFlag {
  duplicate: boolean;
  /** Index (into the same rows) of the earlier row this one repeats, if any. */
  duplicateOf: number | null;
}

/**
 * Flags each row whose Term already exists in the target Flashcard, or repeats
 * an earlier row of the same import. Rows with an `error` are still checked
 * against existing Terms but never count as the earlier occurrence, so a
 * malformed line cannot cause a valid one to be skipped.
 */
export function detectDuplicates(
  rows: readonly { term: string; error?: string }[],
  existingTerms: Iterable<string>
): DuplicateFlag[] {
  const existing = new Set<string>();
  for (const term of existingTerms) existing.add(normalizeTermKey(term));
  const seen = new Map<string, number>();
  return rows.map((row, index) => {
    const key = normalizeTermKey(row.term);
    if (key === "") return { duplicate: false, duplicateOf: null };
    if (existing.has(key)) return { duplicate: true, duplicateOf: null };
    const earlier = seen.get(key);
    if (earlier !== undefined) return { duplicate: true, duplicateOf: earlier };
    if (!row.error) seen.set(key, index);
    return { duplicate: false, duplicateOf: null };
  });
}

/** One row of the review editor as returned by `POST /api/import/parse`. */
export interface ImportPreviewRow extends ParsedRow {
  duplicate: boolean;
  /** Source line of the earlier row this one repeats; null for existing Terms. */
  duplicateOfLine: number | null;
}

/** Shape returned by `POST /api/import/parse`. */
export interface ImportParseResponse {
  rows: ImportPreviewRow[];
}

/** Parse plus duplicate flags: everything Preview needs, nothing persisted. */
export function previewImport(
  text: string,
  delimiter: ImportDelimiter,
  existingTerms: Iterable<string>
): ImportPreviewRow[] {
  const rows = parseImportBlock(text, delimiter);
  const flags = detectDuplicates(rows, existingTerms);
  return rows.map((row, i) => {
    const flag = flags[i]!;
    return {
      ...row,
      duplicate: flag.duplicate,
      duplicateOfLine: flag.duplicateOf === null ? null : rows[flag.duplicateOf]!.line,
    };
  });
}
