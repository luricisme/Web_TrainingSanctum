import { prisma } from "@training-sanctum/db";
import {
  FLASHCARD_NAME_TAKEN,
  type FlashcardSummary,
  type FolderFlashcardsResponse,
  createFlashcardSchema,
  isFlashcardNameTaken,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { fail, ok, readJson, validationFailure } from "@/lib/api-response";
import { isUniqueViolation } from "@/lib/prisma-errors";

type Context = { params: Promise<{ id: string }> };

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
        select: { id: true, name: true, _count: { select: { cards: true } } },
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
  const parsed = createFlashcardSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);

  const folder = await prisma.folder.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!folder) return fail(404, "NOT_FOUND", "Folder not found.");

  const existing = await prisma.flashcard.findMany({
    where: { folderId: id, userId },
    select: { name: true },
  });
  if (
    isFlashcardNameTaken(
      parsed.data.name,
      existing.map((f) => f.name)
    )
  ) {
    return fail(400, "VALIDATION_ERROR", "Check the highlighted fields.", {
      name: FLASHCARD_NAME_TAKEN,
    });
  }

  let created;
  try {
    created = await prisma.flashcard.create({
      data: { name: parsed.data.name, folderId: id, userId },
    });
  } catch (error) {
    // A racing duplicate passes the pre-check but hits the unique index.
    if (isUniqueViolation(error)) {
      return fail(400, "VALIDATION_ERROR", "Check the highlighted fields.", {
        name: FLASHCARD_NAME_TAKEN,
      });
    }
    throw error;
  }
  const data: FlashcardSummary = {
    id: created.id,
    name: created.name,
    cardCount: 0,
  };
  return ok(data, 201);
}
