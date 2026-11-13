import { describe, expect, it } from "vitest";
import {
  BO_NAMES,
  CULTIVATION_LADDER,
  applyXpDelta,
  levelForXp,
} from "@training-sanctum/domain";

// spec-5-1: the 90-level ladder from the PRD addendum (FR-12, AD-15).
// Thresholds are written out by hand so the test checks the table, not itself.
const NGUNG_KHI_TOTAL = 675; // sum of 5·n + 5 for n = 1 … 15
const NHAT_BO_TOTAL = NGUNG_KHI_TOTAL + 4 * (100 + 150 + 200 + 250 + 300 + 350 + 400 + 400); // 9,275
const NHI_BO_TOTAL = NHAT_BO_TOTAL + 4 * (800 + 900 + 1_000) + 5 * 1_200; // 26,075
const FINAL_START = NHI_BO_TOTAL + 4 * (2_000 + 2_400 + 2_800 + 4_000) + 9 * 4_800; // 114,075

/** Each realm, the XP its first stage starts at, its Bộ and per-stage cost. */
const REALM_STARTS: Array<[string, number, number, number | null]> = [
  ["Ngưng Khí", 0, 1, 10],
  ["Trúc Cơ", 675, 1, 100],
  ["Kết Đan", 1_075, 1, 150],
  ["Nguyên Anh", 1_675, 1, 200],
  ["Hóa Thần", 2_475, 1, 250],
  ["Anh Biến", 3_475, 1, 300],
  ["Vấn Đỉnh", 4_675, 1, 350],
  ["Âm Hư", 6_075, 1, 400],
  ["Dương Thực", 7_675, 1, 400],
  ["Khuy Niết", 9_275, 2, 800],
  ["Tịnh Niết", 12_475, 2, 900],
  ["Toái Niết", 16_075, 2, 1_000],
  ["Thiên Nhân Ngũ Suy", 20_075, 2, 1_200],
  ["Không Niết", 26_075, 3, 2_000],
  ["Không Linh", 34_075, 3, 2_400],
  ["Không Huyền", 43_675, 3, 2_800],
  ["Không Kiếp", 54_875, 3, 4_000],
  ["Đạp Thiên Kiều", 70_875, 3, 4_800],
  ["Đạp Thiên Cảnh", 114_075, 4, null],
];

describe("CULTIVATION_LADDER", () => {
  it("has 90 levels", () => {
    expect(CULTIVATION_LADDER).toHaveLength(90);
  });

  it("starts at 0 and each level starts where the previous one's cost ends", () => {
    expect(CULTIVATION_LADDER[0]!.startXp).toBe(0);
    for (let i = 1; i < CULTIVATION_LADDER.length; i++) {
      const prev = CULTIVATION_LADDER[i - 1]!;
      expect(CULTIVATION_LADDER[i]!.startXp).toBe(prev.startXp + prev.xpToNext!);
    }
  });

  it("only the final level has no cost and no stage", () => {
    const last = CULTIVATION_LADDER[89]!;
    expect(last).toMatchObject({ bo: 4, realm: "Đạp Thiên Cảnh", stage: null, xpToNext: null });
    expect(CULTIVATION_LADDER.slice(0, 89).every((l) => l.xpToNext !== null && l.stage)).toBe(true);
  });

  it("prices Ngưng Khí Tầng n at 5·n + 5", () => {
    const ngungKhi = CULTIVATION_LADDER.filter((l) => l.realm === "Ngưng Khí");
    expect(ngungKhi.map((l) => l.stage)).toEqual(
      Array.from({ length: 15 }, (_, i) => `Tầng ${i + 1}`)
    );
    expect(ngungKhi.map((l) => l.xpToNext)).toEqual(
      Array.from({ length: 15 }, (_, i) => 5 * (i + 1) + 5)
    );
  });

  it("groups levels into the four Bộ", () => {
    const counts = [1, 2, 3, 4].map((bo) => CULTIVATION_LADDER.filter((l) => l.bo === bo).length);
    expect(counts).toEqual([47, 17, 25, 1]);
    expect(BO_NAMES).toEqual({
      1: "Nhất Bộ Tung Hoành",
      2: "Nhị Bộ Phi Thăng",
      3: "Tam Bộ Vô Biên",
      4: "Tứ Bộ Đạp Thiên",
    });
  });

  it("uses Sơ kỳ / Trung kỳ / Hậu kỳ / Đại viên mãn for four-stage realms", () => {
    expect(CULTIVATION_LADDER.filter((l) => l.realm === "Trúc Cơ").map((l) => l.stage)).toEqual([
      "Sơ kỳ",
      "Trung kỳ",
      "Hậu kỳ",
      "Đại viên mãn",
    ]);
  });

  it.each([
    ["Thiên Nhân Ngũ Suy", ["Nhất Suy", "Nhị Suy", "Tam Suy", "Tứ Suy", "Ngũ Suy"]],
    ["Không Kiếp", ["Đại Tôn", "Kim Tôn", "Thiên Tôn", "Đại Thiên Tôn"]],
    [
      "Đạp Thiên Kiều",
      [
        "Đệ Nhất Kiều",
        "Đệ Nhị Kiều",
        "Đệ Tam Kiều",
        "Đệ Tứ Kiều",
        "Đệ Ngũ Kiều",
        "Đệ Lục Kiều",
        "Đệ Thất Kiều",
        "Đệ Bát Kiều",
        "Đệ Cửu Kiều",
      ],
    ],
  ])("names the %s stages", (realm, stages) => {
    expect(CULTIVATION_LADDER.filter((l) => l.realm === realm).map((l) => l.stage)).toEqual(stages);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(CULTIVATION_LADDER)).toBe(true);
    expect(Object.isFrozen(CULTIVATION_LADDER[0])).toBe(true);
  });
});

