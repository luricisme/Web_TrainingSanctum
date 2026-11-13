/**
 * Paste import rules (spec-3-1; separators spec-3-1b).
 *
 * Pure parsing and duplicate detection shared by `POST /api/import/parse`, the
 * import commit in `POST /api/cards/batch` and the review editor. AD-1: no
 * next, react, prisma or HTTP imports. Text is only trimmed, never normalized,
 * so IPA, accents and non-Latin scripts pass through untouched.
 */
import { z } from "zod";
import { type CardInput, MAX_CARDS_PER_BATCH, cardInputSchema } from "./cards";

/** Most cards one paste may contain (decision 2026-11-12). */
export const MAX_IMPORT_CARDS = MAX_CARDS_PER_BATCH;
/** Upper bound on the raw paste, well above 200 full-length cards. */
export const MAX_IMPORT_TEXT_LENGTH = 500_000;

export const IMPORT_CARD_LIMIT_MESSAGE = `Paste at most ${MAX_IMPORT_CARDS} cards per import.`;
export const IMPORT_TEXT_TOO_LONG_MESSAGE =
  "This paste is too long. Shorten the cards and try again.";
export const IMPORT_EMPTY_MESSAGE = "Paste some lines to import.";
export const NO_SEPARATOR_MESSAGE = "No separator found";
export const SEPARATOR_REQUIRED_MESSAGE = "Enter a separator.";
export const SEPARATORS_EQUAL_MESSAGE = "Use different separators for terms and cards.";
export const SEPARATOR_LINE_BREAK_MESSAGE = "A separator cannot contain a line break.";
/** Longest Custom separator accepted. */
export const MAX_CUSTOM_SEPARATOR_LENGTH = 10;
export const TERM_REQUIRED_MESSAGE = "Term is required";
export const DEFINITION_REQUIRED_MESSAGE = "Definition is required";

/** Quizlet-style "Between term and definition" choices, in display order. */
export const TERM_SEPARATORS = [
  { id: "tab", label: "Tab", value: "\t" },
  { id: "comma", label: "Comma", value: "," },
  { id: "custom", label: "Custom", value: null },
] as const;

/** Quizlet-style "Between cards" choices, in display order. */
export const CARD_SEPARATORS = [
  { id: "newline", label: "New line", value: null },
  { id: "semicolon", label: "Semicolon", value: ";" },
  { id: "custom", label: "Custom", value: null },
] as const;

export type TermSeparatorKind = (typeof TERM_SEPARATORS)[number]["id"];
export type CardSeparatorKind = (typeof CARD_SEPARATORS)[number]["id"];

/** A separator choice; `custom` is read only when `kind` is "custom". */
export interface SeparatorChoice<K extends string> {
  kind: K;
  custom?: string;
}

export interface ImportSeparators {
  termSeparator: SeparatorChoice<TermSeparatorKind>;
  cardSeparator: SeparatorChoice<CardSeparatorKind>;
}

/** Tab between term and definition, one card per line (Story 3.1 behaviour). */
export const DEFAULT_IMPORT_SEPARATORS: ImportSeparators = {
  termSeparator: { kind: "tab" },
  cardSeparator: { kind: "newline" },
};

export type SeparatorField = "termSeparator" | "cardSeparator";

/**
 * The literal strings to split on. `card` is null in New line mode: line
 * breaks always separate cards, a card separator only adds to them.
 */
export type ResolvedSeparators =
  | { ok: true; term: string; card: string | null }
  | { ok: false; field: SeparatorField; message: string };

function choiceValue(
  options: readonly { id: string; value: string | null }[],
  choice: SeparatorChoice<string>
): string | null {
  if (choice.kind === "custom") return choice.custom ?? "";
  return options.find((o) => o.id === choice.kind)?.value ?? null;
}

/** The card separator alone (null = New line), or undefined when Custom is empty. */
function resolveCardSeparator(
  choice: SeparatorChoice<CardSeparatorKind>
): string | null | undefined {
  const value = choiceValue(CARD_SEPARATORS, choice);
  return value === "" ? undefined : value;
}

const hasLineBreak = (value: string) => /[\r\n]/.test(value);

/**
 * Turns the two choices into literal separators. A Custom value is used as
 * typed: no trimming, no regex, no escapes. An empty Custom value, a line
 * break in a Custom value, and separators where one contains the other (so
 * the card split would eat every term separator) are rejected with the
 * inline messages. A clash is reported on the Custom group, the term group
 * when both or neither are Custom.
 */
export function resolveSeparators(separators: ImportSeparators): ResolvedSeparators {
  const term = choiceValue(TERM_SEPARATORS, separators.termSeparator);
  if (!term) {
    return { ok: false, field: "termSeparator", message: SEPARATOR_REQUIRED_MESSAGE };
  }
  if (hasLineBreak(term)) {
    return { ok: false, field: "termSeparator", message: SEPARATOR_LINE_BREAK_MESSAGE };
  }
  const card = resolveCardSeparator(separators.cardSeparator);
  if (card === undefined) {
    return { ok: false, field: "cardSeparator", message: SEPARATOR_REQUIRED_MESSAGE };
  }
  if (card !== null && hasLineBreak(card)) {
    return { ok: false, field: "cardSeparator", message: SEPARATOR_LINE_BREAK_MESSAGE };
  }
  if (card !== null && (term.includes(card) || card.includes(term))) {
    const field: SeparatorField =
      separators.cardSeparator.kind === "custom" && separators.termSeparator.kind !== "custom"
        ? "cardSeparator"
        : "termSeparator";
    return { ok: false, field, message: SEPARATORS_EQUAL_MESSAGE };
  }
  return { ok: true, term, card };
}

