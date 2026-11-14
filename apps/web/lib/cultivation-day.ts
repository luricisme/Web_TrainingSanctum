/**
 * spec-5-6: today's CultivationDay snapshot and the facts the quest rules in
 * `@training-sanctum/domain` decide on (FR-19, AD-15). The local day comes
 * only from `User.timezone` (AD-8); learned/unlearned and every filter use the
 * AD-14 builders over the studied directions. The domain decides, this file
 * only fetches facts and persists the snapshot.
 */
import { prisma, type Prisma } from "@training-sanctum/db";
import {
  type DaySnapshot,
  type QuestFacts,
  type RecallDirection,
  buildDaySnapshot,
  learnedRecordWhere,
  levelForXp,
  parseDaySnapshot,
  toLocalCalendarDay,
  toLocalDate,
  unlearnedCardWhere,
} from "@training-sanctum/domain";
import { isUniqueViolation } from "@/lib/prisma-errors";

export type Db = Prisma.TransactionClient | typeof prisma;

export interface TodayDay {
  id: string;
  localDay: Date;
  /** The UTC instant the local day began. */
  dayStart: Date;
  snapshot: DaySnapshot;
}

/** Learned records due now over every Class ("due" as the review queue checks it). */
async function countDue(db: Db, userId: string, dirs: RecallDirection[], now: Date) {
  return db.schedulingRecord.count({
    where: { ...learnedRecordWhere(dirs), nextReviewDate: { lte: now }, card: { userId } },
  });
}

/** Live facts for the quest evaluators. */
export async function gatherQuestFacts(
  db: Db,
  userId: string,
  dirs: RecallDirection[],
  dayStart: Date,
  now: Date
): Promise<QuestFacts> {
  const [gradedToday, reviewedToday, dueCount] = await Promise.all([
    db.schedulingRecord.findMany({
      where: {
        ...learnedRecordWhere(dirs),
        AND: [{ firstGradedAt: { gte: dayStart } }],
        card: { userId },
      },
      select: { card: { select: { flashcardId: true } } },
    }),
    db.schedulingRecord.count({
      where: {
        ...learnedRecordWhere(dirs),
        AND: [{ firstGradedAt: { lt: dayStart } }, { updatedAt: { gte: dayStart } }],
        card: { userId },
      },
    }),
    countDue(db, userId, dirs, now),
  ]);

  // A Flashcard counts once none of its Cards has an unlearned record.
  const candidates = [...new Set(gradedToday.map((r) => r.card.flashcardId))];
  const flashcardsLearnedToday =
    candidates.length === 0
      ? 0
      : await db.flashcard.count({
          where: { userId, id: { in: candidates }, cards: { none: unlearnedCardWhere(dirs) } },
        });

  return { flashcardsLearnedToday, reviewedToday, dueCount };
}

/**
 * Today's snapshot, created on the first read of the local day. Targets and
 * XP come from the Bộ at creation and are frozen. A racing creator loses the
 * unique `(userId, localDay)` key and gets the existing row.
 */
export async function ensureToday(
  userId: string,
  timezone: string,
  cultivationXp: number,
  dirs: RecallDirection[],
  now: Date
): Promise<TodayDay> {
  const localDay = toLocalDate(now, timezone);
  const dayStart = toLocalCalendarDay(now, timezone);

  let row = await prisma.cultivationDay.findUnique({
    where: { userId_localDay: { userId, localDay } },
  });
  if (!row) {
    const [flashcardsWithUnlearned, dueCount] = await Promise.all([
      prisma.flashcard.count({ where: { userId, cards: { some: unlearnedCardWhere(dirs) } } }),
      countDue(prisma, userId, dirs, now),
    ]);
    const snapshot: DaySnapshot = buildDaySnapshot(levelForXp(cultivationXp).bo, {
      flashcardsWithUnlearned,
      dueCount,
    });
    try {
      row = await prisma.cultivationDay.create({
        data: { userId, localDay, quests: snapshot as unknown as Prisma.InputJsonValue },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      row = await prisma.cultivationDay.findUniqueOrThrow({
        where: { userId_localDay: { userId, localDay } },
      });
    }
  }
  return { id: row.id, localDay, dayStart, snapshot: parseDaySnapshot(row.quests) };
}