describe("levelForXp", () => {
  it("a new account is Ngưng Khí · Tầng 1, 0 / 10", () => {
    expect(levelForXp(0)).toEqual({
      bo: 1,
      boName: "Nhất Bộ Tung Hoành",
      realm: "Ngưng Khí",
      stage: "Tầng 1",
      label: "Ngưng Khí · Tầng 1",
      levelIndex: 0,
      xp: 0,
      xpIntoStage: 0,
      xpForStage: 10,
    });
  });

  it("inside Ngưng Khí: 25 XP is Tầng 3, 0 / 20", () => {
    expect(levelForXp(25)).toMatchObject({
      label: "Ngưng Khí · Tầng 3",
      xpIntoStage: 0,
      xpForStage: 20,
    });
    expect(levelForXp(24)).toMatchObject({
      label: "Ngưng Khí · Tầng 2",
      xpIntoStage: 14,
      xpForStage: 15,
    });
  });

  it("realm boundary: 675 XP is Trúc Cơ · Sơ kỳ, 0 / 100", () => {
    expect(levelForXp(NGUNG_KHI_TOTAL)).toMatchObject({
      bo: 1,
      label: "Trúc Cơ · Sơ kỳ",
      xpIntoStage: 0,
      xpForStage: 100,
    });
    expect(levelForXp(NGUNG_KHI_TOTAL - 1)).toMatchObject({
      label: "Ngưng Khí · Tầng 15",
      xpIntoStage: 79,
      xpForStage: 80,
    });
  });

  it("Bộ boundary: all of Dương Thực reaches Nhị Bộ, Khuy Niết · Sơ kỳ", () => {
    expect(levelForXp(NHAT_BO_TOTAL)).toMatchObject({
      bo: 2,
      boName: "Nhị Bộ Phi Thăng",
      label: "Khuy Niết · Sơ kỳ",
      xpIntoStage: 0,
      xpForStage: 800,
    });
    expect(levelForXp(NHAT_BO_TOTAL - 1)).toMatchObject({
      bo: 1,
      label: "Dương Thực · Đại viên mãn",
    });
    expect(levelForXp(NHI_BO_TOTAL)).toMatchObject({ bo: 3, label: "Không Niết · Sơ kỳ" });
  });

  it.each(REALM_STARTS)("%s starts at %i XP", (realm, start, bo, cost) => {
    const first = levelForXp(start);
    expect(first).toMatchObject({ realm, bo, xpIntoStage: 0, xpForStage: cost });
    if (start > 0) expect(levelForXp(start - 1).realm).not.toBe(realm);
  });

  it("final level: Tứ Bộ, Đạp Thiên Cảnh, no stage cost, XP keeps counting", () => {
    expect(FINAL_START).toBe(114_075);
    expect(levelForXp(FINAL_START)).toEqual({
      bo: 4,
      boName: "Tứ Bộ Đạp Thiên",
      realm: "Đạp Thiên Cảnh",
      stage: null,
      label: "Đạp Thiên Cảnh",
      levelIndex: 89,
      xp: FINAL_START,
      xpIntoStage: 0,
      xpForStage: null,
    });
    expect(levelForXp(FINAL_START + 50_000)).toMatchObject({
      label: "Đạp Thiên Cảnh",
      xp: FINAL_START + 50_000,
      xpIntoStage: 50_000,
      xpForStage: null,
    });
    expect(levelForXp(FINAL_START - 1)).toMatchObject({
      label: "Đạp Thiên Kiều · Đệ Cửu Kiều",
      levelIndex: 88,
    });
  });

  it("every level's start maps back to that level", () => {
    CULTIVATION_LADDER.forEach((level, i) => {
      expect(levelForXp(level.startXp).levelIndex).toBe(i);
    });
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "throws RangeError for %s",
    (xp) => {
      expect(() => levelForXp(xp)).toThrow(RangeError);
    }
  );
});

describe("applyXpDelta", () => {
  it("adds a claim and subtracts a penalty", () => {
    expect(applyXpDelta(0, 10)).toBe(10);
    expect(applyXpDelta(100, -40)).toBe(60);
  });

  it("floors at 0", () => {
    expect(applyXpDelta(30, -40)).toBe(0);
    expect(applyXpDelta(0, -160)).toBe(0);
  });

  it("replays a ledger in order, flooring at each step", () => {
    const deltas = [10, 10, -40, 20, -20, 10];
    // 10, 20, 0 (floored), 20, 0, 10 — not the raw sum of -10.
    expect(deltas.reduce(applyXpDelta, 0)).toBe(10);
  });

  it("demotion falls out of a lower XP", () => {
    const xp = applyXpDelta(NGUNG_KHI_TOTAL + 10, -40);
    expect(levelForXp(xp).label).toBe("Ngưng Khí · Tầng 15");
  });

  it.each([
    [-1, 10],
    [1.5, 10],
    [10, 0.5],
    [10, Number.NaN],
    [Number.POSITIVE_INFINITY, 1],
  ])("throws RangeError for (%s, %s)", (current, delta) => {
    expect(() => applyXpDelta(current, delta)).toThrow(RangeError);
  });
});
