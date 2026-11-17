import { prisma } from "@training-sanctum/db";
import {
  type MoveFlashcardResponse,
  classLearnerIds,
  moveFlashcardSchema,
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
import { isUniqueViolation } from "@/lib/prisma-errors";
import {
  loadClassAccess,
  reseedCardRecords,
  requireClassOwner,
} from "@/lib/class-access";

type Context = { params: Promise<{ id: string }> };

/**
 * Re-parents a Flashcard (with all its Cards) to another of the user's
 * Folders. A name clash in the target gets " (2)", " (3)"; the read of the
 * target names and the update share one transaction.
 */
export async function POST(
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
  const parsed = moveFlashcardSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);
  const { folderId } = parsed.data;

  const source = await requireClassOwner(userId, { kind: "flashcard", id });
  if (source.response) return source.response;
  // Moving into a Folder is a write there too: only its Class's Owner may.
  const targetAccess = await loadClassAccess(userId, { kind: "folder", id: folderId });
  if (!targetAccess) {
    return fail(404, "FOLDER_NOT_FOUND", "Folder not found.");
  }
  if (targetAccess.role !== "owner") {
    return fail(403, "FORBIDDEN", "Only the class owner can change this.");
  }

  try {
    const data = await prisma.$transaction(async (tx) => {
      const flashcard = await tx.flashcard.findUnique({ where: { id } });
      if (!flashcard) {
        throw new HttpError(404, "NOT_FOUND", "Flashcard not found.");
      }
      const folder = await tx.folder.findUnique({
        where: { id: folderId },
        select: { id: true },
      });
      if (!folder) {
        throw new HttpError(404, "FOLDER_NOT_FOUND", "Folder not found.");
      }
      if (flashcard.folderId === folder.id) {
        const same: MoveFlashcardResponse = {
          id: flashcard.id,
          folderId: flashcard.folderId,
          name: flashcard.name,
        };
        return same;
      }
      const targets = await tx.flashcard.findMany({
        where: { folderId: folder.id },
        select: { name: true },
      });
      const name = uniqueFlashcardName(
        flashcard.name,
        targets.map((f) => f.name)
      );
      const updated = await tx.flashcard.update({
        where: { id },
        data: { folderId: folder.id, name },
        select: { id: true, folderId: true, name: true },
      });
      if (targetAccess.cls.id !== source.access.cls.id) {
        // The Cards now belong to another Class: realign learners' records.
        const owner = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { timezone: true },
        });
        const targetMembers = await tx.classMember.findMany({
          where: { classId: targetAccess.cls.id },
          select: { userId: true },
          orderBy: { createdAt: "asc" },
        });
        await reseedCardRecords(
          tx,
          { flashcardId: id },
          classLearnerIds(targetAccess.cls, targetMembers),
          {
            classId: targetAccess.cls.id,
            timezone: owner.timezone,
            operation: "flashcard.move.reseed",
          }
        );
      }
      const moved: MoveFlashcardResponse = updated;
      return moved;
    });
    return ok(data);
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    if (isUniqueViolation(error)) {
      return fail(409, "NAME_CONFLICT", "That name was just taken. Try again.");
    }
    // A concurrent delete between the reads and the update.
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "P2025") return fail(404, "NOT_FOUND", "Flashcard not found.");
    if (code === "P2003") return fail(404, "FOLDER_NOT_FOUND", "Folder not found.");
    throw error;
  }
}
