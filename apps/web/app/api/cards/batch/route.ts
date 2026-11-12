import { prisma } from "@training-sanctum/db";
import {
  type CardInput,
  type CreateCardsBatchResponse,
  type ImportCommitResult,
  createCardWithSchedulingRecords,
  createCardsBatchSchema,
  detectDuplicates,
  importCardLineSchema,
  validateCardRows,
  validateImportCard,
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

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Creates the Cards and their two Scheduling Records each (AD-9). */
async function createCards(
  tx: Tx,
  inputs: readonly CardInput[],
  flashcardId: string,
  userId: string
): Promise<void> {
  if (inputs.length === 0) return;
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  const now = new Date();
  const built = inputs.map((input) =>
    createCardWithSchedulingRecords(input, { now, timezone: user.timezone })
  );
  const cards = await tx.card.createManyAndReturn({
    data: built.map(({ card }) => ({ ...card, flashcardId, userId })),
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
}

/**
 * Import commit (spec-3-1): saves the valid rows, skips duplicates (re-checked
 * against the Flashcard's current Cards inside the transaction) and reports
 * every invalid row by its source line.
 */
async function commitImport(
  rows: readonly unknown[],
  flashcardId: string,
  userId: string
): Promise<Response> {
  const lineOf = (row: unknown): number | null => {
    const parsed = importCardLineSchema.safeParse(row ?? {});
    return parsed.success ? (parsed.data.line ?? null) : null;
  };

  const errors: ImportCommitResult["errors"] = [];
  const valid: { line: number | null; card: CardInput }[] = [];
  for (const row of rows) {
    const checked = validateImportCard(row);
    if (checked.ok) valid.push({ line: lineOf(row), card: checked.card });
    else errors.push({ line: lineOf(row), reason: checked.problem.message });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const flashcard = await tx.flashcard.findFirst({
        where: { id: flashcardId, userId },
        select: { id: true },
      });
      if (!flashcard) {
        throw new HttpError(404, "NOT_FOUND", "Flashcard not found.");
      }
      // Serialize concurrent imports into this Flashcard so the duplicate
      // re-check below cannot race another commit.
      await tx.$queryRaw`SELECT id FROM "flashcards" WHERE id = ${flashcard.id} FOR UPDATE`;
      const existing = await tx.card.findMany({
        where: { flashcardId: flashcard.id },
        select: { term: true },
      });

      const flags = detectDuplicates(
        valid.map((v) => v.card),
        existing.map((c) => c.term)
      );
      const duplicates: ImportCommitResult["duplicates"] = [];
      const toCreate: CardInput[] = [];
      valid.forEach((v, i) => {
        if (flags[i]!.duplicate) duplicates.push({ line: v.line, term: v.card.term });
        else toCreate.push(v.card);
      });

      await createCards(tx, toCreate, flashcard.id, userId);
      return { created: toCreate.length, duplicates, errors };
    });

    logBatch({
      source: "import",
      flashcardId,
      rows: rows.length,
      created: result.created,
      duplicates: result.duplicates.length,
      errors: result.errors.length,
      outcome: "success",
    });
    const data: ImportCommitResult = result;
    return ok(data, 200);
  } catch (error) {
    if (error instanceof HttpError) {
      logBatch({
        source: "import",
        flashcardId,
        rows: rows.length,
        outcome: `rejected:${error.status}`,
      });
      return error.toResponse();
    }
    logBatch({
      source: "import",
      flashcardId,
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

/**
 * Manual mode creates every row (Card + two Scheduling Records) or none
 * (AD-11). `source: "import"` takes the partial-save path above.
 */
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
  const { flashcardId, cards: rows, source } = parsed.data;

  if (source === "import") {
    return commitImport(rows, flashcardId, userId);
  }

  const validated = validateCardRows(rows);
  if (!validated.ok) {
    logBatch({
      flashcardId,
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
      const flashcard = await tx.flashcard.findFirst({
        where: { id: flashcardId, userId },
        select: { id: true },
      });
      if (!flashcard) {
        throw new HttpError(404, "NOT_FOUND", "Flashcard not found.");
      }
      await createCards(tx, validated.cards, flashcard.id, userId);
      return validated.cards.length;
    });

    logBatch({ flashcardId, rows: rows.length, created, outcome: "success" });
    const data: CreateCardsBatchResponse = { created };
    return ok(data, 201);
  } catch (error) {
    if (error instanceof HttpError) {
      logBatch({ flashcardId, rows: rows.length, outcome: `rejected:${error.status}` });
      return error.toResponse();
    }
    logBatch({
      flashcardId,
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
