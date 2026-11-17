import type { ZodError } from "zod";
import { prisma } from "@training-sanctum/db";
import {
  type ImportParseResponse,
  importFileParseSchema,
  importParseSchema,
  previewImport,
  previewImportTable,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { requireClassOwner } from "@/lib/class-access";
import { fail, ok, readJson, zodFields } from "@/lib/api-response";

function firstIssueFailure(error: ZodError): Response {
  // Lead with the first problem (e.g. "Paste at most 200 cards per import.").
  return fail(
    400,
    "VALIDATION_ERROR",
    error.issues[0]?.message ?? "Check the highlighted fields.",
    zodFields(error)
  );
}

function isFileBody(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { source?: unknown }).source === "file"
  );
}

/**
 * Terms already in the Flashcard, or the guard's error response when the
 * caller does not own its Class (a preview is part of importing: Owner only).
 */
async function existingTerms(
  flashcardId: string,
  userId: string
): Promise<{ terms: string[]; response?: undefined } | { response: Response }> {
  const guard = await requireClassOwner(userId, { kind: "flashcard", id: flashcardId });
  if (guard.response) return { response: guard.response };
  const flashcard = await prisma.flashcard.findUnique({
    where: { id: flashcardId },
    select: { cards: { select: { term: true } } },
  });
  if (!flashcard) return { response: fail(404, "NOT_FOUND", "Flashcard not found.") };
  return { terms: flashcard.cards.map((card) => card.term) };
}

/**
 * Preview of a paste import (spec-3-1, separators spec-3-1b): parsed rows with
 * source lines, card numbers, row problems and duplicate flags against the
 * target Flashcard. With `source: "file"` (spec-3-2) the body carries the
 * grid the browser read from a CSV/xlsx file plus the column mapping instead
 * of pasted text. Writes nothing.
 */
export async function POST(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const body = await readJson(request);
  if (body === null) {
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }
  if (isFileBody(body)) {
    const parsed = importFileParseSchema.safeParse(body);
    if (!parsed.success) return firstIssueFailure(parsed.error);
    const { flashcardId, grid, hasHeader, mapping } = parsed.data;
    const existing = await existingTerms(flashcardId, userId);
    if (existing.response) return existing.response;
    const data: ImportParseResponse = {
      rows: previewImportTable(grid, { hasHeader, mapping }, existing.terms),
    };
    return ok(data);
  }

  const parsed = importParseSchema.safeParse(body);
  if (!parsed.success) return firstIssueFailure(parsed.error);
  const { flashcardId, termSeparator, cardSeparator, text } = parsed.data;

  const existing = await existingTerms(flashcardId, userId);
  if (existing.response) return existing.response;

  const data: ImportParseResponse = {
    rows: previewImport(text, { termSeparator, cardSeparator }, existing.terms),
  };
  return ok(data);
}
