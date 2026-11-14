import { prisma } from "@training-sanctum/db";
import {
  type ClassSummary,
  deleteClassSchema,
  renameClassSchema,
  uniqueFlashcardName,
  uniqueFolderName,
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
  console.info(JSON.stringify({ operation: "class.delete", ...entry }));
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
  const parsed = renameClassSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);

  const { count } = await prisma.class.updateMany({
    where: { id, userId },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
    },
  });
  if (count === 0) return fail(404, "NOT_FOUND", "Class not found.");
  const updated = await prisma.class.findFirst({
    where: { id, userId },
    select: { name: true, color: true },
  });
  if (!updated) return fail(404, "NOT_FOUND", "Class not found.");

  const folders = await prisma.folder.findMany({
    where: { classId: id, userId },
    select: {
      flashcards: { select: { _count: { select: { cards: true } } } },
    },
  });
  const data: ClassSummary = {
    id,
    name: updated.name,
    color: updated.color,
    folderCount: folders.length,
    flashcardCount: folders.reduce((n, f) => n + f.flashcards.length, 0),
    cardCount: folders.reduce(
      (sum, f) => sum + f.flashcards.reduce((n, fc) => n + fc._count.cards, 0),
      0
    ),
  };
  return ok(data);
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
  const parsed = deleteClassSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);
  const input = parsed.data;

  try {
    // AD-11: every row changes or none do.
    const summary = await prisma.$transaction(async (tx) => {
      const source = await tx.class.findFirst({
        where: { id, userId },
        include: { folders: { orderBy: { createdAt: "asc" } } },
      });
      if (!source) throw new HttpError(404, "NOT_FOUND", "Class not found.");

      if (input.mode === "delete") {
        if (input.confirmName !== source.name) {
          throw new HttpError(
            400,
            "VALIDATION_ERROR",
            "Type the class name to confirm.",
            { confirmName: "Type the exact class name to confirm." }
          );
        }
        const folderIds = source.folders.map((f) => f.id);
        const flashcards = await tx.flashcard.count({
          where: { folderId: { in: folderIds } },
        });
        const cards = await tx.card.count({
          where: { flashcard: { folderId: { in: folderIds } } },
        });
        const schedulingRecords = await tx.schedulingRecord.count({
          where: { card: { flashcard: { folderId: { in: folderIds } } } },
        });
        await tx.class.delete({ where: { id } });
        return {
          mode: "delete" as const,
          folders: folderIds.length,
          flashcards,
          cards,
          schedulingRecords,
        };
      }

      if (input.targetClassId === id) {
        throw new HttpError(400, "VALIDATION_ERROR", "Choose a different class.", {
          targetClassId: "Choose a different class.",
        });
      }
      const target = await tx.class.findFirst({
        where: { id: input.targetClassId, userId },
        include: { folders: true },
      });
      if (!target) {
        throw new HttpError(
          400,
          "VALIDATION_ERROR",
          "Choose a class to move folders to.",
          { targetClassId: "Choose a class to move folders to." }
        );
      }
      const targetUnsorted = target.folders.find((f) => f.isUnsorted);
      if (!targetUnsorted) {
        throw new Error(`Class ${target.id} has no Unsorted folder`);
      }

      // Unsorted Flashcards merge into the target's Unsorted Folder; a
      // clashing name gets " (2)", " (3)".
      let flashcardsMerged = 0;
      let cardsMerged = 0;
      const sourceUnsorted = source.folders.find((f) => f.isUnsorted);
      if (sourceUnsorted) {
        const takenFlashcards = (
          await tx.flashcard.findMany({
            where: { folderId: targetUnsorted.id },
            select: { name: true },
          })
        ).map((f) => f.name);
        const unsortedFlashcards = await tx.flashcard.findMany({
          where: { folderId: sourceUnsorted.id },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, _count: { select: { cards: true } } },
        });
        for (const flashcard of unsortedFlashcards) {
          const name = uniqueFlashcardName(flashcard.name, takenFlashcards);
          takenFlashcards.push(name);
          await tx.flashcard.update({
            where: { id: flashcard.id },
            data: { folderId: targetUnsorted.id, name },
          });
          flashcardsMerged += 1;
          cardsMerged += flashcard._count.cards;
        }
      }

      // Every other Folder moves with its Flashcards; a clashing name gets a suffix.
      const taken = new Set(target.folders.map((f) => f.name));
      const moving = source.folders.filter((f) => !f.isUnsorted);
      for (const folder of moving) {
        const name = uniqueFolderName(folder.name, taken);
        taken.add(name);
        await tx.folder.update({
          where: { id: folder.id },
          data: { classId: target.id, name },
        });
      }
      const movingIds = moving.map((f) => f.id);
      const flashcardsMoved = await tx.flashcard.count({
        where: { folderId: { in: movingIds } },
      });
      const cardsMoved = await tx.card.count({
        where: { flashcard: { folderId: { in: movingIds } } },
      });

      await tx.class.delete({ where: { id } });
      return {
        mode: "move" as const,
        foldersMoved: moving.length,
        flashcardsMoved,
        cardsMoved,
        flashcardsMerged,
        cardsMerged,
      };
    });

    logDelete({ ...summary, classId: id, outcome: "success" });
    return ok({ id, ...summary });
  } catch (error) {
    if (error instanceof HttpError) {
      logDelete({
        mode: input.mode,
        classId: id,
        outcome: `rejected:${error.status}`,
      });
      return error.toResponse();
    }
    logDelete({
      mode: input.mode,
      classId: id,
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(
      500,
      "INTERNAL_ERROR",
      "Could not delete the class. Nothing was changed."
    );
  }
}
