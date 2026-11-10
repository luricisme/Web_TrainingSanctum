import { prisma } from "@training-sanctum/db";
import { type MoveCardResponse, moveCardSchema } from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { fail, ok, readJson, validationFailure } from "@/lib/api-response";

type Context = { params: Promise<{ id: string }> };

/**
 * spec-2-6: re-parents a Card to another of the user's Folders. Only
 * `Card.folderId` changes; Scheduling Records and Card text are untouched.
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
  const parsed = moveCardSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);
  const { folderId } = parsed.data;

  const card = await prisma.card.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!card) return fail(404, "NOT_FOUND", "Card not found.");

  const folder = await prisma.folder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  });
  if (!folder) return fail(404, "FOLDER_NOT_FOUND", "Folder not found.");

  const { count } = await prisma.card.updateMany({
    where: { id, userId },
    data: { folderId },
  });
  if (count === 0) return fail(404, "NOT_FOUND", "Card not found.");

  const data: MoveCardResponse = { id, folderId };
  return ok(data);
}
