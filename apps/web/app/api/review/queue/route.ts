import { prisma } from "@training-sanctum/db";
import {
  type ReviewQueueEntry,
  type ReviewQueueResponse,
  learnedRecordWhere,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { ok } from "@/lib/api-response";
import { readReviewScope, scopeFlashcardWhere } from "@/lib/review-scope";
import { getStudiedDirections } from "@/lib/study-directions";

/**
 * spec-4-3: the user's due Scheduling Records, oldest-due-first, one entry
 * per record. "Due" is `nextReviewDate <= now`, the same check the grade
 * route makes, so the queue never offers a record that route would refuse.
 * spec-4-6 / spec-4-9: only learned records (AD-14 `learnedRecordWhere`) in
 * the user's studied directions. A graded direction is here on its due date
 * whatever the other direction's state; unlearned records are met in Learn
 * first. Flashcard scope moved to Learn and is a 400.
 */
export async function GET(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const read = await readReviewScope(request, userId);
  if (read.response) return read.response;
  const { scope } = read;
  const flashcard = scopeFlashcardWhere(scope);

  const { dirs } = await getStudiedDirections(userId);
  const rows = await prisma.schedulingRecord.findMany({
    where: {
      nextReviewDate: { lte: new Date() },
      ...learnedRecordWhere(dirs),
      card: { userId, ...(flashcard ? { flashcard } : {}) },
    },
    // Postgres orders enums by declaration: TERM_TO_DEFINITION sorts first.
    orderBy: [{ nextReviewDate: "asc" }, { cardId: "asc" }, { direction: "asc" }],
    select: {
      id: true,
      cardId: true,
      direction: true,
      nextReviewDate: true,
      card: {
        select: {
          term: true,
          definition: true,
          example: true,
          context: true,
          partOfSpeech: true,
          flashcard: { select: { name: true } },
        },
      },
    },
  });

  const entries: ReviewQueueEntry[] = rows.map((row) => ({
    schedulingRecordId: row.id,
    cardId: row.cardId,
    direction: row.direction,
    nextReviewDate: row.nextReviewDate.toISOString(),
    flashcardName: row.card.flashcard.name,
    term: row.card.term,
    definition: row.card.definition,
    example: row.card.example,
    context: row.card.context,
    partOfSpeech: row.card.partOfSpeech,
  }));

  const data: ReviewQueueResponse = { scope, entries };
  return ok(data);
}
