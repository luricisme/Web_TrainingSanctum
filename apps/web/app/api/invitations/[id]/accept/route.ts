import { prisma } from "@training-sanctum/db";
import { createDefaultSchedulingRecords } from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { logOperation } from "@/lib/log";
import { HttpError, fail, ok } from "@/lib/api-response";

type Context = { params: Promise<{ id: string }> };

/** Invitee: accept. One transaction: membership, default records, ACCEPTED (AD-11). */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  try {
    const summary = await prisma.$transaction(async (tx) => {
      const invitation = await tx.classInvitation.findFirst({
        where: { id, inviteeId: userId },
        select: { classId: true },
      });
      if (!invitation) throw new HttpError(404, "NOT_FOUND", "Invitation not found.");

      // Re-check PENDING atomically: a concurrent accept or cancel wins.
      const claimed = await tx.classInvitation.updateMany({
        where: { id, inviteeId: userId, status: "PENDING" },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new HttpError(409, "CONFLICT", "This invitation was already answered.");
      }

      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { timezone: true },
      });
      await tx.classMember.createMany({
        data: [{ classId: invitation.classId, userId }],
        skipDuplicates: true,
      });
      const cards = await tx.card.findMany({
        where: { flashcard: { folder: { classId: invitation.classId } } },
        select: { id: true },
      });
      const defaults = createDefaultSchedulingRecords([userId], {
        now: new Date(),
        timezone: user.timezone,
      });
      const created = await tx.schedulingRecord.createMany({
        data: cards.flatMap((card) => defaults.map((record) => ({ ...record, cardId: card.id }))),
        skipDuplicates: true,
      });
      return { classId: invitation.classId, cards: cards.length, recordsCreated: created.count };
    }, { timeout: 30_000, maxWait: 10_000 });
    logOperation("invitation.accept", { invitationId: id, userId, ...summary });
    return ok({ id, classId: summary.classId });
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    logOperation("invitation.accept.failed", {
      invitationId: id,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(500, "INTERNAL_ERROR", "Could not accept the invitation. Nothing was changed.");
  }
}
