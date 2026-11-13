/**
 * The optional Class or Folder scope of a Review (spec-4-3), shared by
 * `GET /api/review/queue` and `GET /api/review/unlearned` (spec-4-5): one
 * parse of `?classId=` / `?folderId=` (a `flashcardId` is a 400, since
 * Flashcard review moved to Learn), and one ownership check (404).
 */
import { prisma } from "@training-sanctum/db";
import {
  FLASHCARD_REVIEW_MOVED_MESSAGE,
  type ReviewScope,
  reviewQueueQuerySchema,
} from "@training-sanctum/domain";
import { fail, validationFailure } from "@/lib/api-response";

/** Resolves the requested scope to an owned, named entity, or null if absent. */
async function resolveScope(
  userId: string,
  query: { classId?: string; folderId?: string }
): Promise<ReviewScope | null | undefined> {
  const select = { id: true, name: true } as const;
  if (query.classId) {
    const row = await prisma.class.findFirst({ where: { id: query.classId, userId }, select });
    return row ? { kind: "class", ...row } : null;
  }
  if (query.folderId) {
    const row = await prisma.folder.findFirst({ where: { id: query.folderId, userId }, select });
    return row ? { kind: "folder", ...row } : null;
  }
  return undefined;
}

/**
 * The request's scope (null when unscoped), or the error response to return:
 * 400 for an invalid query, 404 for a Class or Folder the user does not own.
 */
export async function readReviewScope(
  request: Request,
  userId: string
): Promise<{ scope: ReviewScope | null; response?: undefined } | { response: Response }> {
  const params = new URL(request.url).searchParams;
  const parsed = reviewQueueQuerySchema.safeParse({
    classId: params.get("classId") ?? undefined,
    folderId: params.get("folderId") ?? undefined,
    flashcardId: params.get("flashcardId") ?? undefined,
  });
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.path[0] === "flashcardId")) {
      return {
        response: fail(400, "VALIDATION_ERROR", FLASHCARD_REVIEW_MOVED_MESSAGE, {
          flashcardId: FLASHCARD_REVIEW_MOVED_MESSAGE,
        }),
      };
    }
    return { response: validationFailure(parsed.error) };
  }

  const resolved = await resolveScope(userId, parsed.data);
  if (resolved === null) {
    return { response: fail(404, "NOT_FOUND", "Review scope not found.") };
  }
  return { scope: resolved ?? null };
}

/** A Flashcard `where` limiting rows to the scope, or undefined when unscoped. */
export function scopeFlashcardWhere(scope: ReviewScope | null) {
  if (scope?.kind === "class") return { folder: { classId: scope.id } };
  if (scope?.kind === "folder") return { folderId: scope.id };
  return undefined;
}
