import { prisma } from "@training-sanctum/db";
import {
  type FolderSummary,
  deleteFolderSchema,
  isFolderNameTaken,
  renameFolderSchema,
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
        include: { _count: { select: { cards: true } } },
      });
      const summary: FolderSummary = {
        id: updated.id,
        name: updated.name,
        isUnsorted: false,
        cardCount: updated._count.cards,
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
      const cards = await tx.card.count({ where: { folderId: id } });

      if (mode === "move") {
        const unsorted = await tx.folder.findFirst({
          where: { classId: folder.classId, userId, isUnsorted: true },
        });
        if (!unsorted) {
          throw new Error(`Class ${folder.classId} has no Unsorted folder`);
        }
        await tx.card.updateMany({
          where: { folderId: id },
          data: { folderId: unsorted.id },
        });
        await tx.folder.delete({ where: { id } });
        return { cards, schedulingRecords: 0 };
      }

      const schedulingRecords = await tx.schedulingRecord.count({
        where: { card: { folderId: id } },
      });
      await tx.schedulingRecord.deleteMany({ where: { card: { folderId: id } } });
      await tx.card.deleteMany({ where: { folderId: id } });
      await tx.folder.delete({ where: { id } });
      return { cards, schedulingRecords };
    });

    logDelete({ mode, folderId: id, cardCount: summary.cards, outcome: "success" });
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
