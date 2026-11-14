import { prisma } from "@training-sanctum/db";
import {
  type ClassSummary,
  UNSORTED_FOLDER_NAME,
  createClassSchema,
  nextClassColor,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { fail, ok, readJson, validationFailure } from "@/lib/api-response";

export async function GET(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const [classes, folders] = await Promise.all([
    prisma.class.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, color: true },
    }),
    prisma.folder.findMany({
      where: { userId },
      select: {
        classId: true,
        flashcards: { select: { _count: { select: { cards: true } } } },
      },
    }),
  ]);

  const counts = new Map<
    string,
    { folders: number; flashcards: number; cards: number }
  >();
  for (const folder of folders) {
    const entry = counts.get(folder.classId) ?? {
      folders: 0,
      flashcards: 0,
      cards: 0,
    };
    entry.folders += 1;
    entry.flashcards += folder.flashcards.length;
    entry.cards += folder.flashcards.reduce((n, f) => n + f._count.cards, 0);
    counts.set(folder.classId, entry);
  }

  const data: ClassSummary[] = classes
    .map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      folderCount: counts.get(c.id)?.folders ?? 0,
      flashcardCount: counts.get(c.id)?.flashcards ?? 0,
      cardCount: counts.get(c.id)?.cards ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return ok(data);
}

export async function POST(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const body = await readJson(request);
  if (body === null) {
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }
  const parsed = createClassSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);

  // The Class and its single Unsorted Folder are created together or not at all.
  const created = await prisma.$transaction(async (tx) => {
    const color =
      parsed.data.color ??
      nextClassColor(await tx.class.count({ where: { userId } }));
    const cls = await tx.class.create({
      data: { name: parsed.data.name, color, userId },
    });
    await tx.folder.create({
      data: {
        name: UNSORTED_FOLDER_NAME,
        isUnsorted: true,
        classId: cls.id,
        userId,
      },
    });
    return cls;
  });

  const data: ClassSummary = {
    id: created.id,
    name: created.name,
    color: created.color,
    folderCount: 1,
    flashcardCount: 0,
    cardCount: 0,
  };
  return ok(data, 201);
}
