import { prisma } from "@training-sanctum/db";
import {
  type GradeResult,
  applyGrade,
  gradeRequestSchema,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import {
  HttpError,
  fail,
  ok,
  readJson,
  validationFailure,
} from "@/lib/api-response";

function logGrade(entry: Record<string, unknown>): void {
  console.info(JSON.stringify({ operation: "review.grade", ...entry }));
}

/**
 * spec-4-2: applies one Grade to one Scheduling Record. This is the only
 * route that writes `interval`, `repetitions`, `easeFactor`,
 * `nextReviewDate` and `firstGradedAt` (AD-4); the SM-2 values come from
 * `applyGrade` alone. `firstGradedAt` (AD-14, spec-4-6) is set to the grade
 * time only while it is null and never changed afterwards. Only the graded
 * record is written, so the Card's other direction is untouched.
 */
export async function POST(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const body = await readJson(request);
  if (body === null) {
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }
  const parsed = gradeRequestSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);
  const { schedulingRecordId, grade } = parsed.data;

  try {
    const data = await prisma.$transaction(async (tx) => {
      // Serialize concurrent grades of this record so the due check below
      // and the write cannot interleave with another submit. Scoped to the
      // owner so nobody can lock another user's row.
      await tx.$queryRaw`SELECT sr.id FROM "scheduling_records" sr JOIN "cards" c ON c.id = sr."cardId" WHERE sr.id = ${schedulingRecordId} AND c."userId" = ${userId} FOR UPDATE OF sr`;
      const record = await tx.schedulingRecord.findFirst({
        where: { id: schedulingRecordId, card: { userId } },
        select: {
          interval: true,
          repetitions: true,
          easeFactor: true,
          nextReviewDate: true,
          firstGradedAt: true,
          card: { select: { user: { select: { timezone: true } } } },
        },
      });
      if (!record) {
        throw new HttpError(404, "NOT_FOUND", "Card not found.");
      }

      const now = new Date();
      if (record.nextReviewDate.getTime() > now.getTime()) {
        throw new HttpError(
          409,
          "NOT_DUE",
          "This card is not due yet. It may already have been graded."
        );
      }

      const next = applyGrade(record, grade, {
        now,
        timeZone: record.card.user.timezone,
      });
      const updated = await tx.schedulingRecord.update({
        where: { id: schedulingRecordId },
        data: {
          interval: next.interval,
          repetitions: next.repetitions,
          easeFactor: next.easeFactor,
          nextReviewDate: next.nextReviewDate,
          ...(record.firstGradedAt === null ? { firstGradedAt: now } : {}),
        },
        select: {
          id: true,
          cardId: true,
          direction: true,
          interval: true,
          repetitions: true,
          easeFactor: true,
          nextReviewDate: true,
        },
      });
      const graded: GradeResult = {
        ...updated,
        nextReviewDate: updated.nextReviewDate.toISOString(),
      };
      return graded;
    });

    logGrade({ userId, schedulingRecordId, grade, records: 1, outcome: "success" });
    return ok(data);
  } catch (error) {
    if (error instanceof HttpError) {
      logGrade({
        userId,
        schedulingRecordId,
        grade,
        records: 0,
        outcome: `rejected:${error.status}`,
      });
      return error.toResponse();
    }
    logGrade({
      userId,
      schedulingRecordId,
      grade,
      records: 0,
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(
      500,
      "INTERNAL_ERROR",
      "Could not save the grade. Nothing was changed."
    );
  }
}
