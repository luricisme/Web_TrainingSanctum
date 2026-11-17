import { prisma } from "@training-sanctum/db";
import { requireSession } from "@/lib/session";
import { logOperation } from "@/lib/log";
import { fail, ok } from "@/lib/api-response";

type Context = { params: Promise<{ id: string }> };

/** Invitee: decline. Nothing is created on the invitee's side. */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  const invitation = await prisma.classInvitation.findFirst({
    where: { id, inviteeId: userId },
    select: { classId: true },
  });
  if (!invitation) return fail(404, "NOT_FOUND", "Invitation not found.");
  const { count } = await prisma.classInvitation.updateMany({
    where: { id, inviteeId: userId, status: "PENDING" },
    data: { status: "DECLINED", respondedAt: new Date() },
  });
  if (count === 0) return fail(409, "CONFLICT", "This invitation was already answered.");
  logOperation("invitation.decline", { invitationId: id, classId: invitation.classId, userId });
  return ok({ id });
}
