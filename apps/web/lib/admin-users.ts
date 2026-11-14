import { prisma } from "@training-sanctum/db";
import {
  levelForXp,
  type AdminUsersQuery,
  type AdminUsersResponse,
} from "@training-sanctum/domain";

/** Story 7.2: one page of users, newest first, with realm and level derived. */
export async function listUsers({ page, pageSize }: AdminUsersQuery): Promise<AdminUsersResponse> {
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, email: true, createdAt: true, disabled: true, cultivationXp: true },
    }),
    prisma.user.count(),
  ]);
  const items = users.map((u) => {
    const level = levelForXp(u.cultivationXp);
    return {
      id: u.id,
      email: u.email,
      createdAt: u.createdAt.toISOString(),
      disabled: u.disabled,
      realm: level.label,
      level: level.levelIndex + 1,
      xp: u.cultivationXp,
    };
  });
  return { items, total, page, pageSize };
}
