import { prisma } from "@training-sanctum/db";
import { type CardSummary, cardInputSchema } from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { requireClassOwner } from "@/lib/class-access";
import { fail, ok, readJson, validationFailure } from "@/lib/api-response";

type Context = { params: Promise<{ id: string }> };

/** spec-2-4: replaces the five Card text fields; never touches Scheduling Records. */
export async function PATCH(
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
  const parsed = cardInputSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);

  const guard = await requireClassOwner(userId, { kind: "card", id });
  if (guard.response) return guard.response;

  const { term, definition, example, context, partOfSpeech } = parsed.data;
  const { count } = await prisma.card.updateMany({
    where: { id },
    data: { term, definition, example, context, partOfSpeech },
  });
  if (count === 0) return fail(404, "NOT_FOUND", "Card not found.");

  const data: CardSummary = { id, term, definition, example, context, partOfSpeech };
  return ok(data);
}

/** spec-2-5: deletes the Card; both Scheduling Records go via onDelete: Cascade. */
export async function DELETE(
  request: Request,
  { params }: Context
): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  const guard = await requireClassOwner(userId, { kind: "card", id });
  if (guard.response) return guard.response;

  const { count } = await prisma.card.deleteMany({ where: { id } });
  if (count === 0) return fail(404, "NOT_FOUND", "Card not found.");
  return ok({ id });
}
