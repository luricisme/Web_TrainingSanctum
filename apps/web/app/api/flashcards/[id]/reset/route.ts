import { prisma } from "@training-sanctum/db";
import { createDefaultSchedulingRecords } from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { requireClassAccess } from "@/lib/class-access";
import { logOperation } from "@/lib/log";
import { HttpError, fail, ok } from "@/lib/api-response";

type Context = { params: Promise<{ id: string }> };

/**
 * Returns every Card of the Flashcard to brand-new for the caller only: both
 * directions get the creation defaults, so the next Learn starts at card one.
 * XP events, cultivation days, cards and other learners' records are untouched.
 */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  const guard = await requireClassAccess(userId, { kind: "flashcard", id });
  if (guard.response) return guard.response;

  try {
    const records = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { timezone: true },
      });
      const [defaults] = createDefaultSchedulingRecords([userId], {
        now: new Date(),
        timezone: user.timezone,
      });
      if (!defaults) throw new HttpError(500, "INTERNAL_ERROR", "Could not reset the deck.");
      const { count } = await tx.schedulingRecord.updateMany({
        where: { userId, card: { flashcardId: id } },
        data: {
          interval: defaults.interval,
          repetitions: defaults.repetitions,
          easeFactor: defaults.easeFactor,
          firstGradedAt: defaults.firstGradedAt,
          nextReviewDate: defaults.nextReviewDate,
        },
      });
      return count;
    });
    logOperation("flashcard.reset", { userId, flashcardId: id, records, outcome: "success" });
    return ok({ id, records });
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    logOperation("flashcard.reset", {
      userId,
      flashcardId: id,
      records: 0,
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(500, "INTERNAL_ERROR", "Could not reset this deck. Nothing was changed.");
  }
}
