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

/** Shape returned by `GET /api/cultivation` (quests join it in Story 5.6). */
export type CultivationResponse = RealmSummary;

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
