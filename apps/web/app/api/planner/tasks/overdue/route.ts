import { prisma } from "@training-sanctum/db";
import { type OverdueSummary, toLocalDate } from "@training-sanctum/domain";
import { requirePlannerSession } from "@/lib/planner-sessions";
import { ok } from "@/lib/api-response";
import { overdueWhere, userTimezone } from "@/lib/planner-tasks";

/** spec-8-4: count of open Tasks on days before the user's today (AD-8). */
export async function GET(request: Request): Promise<Response> {
  const result = await requirePlannerSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const today = toLocalDate(new Date(), await userTimezone(userId));
  const count = await prisma.task.count({ where: overdueWhere(userId, today) });
  return ok<OverdueSummary>({ count });
}
