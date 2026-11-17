/**
 * Class access rules (spec-12-2). Pure: AD-1, no next, react or prisma
 * imports. The Owner is `Class.userId`; Members are the other learners.
 */

export type ClassRole = "owner" | "member";

export interface ClassOwnerRef {
  userId: string;
}

export interface ClassMemberRef {
  userId: string;
}

/** The caller's role in a Class, or null for a stranger. */
export function classAccess(
  userId: string,
  cls: ClassOwnerRef,
  members: readonly ClassMemberRef[]
): ClassRole | null {
  if (cls.userId === userId) return "owner";
  return members.some((m) => m.userId === userId) ? "member" : null;
}

/** Every learner of a Class: the Owner first, then Members, no duplicates. */
export function classLearnerIds(
  cls: ClassOwnerRef,
  members: readonly ClassMemberRef[]
): string[] {
  return [...new Set([cls.userId, ...members.map((m) => m.userId)])];
}
