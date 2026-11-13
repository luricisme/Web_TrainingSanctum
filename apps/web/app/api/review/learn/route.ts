import { learnQueueQuerySchema } from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { fail, ok, validationFailure } from "@/lib/api-response";
import { buildLearnQueue } from "@/lib/learn-queue";
import { getStudiedDirections } from "@/lib/study-directions";

/**
 * spec-4-8: the Learn session for one Flashcard (FR-17): its unlearned
 * records, then its learned, due records, both in the user's studied
 * directions (spec-4-9).
 */
export async function GET(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const params = new URL(request.url).searchParams;
  const parsed = learnQueueQuerySchema.safeParse({
    flashcardId: params.get("flashcardId") ?? undefined,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { dirs } = await getStudiedDirections(userId);
  const data = await buildLearnQueue(userId, parsed.data.flashcardId, dirs, new Date());
  if (!data) return fail(404, "NOT_FOUND", "Flashcard not found.");
  return ok(data);
}
