import { prisma } from "@training-sanctum/db";
import {
  type CreateCardsBatchResponse,
  createCardWithSchedulingRecords,
  createCardsBatchSchema,
  validateCardRows,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import {
  HttpError,
  fail,
  ok,
  readJson,
  validationFailure,
} from "@/lib/api-response";

function logBatch(entry: Record<string, unknown>): void {
  console.info(JSON.stringify({ operation: "cards.batch", ...entry }));
}

/** Creates every row (Card + two Scheduling Records) or none (AD-11). */
export async function POST(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const body = await readJson(request);
  if (body === null) {
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }
  const parsed = createCardsBatchSchema.safeParse(body);
  if (!parsed.success) {
    // A bad row count is a batch error: report it as `details`, not `fields`.
    const cardsIssue = parsed.error.issues.find(
      (i) => i.path[0] === "cards" && i.path.length === 1
    );
    if (cardsIssue && parsed.error.issues.length === 1) {
      const count = Array.isArray((body as { cards?: unknown }).cards)
        ? (body as { cards: unknown[] }).cards.length
        : 0;
      return fail(
        400,
        "VALIDATION_ERROR",
        "Nothing was created.",
        undefined,
        [{ line: Math.max(count > 200 ? 201 : 1, 1), reason: cardsIssue.message }]
      );
    }
    return validationFailure(parsed.error);
  }
  const { folderId, cards: rows } = parsed.data;

  const validated = validateCardRows(rows);
  if (!validated.ok) {
    logBatch({
      folderId,
      rows: rows.length,
      outcome: "rejected:400",
    });
    return fail(
      400,
      "VALIDATION_ERROR",
      "Some cards are invalid. Nothing was created.",
      undefined,
      validated.errors
    );
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const folder = await tx.folder.findFirst({
        where: { id: folderId, userId },
        select: { id: true },
      });
      if (!folder) throw new HttpError(404, "NOT_FOUND", "Folder not found.");
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { timezone: true },
      });

      const now = new Date();
      const built = validated.cards.map((input) =>
        createCardWithSchedulingRecords(input, { now, timezone: user.timezone })
      );
      const cards = await tx.card.createManyAndReturn({
        data: built.map(({ card }) => ({
          ...card,
          folderId: folder.id,
          userId,
        })),
        select: { id: true },
      });
      await tx.schedulingRecord.createMany({
        data: cards.flatMap((card, i) =>
          built[i].schedulingRecords.map((record) => ({
            ...record,
            cardId: card.id,
          }))
        ),
      });
      return validated.cards.length;
    });

    logBatch({ folderId, rows: rows.length, created, outcome: "success" });
    const data: CreateCardsBatchResponse = { created };
    return ok(data, 201);
  } catch (error) {
    if (error instanceof HttpError) {
      logBatch({ folderId, rows: rows.length, outcome: `rejected:${error.status}` });
      return error.toResponse();
    }
    logBatch({
      folderId,
      rows: rows.length,
      outcome: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(
      500,
      "INTERNAL_ERROR",
      "Could not save the cards. Nothing was changed."
    );
  }
}
