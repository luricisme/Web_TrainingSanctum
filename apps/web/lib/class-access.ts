/**
 * Class access guards (spec-12-2). One ownership check and one access check
 * for every class-scoped Route Handler. A stranger or a missing entity is a
 * `404 NOT_FOUND`; a Member attempting a write is a `403 FORBIDDEN`.
 *
 * Any entity id (class, folder, flashcard, card) resolves to its Class with
 * one query joining upwards; the Class and its Members are then loaded once
 * and the guard returns them so routes reuse the learners for fan-out.
 */
import { prisma, type Prisma } from "@training-sanctum/db";
import {
  type ClassRole,
  classAccess,
  classLearnerIds,
  createDefaultSchedulingRecords,
} from "@training-sanctum/domain";
import { fail } from "@/lib/api-response";
import { logOperation } from "@/lib/log";

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type ClassTarget = {
  kind: "class" | "folder" | "flashcard" | "card";
  id: string;
};

export interface ClassAccess {
  cls: { id: string; name: string; color: string; userId: string };
  /** The Owner's display name (Story 12.4). */
  ownerName: string;
  members: { userId: string }[];
  role: ClassRole;
  /** The Owner first, then Members. */
  learnerIds: string[];
}

export type ClassGuardResult =
  | { access: ClassAccess; response?: undefined }
  | { access?: undefined; response: Response };

const NOT_FOUND_MESSAGE: Record<ClassTarget["kind"], string> = {
  class: "Class not found.",
  folder: "Folder not found.",
  flashcard: "Flashcard not found.",
  card: "Card not found.",
};

async function resolveClassId(target: ClassTarget): Promise<string | null> {
  const { id } = target;
  switch (target.kind) {
    case "class":
      return id;
    case "folder":
      return (
        (await prisma.folder.findUnique({ where: { id }, select: { classId: true } }))
          ?.classId ?? null
      );
    case "flashcard":
      return (
        (
          await prisma.flashcard.findUnique({
            where: { id },
            select: { folder: { select: { classId: true } } },
          })
        )?.folder.classId ?? null
      );
    case "card":
      return (
        (
          await prisma.card.findUnique({
            where: { id },
            select: { flashcard: { select: { folder: { select: { classId: true } } } } },
          })
        )?.flashcard.folder.classId ?? null
      );
  }
}

/** The caller's access to the target's Class, or null for a stranger or a missing entity. */
export async function loadClassAccess(
  userId: string,
  target: ClassTarget
): Promise<ClassAccess | null> {
  const classId = await resolveClassId(target);
  if (!classId) return null;
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      name: true,
      color: true,
      userId: true,
      user: { select: { name: true } },
      members: { select: { userId: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!cls) return null;
  const { members, user, ...rest } = cls;
  const role = classAccess(userId, rest, members);
  if (!role) return null;
  return { cls: rest, ownerName: user.name, members, role, learnerIds: classLearnerIds(rest, members) };
}

/** Reads and study: the Owner and Members pass. */
export async function requireClassAccess(
  userId: string,
  target: ClassTarget
): Promise<ClassGuardResult> {
  const access = await loadClassAccess(userId, target);
  if (!access) {
    return { response: fail(404, "NOT_FOUND", NOT_FOUND_MESSAGE[target.kind]) };
  }
  return { access };
}

/** Writes: only the Owner passes; a Member is 403, a stranger 404. */
export async function requireClassOwner(
  userId: string,
  target: ClassTarget
): Promise<ClassGuardResult> {
  const result = await requireClassAccess(userId, target);
  if (result.response) return result;
  if (result.access.role !== "owner") {
    return {
      response: fail(403, "FORBIDDEN", "Only the class owner can change this."),
    };
  }
  return result;
}

/**
 * Aligns every Card matched by `cardWhere` with a new set of learners: drops
 * the records of learners absent from `learnerIds` and creates default
 * records (two per learner) for learners lacking them. Run inside the
 * caller's `$transaction` (AD-11). Logs one structured line.
 */
export async function reseedCardRecords(
  tx: Tx,
  cardWhere: Prisma.CardWhereInput,
  learnerIds: readonly string[],
  context: { classId: string; timezone: string; operation: string }
): Promise<void> {
  const removed = await tx.schedulingRecord.deleteMany({
    where: { card: cardWhere, userId: { notIn: [...learnerIds] } },
  });
  const cards = await tx.card.findMany({ where: cardWhere, select: { id: true } });
  const defaults = createDefaultSchedulingRecords(learnerIds, {
    now: new Date(),
    timezone: context.timezone,
  });
  const created = await tx.schedulingRecord.createMany({
    data: cards.flatMap((card) => defaults.map((record) => ({ ...record, cardId: card.id }))),
    skipDuplicates: true,
  });
  logOperation(context.operation, {
    classId: context.classId,
    cards: cards.length,
    recordsRemoved: removed.count,
    recordsCreated: created.count,
  });
}
