import { prisma } from "@training-sanctum/db";
import { requireSession } from "@/lib/session";
import { requireClassAccess } from "@/lib/class-access";
import { logOperation } from "@/lib/log";
import { HttpError, fail, ok } from "@/lib/api-response";

type Context = { params: Promise<{ id: string }> };

/**
 * Member: leave a Class. The caller's membership and their Scheduling Records
 * for the Class's Cards are deleted together (AD-11); nobody else's records
 * change. The Owner gets 403, a stranger (or a repeat call) 404.
 */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  const guard = await requireClassAccess(userId, { kind: "class", id });
  if (guard.response) return guard.response;
  if (guard.access.role === "owner") {
    return fail(403, "FORBIDDEN", "The owner cannot leave their own class.");
  }

  try {
    const summary = await prisma.$transaction(async (tx) => {
      const removed = await tx.classMember.deleteMany({ where: { classId: id, userId } });
      if (removed.count === 0) throw new HttpError(404, "NOT_FOUND", "Class not found.");
      const records = await tx.schedulingRecord.deleteMany({
        where: { userId, card: { flashcard: { folder: { classId: id } } } },
      });
      return { recordsRemoved: records.count };
    });
    logOperation("member.leave", { classId: id, userId, ...summary });
    return ok({ id });
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    logOperation("member.leave.failed", {
      classId: id,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(500, "INTERNAL_ERROR", "Could not leave the class. Nothing was changed.");
  }
}
