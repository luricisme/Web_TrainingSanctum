/**
 * Cultivation ladder (spec-5-1, FR-12, AD-15).
 *
 * The single source of the 90-level realm ladder from the PRD addendum
 * ("Cultivation realm ladder"). Retuning it means editing `REALMS` below and
 * that table together. The realm is never stored: it is always
 * `levelForXp(User.cultivationXp)`, so a demotion falls out of a lower XP.
 * AD-1: no next, react or prisma imports.
 */

export type BoNumber = 1 | 2 | 3 | 4;

/** The four Bộ, keyed by number (PRD addendum, daily quest table). */
export const BO_NAMES: Readonly<Record<BoNumber, string>> = {
  1: "Nhất Bộ Tung Hoành",
  2: "Nhị Bộ Phi Thăng",
  3: "Tam Bộ Vô Biên",
  4: "Tứ Bộ Đạp Thiên",
};

const FOUR_STAGES = ["Sơ kỳ", "Trung kỳ", "Hậu kỳ", "Đại viên mãn"] as const;
const NUMERALS = ["Nhất", "Nhị", "Tam", "Tứ", "Ngũ", "Lục", "Thất", "Bát", "Cửu"] as const;

interface RealmRow {
  bo: BoNumber;
  realm: string;
  /** Stage names in order; empty for the final, stageless level. */
  stages: readonly string[];
  /** XP to advance from stage `n` (1-based); null at the final level. */
  cost: (n: number) => number | null;
}

const flat = (xp: number) => () => xp;

/** The compact ladder table. Every value is from the PRD addendum. */
const REALMS: readonly RealmRow[] = [
  {
    bo: 1,
    realm: "Ngưng Khí",
    stages: Array.from({ length: 15 }, (_, i) => `Tầng ${i + 1}`),
    cost: (n) => 5 * n + 5,
  },
  { bo: 1, realm: "Trúc Cơ", stages: FOUR_STAGES, cost: flat(100) },
  { bo: 1, realm: "Kết Đan", stages: FOUR_STAGES, cost: flat(150) },
  { bo: 1, realm: "Nguyên Anh", stages: FOUR_STAGES, cost: flat(200) },
  { bo: 1, realm: "Hóa Thần", stages: FOUR_STAGES, cost: flat(250) },
  { bo: 1, realm: "Anh Biến", stages: FOUR_STAGES, cost: flat(300) },
  { bo: 1, realm: "Vấn Đỉnh", stages: FOUR_STAGES, cost: flat(350) },
  { bo: 1, realm: "Âm Hư", stages: FOUR_STAGES, cost: flat(400) },
  { bo: 1, realm: "Dương Thực", stages: FOUR_STAGES, cost: flat(400) },
  { bo: 2, realm: "Khuy Niết", stages: FOUR_STAGES, cost: flat(800) },
  { bo: 2, realm: "Tịnh Niết", stages: FOUR_STAGES, cost: flat(900) },
  { bo: 2, realm: "Toái Niết", stages: FOUR_STAGES, cost: flat(1_000) },
  {
    bo: 2,
    realm: "Thiên Nhân Ngũ Suy",
    stages: NUMERALS.slice(0, 5).map((n) => `${n} Suy`),
    cost: flat(1_200),
  },
  { bo: 3, realm: "Không Niết", stages: FOUR_STAGES, cost: flat(2_000) },
  { bo: 3, realm: "Không Linh", stages: FOUR_STAGES, cost: flat(2_400) },
  { bo: 3, realm: "Không Huyền", stages: FOUR_STAGES, cost: flat(2_800) },
  {
    bo: 3,
    realm: "Không Kiếp",
    stages: ["Đại Tôn", "Kim Tôn", "Thiên Tôn", "Đại Thiên Tôn"],
    cost: flat(4_000),
  },
  {
    bo: 3,
    realm: "Đạp Thiên Kiều",
    stages: NUMERALS.map((n) => `Đệ ${n} Kiều`),
    cost: flat(4_800),
  },
  { bo: 4, realm: "Đạp Thiên Cảnh", stages: [], cost: () => null },
];

/** One level of the ladder. */
export interface CultivationLevel {
  bo: BoNumber;
  realm: string;
  /** Stage label, or null for the final level (Đạp Thiên Cảnh). */
  stage: string | null;
  /** XP needed to reach the next level; null at the final level. */
  xpToNext: number | null;
  /** Cumulative XP at which this level starts. */
  startXp: number;
}

