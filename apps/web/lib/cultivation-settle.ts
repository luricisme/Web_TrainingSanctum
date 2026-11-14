/**
 * spec-5-7: day settlement (FR-19, AD-15). Every local day after
 * `User.cultivationSettledThrough` through yesterday is settled in order, in
 * one transaction under a row lock on the user, so a day is charged exactly
 * once however many requests race. The domain's `settleDays` decides; this
 * file loads each day's snapshot or start-of-day facts and writes the result.
 * Day arithmetic uses `User.timezone` (AD-8).
 */
import { prisma } from "@training-sanctum/db";
import {
  DAY_MS,
  type DayStartFacts,
  type MissedNotice,
  type RecallDirection,
  type SettleDayInput,
  localDayStart,
  parseDaySnapshot,
  settleDays,
  toLocalDate,
} from "@training-sanctum/domain";

/** A 365-day absence settles well inside this, but a slow database gets room. */
const SETTLE_TIMEOUT_MS = 60_000;

export interface SettleOutcome {
  /** `User.cultivationXp` after settlement. */
  xp: number;
}

interface RecordFact {
  flashcardId: string;
  createdAt: Date;
  firstGradedAt: Date | null;
  nextReviewDate: Date;
}

/**
 * What existed at the start of `dayStart`, from the records as they are now
 * (the only history there is, so approximate): a Flashcard with a record that
 * already existed and was not yet first graded; a learned record due by then.
 */
function startFacts(records: readonly RecordFact[], dayStart: Date): DayStartFacts {
  const t = dayStart.getTime();
  const unlearned = new Set<string>();
  let dueCount = 0;
  for (const r of records) {
    const graded = r.firstGradedAt?.getTime() ?? null;
    if (r.createdAt.getTime() < t && (graded === null || graded >= t)) {
      unlearned.add(r.flashcardId);
    }
    if (graded !== null && graded < t && r.nextReviewDate.getTime() <= t) dueCount++;
  }
  return { flashcardsWithUnlearned: unlearned.size, dueCount };
}

/**
 * Settles every unsettled past day for the user and returns the post-settlement
 * XP. Cheap when nothing is pending (one comparison, no lock). A null
 * `cultivationSettledThrough` is set to yesterday with no penalty.
 */
export async function settleUser(
  userId: string,
  timezone: string,
  settledThrough: Date | null,
  xp: number,
  dirs: RecallDirection[],
  now: Date
): Promise<SettleOutcome> {
  const today = toLocalDate(now, timezone);
  const yesterday = new Date(today.getTime() - DAY_MS);
  if (settledThrough && settledThrough.getTime() >= yesterday.getTime()) return { xp };

  return prisma.$transaction(
    async (tx): Promise<SettleOutcome> => {
      // Serialise settlement per user, then re-read: the loser of a race sees
      // the winner's settled state and does nothing.
      await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { cultivationXp: true, cultivationSettledThrough: true },
      });
      const from = user.cultivationSettledThrough;
      if (from && from.getTime() >= yesterday.getTime()) return { xp: user.cultivationXp };

      let endXp = user.cultivationXp;
      let events = 0;
      if (from) {
        const dayList: Date[] = [];
        for (let t = from.getTime() + DAY_MS; t <= yesterday.getTime(); t += DAY_MS) {
          dayList.push(new Date(t));
        }
        const stored = await tx.cultivationDay.findMany({
          where: { userId, localDay: { gt: from, lte: yesterday } },
        });
        const byDay = new Map(stored.map((row) => [row.localDay.getTime(), row.quests]));
        const needsRebuild = dayList.some((d) => !byDay.has(d.getTime()));
        const records: RecordFact[] = needsRebuild
          ? (
              await tx.schedulingRecord.findMany({
                where: { direction: { in: dirs }, card: { userId } },
                select: {
                  createdAt: true,
                  firstGradedAt: true,
                  nextReviewDate: true,
                  card: { select: { flashcardId: true } },
                },
              })
            ).map((r) => ({
              createdAt: r.createdAt,
              firstGradedAt: r.firstGradedAt,
              nextReviewDate: r.nextReviewDate,
              flashcardId: r.card.flashcardId,
            }))
          : [];

        const inputs: SettleDayInput[] = dayList.map((localDay) => {
          const quests = byDay.get(localDay.getTime());
          return {
            localDay,
            snapshot: quests === undefined ? null : parseDaySnapshot(quests),
            startFacts:
              quests === undefined
                ? startFacts(records, localDayStart(localDay, timezone))
                : { flashcardsWithUnlearned: 0, dueCount: 0 },
          };
        });
        const settled = settleDays(user.cultivationXp, inputs);
        endXp = settled.endXp;
        events = settled.penalties.length;
        if (events > 0) {
          // One shared createdAt groups the run's events into one notice.
          const runAt = new Date();
          await tx.xpEvent.createMany({
            data: settled.penalties.map((p) => ({
              userId,
              localDay: p.localDay,
              questKind: p.kind,
              delta: p.delta,
              reason: "PENALTY" as const,
              createdAt: runAt,
            })),
          });
        }
      }

      // Advance only from the value read; a mismatch rolls the run back.
      const advanced = await tx.user.updateMany({
        where: { id: userId, cultivationSettledThrough: from },
        data: { cultivationXp: endXp, cultivationSettledThrough: yesterday },
      });
      if (advanced.count !== 1) throw new Error("Settlement raced: through-date moved.");
      console.info(
        JSON.stringify({
          operation: "cultivation.settle",
          events,
          outcome: from ? "settled" : "first-run",
        })
      );
      return { xp: endXp };
    },
    { timeout: SETTLE_TIMEOUT_MS, maxWait: SETTLE_TIMEOUT_MS }
  );
}

/** The newest three settlement runs that charged XP, newest first. */
export async function getMissedNotices(userId: string): Promise<MissedNotice[]> {
  const runs = await prisma.xpEvent.groupBy({
    by: ["createdAt"],
    where: { userId, reason: "PENALTY" },
    orderBy: { createdAt: "desc" },
    take: 3,
    _count: { _all: true },
    _sum: { delta: true },
    _min: { localDay: true },
    _max: { localDay: true },
  });
  return runs.map((run) => ({
    id: run.createdAt.toISOString(),
    fromDay: (run._min.localDay ?? run.createdAt).toISOString().slice(0, 10),
    toDay: (run._max.localDay ?? run.createdAt).toISOString().slice(0, 10),
    missed: run._count._all,
    xpLost: -(run._sum.delta ?? 0),
  }));
}
