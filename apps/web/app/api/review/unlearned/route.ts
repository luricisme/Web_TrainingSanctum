import { prisma } from "@training-sanctum/db";
import {
  type UnlearnedFlashcardsResponse,
  unlearnedCardWhere,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { ok } from "@/lib/api-response";
import { readReviewScope, scopeFlashcardWhere } from "@/lib/review-scope";
import { getStudiedDirections } from "@/lib/study-directions";

/** How many Flashcards the Empty due-queue state lists. */
const LIMIT = 3;

/**
 * spec-4-5: what the Empty due-queue state offers. Up to 3 Flashcards with
 * Unlearned Cards (AD-14 `unlearnedCardWhere` over the studied directions,
 * the same `newCards` count as Learn), newest unlearned Card first, within
 * the optional Class or Folder scope. Plus the "+ Add card" target: the
 * Flashcard of the newest Card, else the newest Flashcard, in scope.
 */
export async function GET(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const read = await readReviewScope(request, userId);
  if (read.response) return read.response;
  const flashcard = scopeFlashcardWhere(read.scope);
  const inScope = flashcard ? { flashcard } : {};

  const { dirs } = await getStudiedDirections(userId);
  const [groups, newestCard] = await Promise.all([
    prisma.card.groupBy({
      by: ["flashcardId"],
      where: { userId, ...unlearnedCardWhere(dirs), ...inScope },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: [{ _max: { createdAt: "desc" } }, { flashcardId: "asc" }],
      take: LIMIT,
    }),
    prisma.card.findFirst({
      where: { userId, ...inScope },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { flashcard: { select: { id: true, name: true } } },
    }),
  ]);

  const names = await prisma.flashcard.findMany({
    where: { id: { in: groups.map((g) => g.flashcardId) }, userId },
    select: { id: true, name: true },
  });
  const nameOf = new Map(names.map((f) => [f.id, f.name]));

  const addCardTarget =
    newestCard?.flashcard ??
    (await prisma.flashcard.findFirst({
      where: { userId, ...(flashcard ?? {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, name: true },
    }));

  const data: UnlearnedFlashcardsResponse = {
    flashcards: groups.flatMap((g) => {
      const name = nameOf.get(g.flashcardId);
      return name === undefined
        ? []
        : [{ id: g.flashcardId, name, newCards: g._count._all }];
    }),
    addCardTarget,
  };
  return ok(data);
}