function buildLadder(): readonly CultivationLevel[] {
  const levels: CultivationLevel[] = [];
  let startXp = 0;
  for (const row of REALMS) {
    const stages: readonly (string | null)[] = row.stages.length > 0 ? row.stages : [null];
    stages.forEach((stage, i) => {
      const xpToNext = row.cost(i + 1);
      levels.push(Object.freeze({ bo: row.bo, realm: row.realm, stage, xpToNext, startXp }));
      startXp += xpToNext ?? 0;
    });
  }
  return Object.freeze(levels);
}

/** All 90 levels in order, with cumulative starts, derived once at load. */
export const CULTIVATION_LADDER: readonly CultivationLevel[] = buildLadder();

/** Where an XP total sits on the ladder (`GET /api/cultivation`). */
export interface RealmSummary {
  bo: BoNumber;
  boName: string;
  realm: string;
  stage: string | null;
  /** Display label: "{realm} · {stage}", or just the realm at the final level. */
  label: string;
  /** 0-based position in `CULTIVATION_LADDER` (0 … 89). */
  levelIndex: number;
  /** Total XP. */
  xp: number;
  /** XP earned inside the current stage. */
  xpIntoStage: number;
  /** XP the current stage costs; null at the final level. */
  xpForStage: number | null;
}

/** Shape returned by `GET /api/cultivation`: the realm plus today's quests (spec-5-6). */
export type CultivationResponse = RealmSummary & {
  quests: QuestView[];
  /** Missed-day notices from settlement, newest first, at most three (spec-5-7). */
  notices: MissedNotice[];
};

