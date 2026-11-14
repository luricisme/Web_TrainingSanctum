import { prisma } from "@training-sanctum/db";
import {
  type FolderFlashcardsResponse,
  type FolderSummary,
  deleteFolderSchema,
  isFolderNameTaken,
  renameFolderSchema,
  uniqueFlashcardName,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import {
  HttpError,
  fail,
  ok,
  readJson,
  validationFailure,
} from "@/lib/api-response";

type Context = { params: Promise<{ id: string }> };

function logDelete(entry: Record<string, unknown>): void {
  console.info(JSON.stringify({ operation: "folder.delete", ...entry }));
}

const UNSORTED_LOCKED = "The Unsorted folder cannot be changed.";

/** spec-2-7: a Folder lists its Flashcards (with Card counts), not Cards. */
export async function GET(
  request: Request,
  { params }: Context
): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  const folder = await prisma.folder.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      isUnsorted: true,
      class: { select: { id: true, name: true, color: true } },
      flashcards: {
        select: {
          id: true,
          name: true,
          _count: { select: { cards: true } },
        },
      },
    },
  });
  if (!folder) return fail(404, "NOT_FOUND", "Folder not found.");

  const data: FolderFlashcardsResponse = {
    folder: { id: folder.id, name: folder.name, isUnsorted: folder.isUnsorted },
    class: folder.class,
    flashcards: folder.flashcards
      .map((f) => ({ id: f.id, name: f.name, cardCount: f._count.cards }))
      .sort((a, b) => a.name.localeCompare(b.name)),
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
  const parsed = renameFolderSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    const data = await prisma.$transaction(async (tx) => {
      const folder = await tx.folder.findFirst({ where: { id, userId } });
      if (!folder) throw new HttpError(404, "NOT_FOUND", "Folder not found.");
      if (folder.isUnsorted) {
        throw new HttpError(400, "UNSORTED_LOCKED", UNSORTED_LOCKED, {
          name: UNSORTED_LOCKED,
        });
      }
      const siblings = await tx.folder.findMany({
        where: { classId: folder.classId, userId, id: { not: id } },
        select: { name: true },
      });
      if (
        isFolderNameTaken(
          parsed.data.name,
          siblings.map((f) => f.name)
        )
      ) {
        throw new HttpError(
          400,
          "VALIDATION_ERROR",
          "Check the highlighted fields.",
          { name: "A folder with this name already exists in this class." }
        );
      }
      const updated = await tx.folder.update({
        where: { id },
        data: { name: parsed.data.name },
        include: {
          flashcards: { select: { _count: { select: { cards: true } } } },
        },
      });
      const summary: FolderSummary = {
        id: updated.id,
        name: updated.name,
        isUnsorted: false,
        flashcardCount: updated.flashcards.length,
        cardCount: updated.flashcards.reduce((n, f) => n + f._count.cards, 0),
      };
      return summary;
    });
    return ok(data);
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    throw error;
  }
}

export async function DELETE(
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
  const parsed = deleteFolderSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);
  const { mode } = parsed.data;

  try {
    // AD-11: every row changes or none do.
    const summary = await prisma.$transaction(async (tx) => {
      const folder = await tx.folder.findFirst({ where: { id, userId } });
      if (!folder) throw new HttpError(404, "NOT_FOUND", "Folder not found.");
      if (folder.isUnsorted) {
        throw new HttpError(400, "UNSORTED_LOCKED", UNSORTED_LOCKED);
      }
      const flashcards = await tx.flashcard.findMany({
        where: { folderId: id, userId },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      });
      const flashcardIds = flashcards.map((f) => f.id);
      const cards = await tx.card.count({
        where: { flashcardId: { in: flashcardIds } },
      });

      if (mode === "move") {
        const unsorted = await tx.folder.findFirst({
          where: { classId: folder.classId, userId, isUnsorted: true },
        });
        if (!unsorted) {
          throw new Error(`Class ${folder.classId} has no Unsorted folder`);
        }
        // A clashing Flashcard name gets " (2)", " (3)" in the Unsorted Folder.
        const taken = (
          await tx.flashcard.findMany({
            where: { folderId: unsorted.id },
            select: { name: true },
          })
        ).map((f) => f.name);
        for (const flashcard of flashcards) {
          const name = uniqueFlashcardName(flashcard.name, taken);
          taken.push(name);
          await tx.flashcard.update({
            where: { id: flashcard.id },
            data: { folderId: unsorted.id, name },
          });
        }
        await tx.folder.delete({ where: { id } });
        return { flashcards: flashcards.length, cards, schedulingRecords: 0 };
      }

      const schedulingRecords = await tx.schedulingRecord.count({
        where: { card: { flashcardId: { in: flashcardIds } } },
      });
      await tx.schedulingRecord.deleteMany({
        where: { card: { flashcardId: { in: flashcardIds } } },
      });
      await tx.card.deleteMany({ where: { flashcardId: { in: flashcardIds } } });
      await tx.flashcard.deleteMany({ where: { folderId: id } });
      await tx.folder.delete({ where: { id } });
      return { flashcards: flashcards.length, cards, schedulingRecords };
    });

    logDelete({
      mode,
      folderId: id,
      flashcardCount: summary.flashcards,
      cardCount: summary.cards,
      outcome: "success",
    });
    return ok({ id, mode, ...summary });
  } catch (error) {
    if (error instanceof HttpError) {
      logDelete({ mode, folderId: id, outcome: `rejected:${error.status}` });
      return error.toResponse();
    }
    logDelete({
      mode,
      folderId: id,
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(
      500,
      "INTERNAL_ERROR",
      "Could not delete the folder. Nothing was changed."
    );
  }
}
