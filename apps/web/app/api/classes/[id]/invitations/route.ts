import { prisma } from "@training-sanctum/db";
import {
  INVITE_REFUSAL_MESSAGES,
  type ShareInvitation,
  type ShareState,
  classifyInvite,
  inviteSchema,
  normalizeEmail,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { requireClassOwner } from "@/lib/class-access";
import { logOperation } from "@/lib/log";
import { fail, ok, readJson, validationFailure } from "@/lib/api-response";

type Context = { params: Promise<{ id: string }> };

const inviteeSelect = { select: { email: true, name: true } } as const;

const invitationSelect = {
  id: true,
  status: true,
  createdAt: true,
  respondedAt: true,
  invitee: inviteeSelect,
} as const;

function toShareInvitation(row: {
  id: string;
  status: ShareInvitation["status"];
  createdAt: Date;
  respondedAt: Date | null;
  invitee: { email: string; name: string };
}): ShareInvitation {
  return {
    id: row.id,
    status: row.status,
    email: row.invitee.email,
    name: row.invitee.name,
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
  };
}

/** Owner: the Class's Members and every invitation, newest first. */
export async function GET(request: Request, { params }: Context): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const { id } = await params;

  const guard = await requireClassOwner(result.session.user.id, { kind: "class", id });
  if (guard.response) return guard.response;

  const [members, invitations] = await Promise.all([
    prisma.classMember.findMany({
      where: { classId: id },
      orderBy: { createdAt: "asc" },
      select: { userId: true, user: inviteeSelect },
    }),
    prisma.classInvitation.findMany({
      where: { classId: id },
      orderBy: { createdAt: "desc" },
      select: invitationSelect,
    }),
  ]);
  const data: ShareState = {
    members: members.map((m) => ({ userId: m.userId, email: m.user.email, name: m.user.name })),
    invitations: invitations.map(toShareInvitation),
  };
  return ok(data);
}

/** Owner: invite a registered user by email. */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;
  const { id } = await params;

  const body = await readJson(request);
  if (body === null) return fail(400, "INVALID_JSON", "Request body must be JSON.");
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);

  const guard = await requireClassOwner(userId, { kind: "class", id });
  if (guard.response) return guard.response;

  const invitee = await prisma.user.findFirst({
    where: { email: { equals: normalizeEmail(parsed.data.email), mode: "insensitive" } },
    select: { id: true },
  });
  const pending = invitee
    ? await prisma.classInvitation.findMany({
        where: { classId: id, status: "PENDING", inviteeId: invitee.id },
        select: { inviteeId: true },
      })
    : [];
  const refusal = classifyInvite({
    invitee,
    ownerId: userId,
    memberIds: guard.access.members.map((m) => m.userId),
    pendingInviteeIds: pending.map((p) => p.inviteeId),
  });
  if (refusal || !invitee) {
    return fail(400, "VALIDATION_ERROR", "Check the highlighted fields.", {
      email: INVITE_REFUSAL_MESSAGES[refusal ?? "unknown-account"],
    });
  }

  try {
    // A declined (or earlier accepted-then-removed) row is reused.
    const existing = await prisma.classInvitation.findFirst({
      where: { classId: id, inviteeId: invitee.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const row = existing
      ? await prisma.classInvitation.update({
          where: { id: existing.id },
          data: { status: "PENDING", respondedAt: null, inviterId: userId, createdAt: new Date() },
          select: invitationSelect,
        })
      : await prisma.classInvitation.create({
          data: { classId: id, inviterId: userId, inviteeId: invitee.id },
          select: invitationSelect,
        });
    logOperation("invitation.create", {
      classId: id,
      invitationId: row.id,
      inviterId: userId,
      inviteeId: invitee.id,
    });
    return ok(toShareInvitation(row), 201);
  } catch (error) {
    // The partial unique index: a concurrent invite got there first.
    if ((error as { code?: string }).code === "P2002") {
      return fail(400, "VALIDATION_ERROR", "Check the highlighted fields.", {
        email: INVITE_REFUSAL_MESSAGES["already-pending"],
      });
    }
    throw error;
  }
}
