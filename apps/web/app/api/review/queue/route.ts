import { prisma } from "@training-sanctum/db";
import {
  FLASHCARD_REVIEW_MOVED_MESSAGE,
  type ReviewQueueEntry,
  type ReviewQueueResponse,
  type ReviewScope,
  learnedRecordWhere,
  reviewQueueQuerySchema,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { fail, ok, validationFailure } from "@/lib/api-response";
import { getStudiedDirections } from "@/lib/study-directions";

/** Resolves the requested scope to an owned, named entity, or null if absent. */
async function resolveScope(
  userId: string,
  query: { classId?: string; folderId?: string }
): Promise<ReviewScope | null | undefined> {
  const select = { id: true, name: true } as const;
  if (query.classId) {
    const row = await prisma.class.findFirst({ where: { id: query.classId, userId }, select });
    return row ? { kind: "class", ...row } : null;
  }
  if (query.folderId) {
    const row = await prisma.folder.findFirst({ where: { id: query.folderId, userId }, select });
    return row ? { kind: "folder", ...row } : null;
  }
  return undefined;
}

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

  const params = new URL(request.url).searchParams;
  const parsed = reviewQueueQuerySchema.safeParse({
    classId: params.get("classId") ?? undefined,
    folderId: params.get("folderId") ?? undefined,
    flashcardId: params.get("flashcardId") ?? undefined,
  });
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.path[0] === "flashcardId")) {
      return fail(400, "VALIDATION_ERROR", FLASHCARD_REVIEW_MOVED_MESSAGE, {
        flashcardId: FLASHCARD_REVIEW_MOVED_MESSAGE,
      });
    }
    return validationFailure(parsed.error);
  }

  const resolved = await resolveScope(userId, parsed.data);
  if (resolved === null) {
    return fail(404, "NOT_FOUND", "Review scope not found.");
  }
  const scope = resolved ?? null;

  const flashcard =
    scope?.kind === "class"
      ? { folder: { classId: scope.id } }
      : scope?.kind === "folder"
        ? { folderId: scope.id }
        : undefined;

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
