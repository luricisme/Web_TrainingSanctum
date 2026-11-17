import { prisma } from "@training-sanctum/db";
import type { InvitationSummary } from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { ok } from "@/lib/api-response";

/** The caller's pending invitations, oldest first, for the bell. */
export async function GET(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;

  const rows = await prisma.classInvitation.findMany({
    where: { inviteeId: result.session.user.id, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      classId: true,
      class: { select: { name: true, user: { select: { name: true } } } },
    },
  });
  const grouped = rows.length
    ? await prisma.card.groupBy({
        by: ["flashcardId"],
        where: { flashcard: { folder: { classId: { in: rows.map((r) => r.classId) } } } },
        _count: { _all: true },
      })
    : [];
  const flashcards = grouped.length
    ? await prisma.flashcard.findMany({
        where: { id: { in: grouped.map((g) => g.flashcardId) } },
        select: { id: true, folder: { select: { classId: true } } },
      })
    : [];
  const classOf = new Map(flashcards.map((f) => [f.id, f.folder.classId]));
  const cardsByClass = new Map<string, number>();
  for (const g of grouped) {
    const classId = classOf.get(g.flashcardId);
    if (classId) cardsByClass.set(classId, (cardsByClass.get(classId) ?? 0) + g._count._all);
  }
  const data: InvitationSummary[] = rows.map((row) => ({
    id: row.id,
    classId: row.classId,
    className: row.class.name,
    ownerName: row.class.user.name,
    cardCount: cardsByClass.get(row.classId) ?? 0,
  }));
  return ok(data);
}