/** One non-blank card of the paste and the 1-based line it starts on. */
interface RawCard {
  line: number;
  raw: string;
}

/**
 * Splits the paste into non-blank cards: on line breaks always, and on the
 * card separator too when there is one. Blank cards produce nothing.
 */
function splitCards(text: string, cardSeparator: string | null): RawCard[] {
  const cards: RawCard[] = [];
  text.split(/\r\n|\r|\n/).forEach((lineText, index) => {
    const pieces = cardSeparator === null ? [lineText] : lineText.split(cardSeparator);
    for (const raw of pieces) {
      if (raw.trim() !== "") cards.push({ line: index + 1, raw });
    }
  });
  return cards;
}

/**
 * Number of non-blank cards in the paste, for the live count under the paste
 * box. Null when the card separator is an empty Custom value.
 */
export function countImportCards(
  text: string,
  cardSeparator: SeparatorChoice<CardSeparatorKind>
): number | null {
  const card = resolveCardSeparator(cardSeparator);
  if (card === undefined) return null;
  return splitCards(text, card).length;
}

const TERM_KINDS = TERM_SEPARATORS.map((s) => s.id) as [
  TermSeparatorKind,
  ...TermSeparatorKind[],
];
const CARD_KINDS = CARD_SEPARATORS.map((s) => s.id) as [
  CardSeparatorKind,
  ...CardSeparatorKind[],
];

const CUSTOM_TOO_LONG = `Use ${MAX_CUSTOM_SEPARATOR_LENGTH} characters or fewer.`;

/** Request body of `POST /api/import/parse`. */
export const importParseSchema = z
  .object({
    flashcardId: z
      .string({ error: "Choose a flashcard." })
      .min(1, "Choose a flashcard."),
    termSeparator: z.object({
      kind: z.enum(TERM_KINDS, { error: "Choose a separator." }),
      custom: z.string().max(MAX_CUSTOM_SEPARATOR_LENGTH, CUSTOM_TOO_LONG).optional(),
    }),
    cardSeparator: z.object({
      kind: z.enum(CARD_KINDS, { error: "Choose a separator." }),
      custom: z.string().max(MAX_CUSTOM_SEPARATOR_LENGTH, CUSTOM_TOO_LONG).optional(),
    }),
    text: z
      .string({ error: IMPORT_EMPTY_MESSAGE })
      .max(MAX_IMPORT_TEXT_LENGTH, IMPORT_TEXT_TOO_LONG_MESSAGE)
      .refine((text) => text.trim() !== "", IMPORT_EMPTY_MESSAGE),
  })
  .superRefine((body, ctx) => {
    const resolved = resolveSeparators(body);
    if (!resolved.ok) {
      ctx.addIssue({
        code: "custom",
        path: [resolved.field, "custom"],
        message: resolved.message,
      });
      return;
    }
    const cards = splitCards(body.text, resolved.card).length;
    if (cards === 0) {
      // A paste made only of card separators, e.g. ";;;".
      ctx.addIssue({ code: "custom", path: ["text"], message: IMPORT_EMPTY_MESSAGE });
    } else if (cards > MAX_IMPORT_CARDS) {
      ctx.addIssue({ code: "custom", path: ["text"], message: IMPORT_CARD_LIMIT_MESSAGE });
    }
  });

export type ImportParseInput = z.infer<typeof importParseSchema>;

export type ImportField = "term" | "definition" | "example" | "context" | "partOfSpeech";

/** The five Card fields, in display order. */
export const IMPORT_FIELDS = [
  "term",
  "definition",
  "example",
  "context",
  "partOfSpeech",
] as const satisfies readonly ImportField[];

export interface ImportRowProblem {
  field: ImportField;
  message: string;
}

/**
 * One parsed card. `line` is the 1-based source line it starts on (blank
 * lines counted); `card` its 1-based position among the non-blank cards.
 */
export interface ParsedRow {
  line: number;
  card: number;
  term: string;
  definition: string;
  /** File import (spec-3-2) fills the optional fields; paste import never does. */
  example?: string;
  context?: string;
  partOfSpeech?: string;
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
 * Splits pasted text into cards with the card separator (line breaks always
 * separate cards too), then each card on its first term separator only: the
 * left side is the Term, the rest (further separators included) the
 * Definition. Blank cards produce no row.
 */
export function parseImportBlock(text: string, separators: ImportSeparators): ParsedRow[] {
  const resolved = resolveSeparators(separators);
  if (!resolved.ok) throw new Error(`Invalid import separators: ${resolved.message}`);
  return splitCards(text, resolved.card).map(({ line, raw }, index): ParsedRow => {
    const card = index + 1;
    const at = raw.indexOf(resolved.term);
    if (at === -1) {
      return {
        line,
        card,
        term: raw.trim(),
        definition: "",
        error: NO_SEPARATOR_MESSAGE,
        errorField: "definition",
      };
    }
    const term = raw.slice(0, at).trim();
    const definition = raw.slice(at + resolved.term.length).trim();
    const checked = validateImportCard({ term, definition });
    return checked.ok
      ? { line, card, term, definition }
      : {
          line,
          card,
          term,
          definition,
          error: checked.problem.message,
          errorField: checked.problem.field,
        };
  });
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

/** Adds the duplicate flags to parsed rows (paste and file import). */
export function withDuplicateFlags(
  rows: ParsedRow[],
  existingTerms: Iterable<string>
): ImportPreviewRow[] {
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

/** Parse plus duplicate flags: everything Preview needs, nothing persisted. */
export function previewImport(
  text: string,
  separators: ImportSeparators,
  existingTerms: Iterable<string>
): ImportPreviewRow[] {
  return withDuplicateFlags(parseImportBlock(text, separators), existingTerms);
}
