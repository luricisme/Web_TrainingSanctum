import { prisma, type Prisma } from "@training-sanctum/db";
import {
  type DaySnapshot,
  type QuestClaimResponse,
  applyXpDelta,
  evaluateQuest,
  levelForXp,
  parseDaySnapshot,
  questKindForSlug,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { HttpError, fail, ok } from "@/lib/api-response";
import { getStudiedDirections } from "@/lib/study-directions";
import { ensureToday, gatherQuestFacts } from "@/lib/cultivation-day";

/**
 * spec-5-6: claims one of today's quests (FR-19, AD-15). With settlement
 * (5.7) this is one of the only two writers of XP. The condition is re-checked
 * here, then the XpEvent, the cached `cultivationXp` and the quest's claimed
 * flag are written in one transaction under a row lock on the day, so
 * concurrent claims award once. The user ticks the quest; nothing auto-claims.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ kind: string }> }
): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const { kind: slug } = await context.params;
  const kind = questKindForSlug(slug);
  if (!kind) return fail(404, "NOT_FOUND", "Quest not found.");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { cultivationXp: true, timezone: true },
  });
  const { dirs } = await getStudiedDirections(userId);
  const now = new Date();
  const day = await ensureToday(userId, user.timezone, user.cultivationXp, dirs, now);

  try {
    const data = await prisma.$transaction(async (tx): Promise<QuestClaimResponse> => {
      // Serialize claims of this day, then re-read: a concurrent claim may
      // have flipped the flag or changed the XP since the reads above.
      await tx.$queryRaw`SELECT id FROM "cultivation_days" WHERE id = ${day.id} FOR UPDATE`;
      const row = await tx.cultivationDay.findUniqueOrThrow({ where: { id: day.id } });
      const snapshot = parseDaySnapshot(row.quests);
      const entry = snapshot[kind];

      if (entry.skipped) {
        throw new HttpError(409, "QUEST_SKIPPED", "There is nothing to do for this quest today.");
      }
      if (entry.claimed) {
        throw new HttpError(409, "QUEST_ALREADY_CLAIMED", "This quest is already claimed.");
      }
      const facts = await gatherQuestFacts(tx, userId, dirs, day.dayStart, new Date());
      if (!evaluateQuest(kind, snapshot, facts).met) {
        throw new HttpError(409, "QUEST_NOT_MET", "This quest is not complete yet.");
      }

      const current = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { cultivationXp: true },
      });
      const before = levelForXp(current.cultivationXp);
      const nextXp = applyXpDelta(current.cultivationXp, entry.xp);
      const next: DaySnapshot = { ...snapshot, [kind]: { ...entry, claimed: true } };

      await tx.xpEvent.create({
        data: { userId, localDay: day.localDay, questKind: kind, delta: entry.xp, reason: "CLAIM" },
      });
      await tx.user.update({ where: { id: userId }, data: { cultivationXp: nextXp } });
      await tx.cultivationDay.update({
        where: { id: day.id },
        data: { quests: next as unknown as Prisma.InputJsonValue },
      });

      const realm = levelForXp(nextXp);
      return {
        kind,
        xpAwarded: entry.xp,
        realm,
        breakthrough: realm.levelIndex > before.levelIndex,
      };
    });
    console.info(
      JSON.stringify({ operation: "cultivation.claim", kind, xp: data.xpAwarded, outcome: "claimed" })
    );
    return ok(data);
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    throw error;
  }
}
