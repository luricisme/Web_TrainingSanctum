import { prisma } from "@training-sanctum/db";
import { type CultivationResponse, levelForXp } from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { ok } from "@/lib/api-response";

/**
 * spec-5-1: the user's realm summary (FR-12, AD-15). Read-only: the realm is
 * derived from `cultivationXp` and never stored. Settlement and the daily
 * quests join this route in Stories 5.6 and 5.7.
 */
export async function GET(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: result.session.user.id },
    select: { cultivationXp: true },
  });
  const data: CultivationResponse = levelForXp(user.cultivationXp);
  return ok(data);
}