function assertXp(xp: number, name: string): void {
  if (!Number.isSafeInteger(xp) || xp < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${xp}.`);
  }
}

/** The level an XP total reaches. Throws RangeError on a bad input. */
export function levelForXp(xp: number): RealmSummary {
  assertXp(xp, "xp");
  // Binary search for the last level whose start is at or below xp.
  let lo = 0;
  let hi = CULTIVATION_LADDER.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (CULTIVATION_LADDER[mid]!.startXp <= xp) lo = mid;
    else hi = mid - 1;
  }
  const level = CULTIVATION_LADDER[lo]!;
  return {
    bo: level.bo,
    boName: BO_NAMES[level.bo],
    realm: level.realm,
    stage: level.stage,
    label: level.stage ? `${level.realm} · ${level.stage}` : level.realm,
    levelIndex: lo,
    xp,
    xpIntoStage: xp - level.startXp,
    xpForStage: level.xpToNext,
  };
}

/** Applies one XP change, floored at 0 (AD-15: XP never goes negative). */
export function applyXpDelta(current: number, delta: number): number {
  assertXp(current, "current");
  if (!Number.isSafeInteger(delta)) {
    throw new RangeError(`delta must be an integer, got ${delta}.`);
  }
  return Math.max(0, current + delta);
}

// ---------------------------------------------------------------------------
// Daily quests (spec-5-6, FR-19, AD-15). Pure rules: Route Handlers fetch the
// facts and these functions decide. Nothing here reads a grade value (SM-C1).
// ---------------------------------------------------------------------------

export type QuestKindName = "LEARN_FLASHCARDS" | "CLEAR_REVIEW";

export const QUEST_KINDS: readonly QuestKindName[] = ["LEARN_FLASHCARDS", "CLEAR_REVIEW"];

/** URL slugs of `POST /api/cultivation/quests/[kind]/claim`. */
export const QUEST_SLUGS: Readonly<Record<QuestKindName, string>> = {
  LEARN_FLASHCARDS: "learn-flashcards",
  CLEAR_REVIEW: "clear-review",
};

/** The quest kind for a path slug, or null for an unknown one. */
export function questKindForSlug(slug: string): QuestKindName | null {
  return QUEST_KINDS.find((kind) => QUEST_SLUGS[kind] === slug) ?? null;
}

/** Quest sizing by Bộ (PRD addendum): Flashcards to learn, and XP for either quest. */
export const QUEST_TABLE: Readonly<Record<BoNumber, { learnTarget: number; xp: number }>> = {
  1: { learnTarget: 1, xp: 10 },
  2: { learnTarget: 2, xp: 20 },
  3: { learnTarget: 3, xp: 40 },
  4: { learnTarget: 4, xp: 40 },
};

/** One quest as frozen into `CultivationDay.quests` when the day's snapshot is created. */
export interface QuestSnapshotEntry {
  /** Flashcards to learn (Learn quest only). */
  target?: number;
  xp: number;
  skipped: boolean;
  claimed: boolean;
}

export type DaySnapshot = Record<QuestKindName, QuestSnapshotEntry>;

/** What existed at the start of the day (when the snapshot is created). */
export interface DayStartFacts {
  /** Flashcards with at least one unlearned record in a studied direction. */
  flashcardsWithUnlearned: number;
  /** Learned records due now, over every Class. */
  dueCount: number;
}

/**
 * The day's quests, sized by the Bộ in effect when the snapshot is created.
 * Learn is skipped with no Flashcard to learn and its target is capped by
 * how many there are; Clear Review is skipped when nothing was due.
 */
export function buildDaySnapshot(bo: BoNumber, facts: DayStartFacts): DaySnapshot {
  const { learnTarget, xp } = QUEST_TABLE[bo];
  return {
    LEARN_FLASHCARDS: {
      target: Math.min(learnTarget, facts.flashcardsWithUnlearned),
      xp,
      skipped: facts.flashcardsWithUnlearned <= 0,
      claimed: false,
    },
    CLEAR_REVIEW: { xp, skipped: facts.dueCount <= 0, claimed: false },
  };
}

function isEntry(value: unknown): value is QuestSnapshotEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.xp === "number" &&
    typeof v.skipped === "boolean" &&
    typeof v.claimed === "boolean" &&
    (v.target === undefined || typeof v.target === "number")
  );
}

/** Reads a stored `CultivationDay.quests` value; throws when it is malformed. */
export function parseDaySnapshot(value: unknown): DaySnapshot {
  const v = value as Record<string, unknown> | null;
  if (!v || !isEntry(v.LEARN_FLASHCARDS) || !isEntry(v.CLEAR_REVIEW)) {
    throw new RangeError("Malformed cultivation day snapshot.");
  }
  return { LEARN_FLASHCARDS: v.LEARN_FLASHCARDS, CLEAR_REVIEW: v.CLEAR_REVIEW };
}

/** Facts read from the database now, per request. */
export interface QuestFacts {
  /** Flashcards with no unlearned record (studied directions) whose last first grade is today. */
  flashcardsLearnedToday: number;
  /** Records learned before today that were graded today. */
  reviewedToday: number;
  /** Learned records due now, over every Class. */
  dueCount: number;
}

export interface QuestEvaluation {
  met: boolean;
  /** Learn: Flashcards learned today, capped at the target. Clear Review: records reviewed today. */
  progress: number;
}

/** Learn Flashcards is met once `target` Flashcards became fully learned today. */
export function evaluateLearnFlashcards(
  entry: QuestSnapshotEntry,
  facts: Pick<QuestFacts, "flashcardsLearnedToday">
): QuestEvaluation {
  const target = entry.target ?? 0;
  return {
    met: !entry.skipped && target > 0 && facts.flashcardsLearnedToday >= target,
    progress: Math.min(target, facts.flashcardsLearnedToday),
  };
}

/** Clear Review is met when a previously learned record was graded today and nothing is due. */
export function evaluateClearReview(
  entry: QuestSnapshotEntry,
  facts: Pick<QuestFacts, "reviewedToday" | "dueCount">
): QuestEvaluation {
  return {
    met: !entry.skipped && facts.reviewedToday >= 1 && facts.dueCount === 0,
    progress: facts.reviewedToday,
  };
}

/** Evaluates one quest of a snapshot. */
export function evaluateQuest(
  kind: QuestKindName,
  snapshot: DaySnapshot,
  facts: QuestFacts
): QuestEvaluation {
  return kind === "LEARN_FLASHCARDS"
    ? evaluateLearnFlashcards(snapshot.LEARN_FLASHCARDS, facts)
    : evaluateClearReview(snapshot.CLEAR_REVIEW, facts);
}

export type QuestStatus = "locked" | "ready" | "claimed" | "skipped";

/** A quest as shown on the Cultivation page. */
export interface QuestView {
  kind: QuestKindName;
  slug: string;
  xp: number;
  status: QuestStatus;
  /** Flashcards to learn (Learn quest); null for Clear Review. */
  target: number | null;
  /** Learn: Flashcards learned today (capped). Clear Review: records reviewed today. */
  progress: number;
  /** Learned records still due (Clear Review); null for Learn. */
  dueLeft: number | null;
}

/** The two quests of a day's snapshot with their live status. */
export function questsForSnapshot(snapshot: DaySnapshot, facts: QuestFacts): QuestView[] {
  return QUEST_KINDS.map((kind) => {
    const entry = snapshot[kind];
    const { met, progress } = evaluateQuest(kind, snapshot, facts);
    const status: QuestStatus = entry.skipped
      ? "skipped"
      : entry.claimed
        ? "claimed"
        : met
          ? "ready"
          : "locked";
    return {
      kind,
      slug: QUEST_SLUGS[kind],
      xp: entry.xp,
      status,
      target: kind === "LEARN_FLASHCARDS" ? (entry.target ?? 0) : null,
      progress,
      dueLeft: kind === "CLEAR_REVIEW" ? facts.dueCount : null,
    };
  });
}

/** Response of the claim route. */
export interface QuestClaimResponse {
  kind: QuestKindName;
  xpAwarded: number;
  realm: RealmSummary;
  /** True when the claim reached a new stage. */
  breakthrough: boolean;
}

// ---------------------------------------------------------------------------
// Day settlement (spec-5-7, FR-19, AD-15). Pure: the caller loads each day's
// stored snapshot or its start-of-day facts and persists the result.
// ---------------------------------------------------------------------------

/** One local day to settle, oldest first. */
export interface SettleDayInput {
  /** The local date as a UTC-midnight Date (the `@db.Date` shape). */
  localDay: Date;
  /** The day's stored snapshot, or null when the day was never opened. */
  snapshot: DaySnapshot | null;
  /** Start-of-day facts used to rebuild a never-opened day. */
  startFacts: DayStartFacts;
}

/** One penalised quest: a `PENALTY` XpEvent in the making. */
export interface SettlePenalty {
  localDay: Date;
  kind: QuestKindName;
  /** -2 × the quest's XP, as charged (the floor may absorb part of it). */
  delta: number;
}

export interface SettleResult {
  penalties: SettlePenalty[];
  /** Total XP after every day, floored at 0 after each charge. */
  endXp: number;
}

/**
 * Settles days in order. A quest neither claimed nor skipped costs
 * `-2 × xp`, even when its work was done. Each day is sized by the Bộ of the
 * XP the previous day left, so a demotion shrinks the next day's quests.
 */
export function settleDays(startXp: number, days: readonly SettleDayInput[]): SettleResult {
  let xp = startXp;
  const penalties: SettlePenalty[] = [];
  for (const day of days) {
    const snapshot = day.snapshot ?? buildDaySnapshot(levelForXp(xp).bo, day.startFacts);
    for (const kind of QUEST_KINDS) {
      const entry = snapshot[kind];
      if (entry.skipped || entry.claimed) continue;
      const delta = -2 * entry.xp;
      penalties.push({ localDay: day.localDay, kind, delta });
      xp = applyXpDelta(xp, delta);
    }
  }
  return { penalties, endXp: xp };
}

/** A missed-days notice: one settlement run that charged XP. */
export interface MissedNotice {
  /** The run's shared `createdAt` as an ISO string; also the dismissal watermark. */
  id: string;
  /** First penalised local day, `YYYY-MM-DD`. */
  fromDay: string;
  /** Last penalised local day, `YYYY-MM-DD`. */
  toDay: string;
  /** Quests charged in the run. */
  missed: number;
  /** XP charged (positive), before the floor at 0. */
  xpLost: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayParts(iso: string): { month: string; day: number } {
  return { month: MONTHS[Number(iso.slice(5, 7)) - 1] ?? "", day: Number(iso.slice(8, 10)) };
}

/** "Nov 12: 2 quests missed, −40 XP. Now Ngưng Khí · Tầng 9." (a range reads "Nov 10–12: …"). */
export function formatMissedNotice(notice: MissedNotice, realmLabel: string): string {
  const from = dayParts(notice.fromDay);
  const to = dayParts(notice.toDay);
  const when =
    notice.fromDay === notice.toDay
      ? `${from.month} ${from.day}`
      : from.month === to.month
        ? `${from.month} ${from.day}–${to.day}`
        : `${from.month} ${from.day} – ${to.month} ${to.day}`;
  const quests = `${notice.missed} ${notice.missed === 1 ? "quest" : "quests"} missed`;
  return `${when}: ${quests}, −${notice.xpLost} XP. Now ${realmLabel}.`;
}
