import { prisma } from "@training-sanctum/db";
import {
  type ImportParseResponse,
  importParseSchema,
  previewImport,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { fail, ok, readJson, zodFields } from "@/lib/api-response";

/**
 * Preview of a paste import (spec-3-1, separators spec-3-1b): parsed rows with
 * source lines, card numbers, row problems and duplicate flags against the
 * target Flashcard. Writes nothing.
 */
export async function POST(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const body = await readJson(request);
  if (body === null) {
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }
  const parsed = importParseSchema.safeParse(body);
  if (!parsed.success) {
    // Lead with the first problem (e.g. "Paste at most 200 cards per import.").
    return fail(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Check the highlighted fields.",
      zodFields(parsed.error)
    );
  }
  const { flashcardId, termSeparator, cardSeparator, text } = parsed.data;

  const flashcard = await prisma.flashcard.findFirst({
    where: { id: flashcardId, userId },
    select: { cards: { select: { term: true } } },
  });
  if (!flashcard) {
    return fail(404, "NOT_FOUND", "Flashcard not found.");
  }

  const rows = previewImport(
    text,
    { termSeparator, cardSeparator },
    flashcard.cards.map((card) => card.term)
  );
  const data: ImportParseResponse = { rows };
  return ok(data);
}
