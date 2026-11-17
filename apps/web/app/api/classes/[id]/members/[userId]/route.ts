import { prisma } from "@training-sanctum/db";
import { requireSession } from "@/lib/session";
import { requireClassOwner } from "@/lib/class-access";
import { logOperation } from "@/lib/log";
import { HttpError, fail, ok } from "@/lib/api-response";

type Context = { params: Promise<{ id: string; userId: string }> };

/** Owner: remove a Member. Their progress in the Class is deleted (AD-11). */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const { id, userId: memberId } = await params;

  const guard = await requireClassOwner(result.session.user.id, { kind: "class", id });
  if (guard.response) return guard.response;

  try {
    const summary = await prisma.$transaction(async (tx) => {
      const removed = await tx.classMember.deleteMany({
        where: { classId: id, userId: memberId },
      });
      if (removed.count === 0) throw new HttpError(404, "NOT_FOUND", "Member not found.");
      const records = await tx.schedulingRecord.deleteMany({
        where: {
          userId: memberId,
          card: { flashcard: { folder: { classId: id } } },
        },
      });
      return { recordsRemoved: records.count };
    });
    logOperation("member.remove", { classId: id, userId: memberId, ...summary });
    return ok({ userId: memberId });
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    logOperation("member.remove.failed", {
      classId: id,
      userId: memberId,
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(500, "INTERNAL_ERROR", "Could not remove the member. Nothing was changed.");
  }
}
