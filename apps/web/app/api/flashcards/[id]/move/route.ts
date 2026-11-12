import { prisma } from "@training-sanctum/db";
import {
  type MoveFlashcardResponse,
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

  try {
    const data = await prisma.$transaction(async (tx) => {
      const flashcard = await tx.flashcard.findFirst({ where: { id, userId } });
      if (!flashcard) {
        throw new HttpError(404, "NOT_FOUND", "Flashcard not found.");
      }
      const folder = await tx.folder.findFirst({
        where: { id: folderId, userId },
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
        where: { folderId: folder.id, userId },
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
