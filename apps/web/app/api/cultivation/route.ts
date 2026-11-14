import { prisma } from "@training-sanctum/db";
import {
  type CultivationResponse,
  levelForXp,
  questsForSnapshot,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { ok } from "@/lib/api-response";
import { getStudiedDirections } from "@/lib/study-directions";
import { ensureToday, gatherQuestFacts } from "@/lib/cultivation-day";
import { getMissedNotices, settleUser } from "@/lib/cultivation-settle";

/**
 * The user's realm summary and today's quests (FR-12, FR-19, AD-15). The
 * realm is derived from `cultivationXp` and never stored. The first read of
 * the local day creates its CultivationDay snapshot; later reads only
 * evaluate it. Past days settle first (spec-5-7), so today's snapshot is
 * sized by the post-settlement realm.
 */
export async function GET(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { cultivationXp: true, cultivationSettledThrough: true, timezone: true },
  });
  const { dirs } = await getStudiedDirections(userId);
  const now = new Date();
  const { xp } = await settleUser(
    userId,
    user.timezone,
    user.cultivationSettledThrough,
    user.cultivationXp,
    dirs,
    now
  );
  const day = await ensureToday(userId, user.timezone, xp, dirs, now);
  const facts = await gatherQuestFacts(prisma, userId, dirs, day.dayStart, now);

  const data: CultivationResponse = {
    ...levelForXp(xp),
    quests: questsForSnapshot(day.snapshot, facts),
    notices: await getMissedNotices(userId),
  };
  return ok(data);
}
