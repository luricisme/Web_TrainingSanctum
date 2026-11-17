import { prisma } from "@training-sanctum/db";
import { requireSession } from "@/lib/session";
import { requireClassOwner } from "@/lib/class-access";
import { logOperation } from "@/lib/log";
import { fail, ok } from "@/lib/api-response";

type Context = { params: Promise<{ id: string; invId: string }> };

/** Owner: cancel a pending invitation, or clear a declined one. */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id, invId } = await params;

  const guard = await requireClassOwner(userId, { kind: "class", id });
  if (guard.response) return guard.response;

  const invitation = await prisma.classInvitation.findFirst({
    where: { id: invId, classId: id },
    select: { id: true, status: true, inviteeId: true },
  });
  if (!invitation) return fail(404, "NOT_FOUND", "Invitation not found.");
  const { count } = await prisma.classInvitation.deleteMany({
    where: { id: invId, classId: id, status: { not: "ACCEPTED" } },
  });
  if (count === 0) return fail(409, "CONFLICT", "This invitation was already accepted.");
  logOperation("invitation.cancel", {
    classId: id,
    invitationId: invId,
    inviteeId: invitation.inviteeId,
    status: invitation.status,
  });
  return ok({ id: invId });
}
