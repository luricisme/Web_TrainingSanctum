import { prisma } from "@training-sanctum/db";
import {
  DAY_MS,
  INTERVAL_BUCKETS,
  type IntervalBucketKey,
  type IntervalDistribution,
  type StatsResponse,
  intervalBucket,
  learnedCardWhere,
  localDayStart,
  toLocalDate,
  unlearnedCardWhere,
  xpSeries,
} from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { ok } from "@/lib/api-response";
import { getStudiedDirections } from "@/lib/study-directions";

const HISTORY_DAYS = 30;

/**
 * Card totals, the SM-2 interval distribution per studied Recall Direction and
 * the 30-day XP history (FR-15, AD-14, AD-15). Read-only; every figure is
 * derived on request so it reflects the latest grades.
 */
export async function GET(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;
  const userId = result.session.user.id;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  const { dirs } = await getStudiedDirections(userId);

  const [learned, unlearned, learnedGroups, newGroups, events] = await Promise.all([
    prisma.card.count({ where: { userId, ...learnedCardWhere(dirs) } }),
    prisma.card.count({ where: { userId, ...unlearnedCardWhere(dirs) } }),
    prisma.schedulingRecord.groupBy({
      by: ["direction", "interval"],
      where: { card: { userId }, firstGradedAt: { not: null }, direction: { in: dirs } },
      _count: { _all: true },
    }),
    prisma.schedulingRecord.groupBy({
      by: ["direction"],
      where: { card: { userId }, firstGradedAt: null, direction: { in: dirs } },
      _count: { _all: true },
    }),
    prisma.xpEvent.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { delta: true, createdAt: true },
    }),
  ]);

  const distribution: IntervalDistribution[] = dirs.map((direction) => {
    const counts = new Map<IntervalBucketKey, number>();
    for (const group of learnedGroups) {
      if (group.direction !== direction) continue;
      const key = intervalBucket(group.interval);
      counts.set(key, (counts.get(key) ?? 0) + group._count._all);
    }
    counts.set("new", newGroups.find((g) => g.direction === direction)?._count._all ?? 0);
    const buckets = INTERVAL_BUCKETS.map((b) => ({ ...b, count: counts.get(b.key) ?? 0 }));
    return { direction, buckets, total: buckets.reduce((sum, b) => sum + b.count, 0) };
  });

  const today = toLocalDate(new Date(), user.timezone);
  const days = Array.from(
    { length: HISTORY_DAYS },
    (_, i) => new Date(today.getTime() - (HISTORY_DAYS - 1 - i) * DAY_MS)
  );

  const data: StatsResponse = {
    cards: { total: learned + unlearned, learned, unlearned },
    distribution,
    xpHistory: xpSeries(events, days, (day) => localDayStart(day, user.timezone)),
  };
  return ok(data);
}
