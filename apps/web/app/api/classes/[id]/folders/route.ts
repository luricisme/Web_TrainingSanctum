import { prisma } from "@training-sanctum/db";
import {
  type ClassFoldersResponse,
  type FolderSummary,
  createFolderSchema,
  isFolderNameTaken,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { fail, ok, readJson, validationFailure } from "@/lib/api-response";

type Context = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  { params }: Context
): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  const cls = await prisma.class.findFirst({
    where: { id, userId },
    select: { id: true, name: true },
  });
  if (!cls) return fail(404, "NOT_FOUND", "Class not found.");

  const rows = await prisma.folder.findMany({
    where: { classId: id, userId },
    select: {
      id: true,
      name: true,
      isUnsorted: true,
      flashcards: { select: { _count: { select: { cards: true } } } },
    },
  });
  const folders: FolderSummary[] = rows
    .map((f) => ({
      id: f.id,
      name: f.name,
      isUnsorted: f.isUnsorted,
      flashcardCount: f.flashcards.length,
      cardCount: f.flashcards.reduce((n, fc) => n + fc._count.cards, 0),
    }))
    .sort((a, b) =>
      a.isUnsorted !== b.isUnsorted
        ? a.isUnsorted
          ? -1
          : 1
        : a.name.localeCompare(b.name)
    );

  const data: ClassFoldersResponse = { class: cls, folders };
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
  const parsed = createFolderSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);

  const cls = await prisma.class.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!cls) return fail(404, "NOT_FOUND", "Class not found.");

  const existing = await prisma.folder.findMany({
    where: { classId: id, userId },
    select: { name: true },
  });
  if (
    isFolderNameTaken(
      parsed.data.name,
      existing.map((f) => f.name)
    )
  ) {
    return fail(400, "VALIDATION_ERROR", "Check the highlighted fields.", {
      name: "A folder with this name already exists in this class.",
    });
  }

  const created = await prisma.folder.create({
    data: { name: parsed.data.name, classId: id, userId },
  });
  const data: FolderSummary = {
    id: created.id,
    name: created.name,
    isUnsorted: false,
    flashcardCount: 0,
    cardCount: 0,
  };
  return ok(data, 201);
}
