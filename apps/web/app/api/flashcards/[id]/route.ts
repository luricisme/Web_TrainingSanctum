import { prisma } from "@training-sanctum/db";
import {
  FLASHCARD_NAME_TAKEN,
  type FlashcardCardsResponse,
  type FlashcardSummary,
  isFlashcardNameTaken,
  renameFlashcardSchema,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import {
  HttpError,
  fail,
  ok,
  readJson,
  validationFailure,
} from "@/lib/api-response";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { countLearn } from "@/lib/learn-queue";
import { getStudiedDirections } from "@/lib/study-directions";

type Context = { params: Promise<{ id: string }> };

function logDelete(entry: Record<string, unknown>): void {
  console.info(JSON.stringify({ operation: "flashcard.delete", ...entry }));
}

/**
 * The Flashcard with its Cards, newest first, plus breadcrumb ancestors and
 * what its Learn session holds (spec-4-8) and the user's study directions
 * (spec-4-9), so the viewer and the practice run need no extra fetch.
 */
export async function GET(
  request: Request,
  { params }: Context
): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  const flashcard = await prisma.flashcard.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      folder: {
        select: {
          id: true,
          name: true,
          isUnsorted: true,
          class: { select: { id: true, name: true } },
        },
      },
      cards: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          term: true,
          definition: true,
          example: true,
          context: true,
          partOfSpeech: true,
        },
      },
    },
  });
  if (!flashcard) return fail(404, "NOT_FOUND", "Flashcard not found.");

  const { folder } = flashcard;
  const { setting, dirs } = await getStudiedDirections(userId);
  const data: FlashcardCardsResponse = {
    flashcard: { id: flashcard.id, name: flashcard.name },
    folder: { id: folder.id, name: folder.name, isUnsorted: folder.isUnsorted },
    class: folder.class,
    cards: flashcard.cards,
    learn: await countLearn(userId, flashcard.id, dirs, new Date()),
    studyDirections: setting,
  };
  return ok(data);
}

export async function PATCH(
  request: Request,
  { params }: Context
): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  const body = await readJson(request);
  if (body === null) {
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }
  const parsed = renameFlashcardSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    const data = await prisma.$transaction(async (tx) => {
      const flashcard = await tx.flashcard.findFirst({ where: { id, userId } });
      if (!flashcard) {
        throw new HttpError(404, "NOT_FOUND", "Flashcard not found.");
      }
      const siblings = await tx.flashcard.findMany({
        where: { folderId: flashcard.folderId, userId, id: { not: id } },
        select: { name: true },
      });
      if (
        isFlashcardNameTaken(
          parsed.data.name,
          siblings.map((f) => f.name)
        )
      ) {
        throw new HttpError(
          400,
          "VALIDATION_ERROR",
          "Check the highlighted fields.",
          { name: FLASHCARD_NAME_TAKEN }
        );
      }
      const updated = await tx.flashcard.update({
        where: { id },
        data: { name: parsed.data.name },
        include: { _count: { select: { cards: true } } },
      });
      const summary: FlashcardSummary = {
        id: updated.id,
        name: updated.name,
        cardCount: updated._count.cards,
      };
      return summary;
    });
    return ok(data);
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    if (isUniqueViolation(error)) {
      return fail(400, "VALIDATION_ERROR", "Check the highlighted fields.", {
        name: FLASHCARD_NAME_TAKEN,
      });
    }
    throw error;
  }
}

/** Removes the Flashcard, its Cards and their Scheduling Records in one transaction. */
export async function DELETE(
  request: Request,
  { params }: Context
): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  try {
    // AD-11: every row changes or none do.
    const summary = await prisma.$transaction(async (tx) => {
      const flashcard = await tx.flashcard.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!flashcard) {
        throw new HttpError(404, "NOT_FOUND", "Flashcard not found.");
      }
      const cards = await tx.card.count({ where: { flashcardId: id } });
      const schedulingRecords = await tx.schedulingRecord.count({
        where: { card: { flashcardId: id } },
      });
      await tx.schedulingRecord.deleteMany({
        where: { card: { flashcardId: id } },
      });
      await tx.card.deleteMany({ where: { flashcardId: id } });
      await tx.flashcard.delete({ where: { id } });
      return { cards, schedulingRecords };
    });

    logDelete({
      flashcardId: id,
      cardCount: summary.cards,
      schedulingRecordCount: summary.schedulingRecords,
      outcome: "success",
    });
    return ok({ id, ...summary });
  } catch (error) {
    if (error instanceof HttpError) {
      logDelete({ flashcardId: id, outcome: `rejected:${error.status}` });
      return error.toResponse();
    }
    logDelete({
      flashcardId: id,
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(
      500,
      "INTERNAL_ERROR",
      "Could not delete the flashcard. Nothing was changed."
    );
  }
}
