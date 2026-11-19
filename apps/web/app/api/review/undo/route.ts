import { prisma } from "@training-sanctum/db";
import { undoRequestSchema } from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { logOperation } from "@/lib/log";
import {
  HttpError,
  fail,
  ok,
  readJson,
  validationFailure,
} from "@/lib/api-response";

function logUndo(entry: Record<string, unknown>): void {
  logOperation("review.undo", entry);
}

/**
 * Takes one grade back (spec-session-back-to-previous-card): restores the SM-2
 * state `POST /api/review/grade` returned as `previous`. Nothing is computed
 * here. The write only happens while the record is still as that grade left
 * it (`nextReviewDate` equals `expectedNextReviewDate`), so a grade made
 * elsewhere in the meantime is never overwritten. `updatedAt` is restored too,
 * so "reviewed today" facts are not inflated.
 */
export async function POST(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const body = await readJson(request);
  if (body === null) {
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }
  const parsed = undoRequestSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);
  const { schedulingRecordId, previous, expectedNextReviewDate } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT sr.id FROM "scheduling_records" sr WHERE sr.id = ${schedulingRecordId} AND sr."userId" = ${userId} FOR UPDATE OF sr`;
      const record = await tx.schedulingRecord.findFirst({
        where: { id: schedulingRecordId, userId },
        select: { nextReviewDate: true },
      });
      if (!record) {
        throw new HttpError(404, "NOT_FOUND", "Card not found.");
      }
      if (record.nextReviewDate.getTime() !== new Date(expectedNextReviewDate).getTime()) {
        throw new HttpError(
          409,
          "CONFLICT",
          "This card was graded again elsewhere, so the grade could not be taken back."
        );
      }
      await tx.schedulingRecord.update({
        where: { id: schedulingRecordId },
        data: {
          interval: previous.interval,
          repetitions: previous.repetitions,
          easeFactor: previous.easeFactor,
          nextReviewDate: new Date(previous.nextReviewDate),
          firstGradedAt: previous.firstGradedAt === null ? null : new Date(previous.firstGradedAt),
          updatedAt: new Date(previous.updatedAt),
        },
      });
    });

    logUndo({ userId, schedulingRecordId, records: 1, outcome: "success" });
    return ok({ id: schedulingRecordId });
  } catch (error) {
    if (error instanceof HttpError) {
      logUndo({ userId, schedulingRecordId, records: 0, outcome: `rejected:${error.status}` });
      return error.toResponse();
    }
    logUndo({
      userId,
      schedulingRecordId,
      records: 0,
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(500, "INTERNAL_ERROR", "Could not take the grade back. Nothing was changed.");
  }
}
