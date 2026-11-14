import { describe, expect, it } from "vitest";
import { localDayStart, toLocalCalendarDay, toLocalDate } from "@training-sanctum/domain";

// spec-5-6: the UTC-midnight date of the local calendar day (CultivationDay.localDay).
describe("toLocalDate", () => {
  it("is the local Y-M-D at UTC midnight", () => {
    // 2026-11-14 18:00 UTC is already 15 Nov in Ho Chi Minh (UTC+7).
    const now = new Date("2026-11-14T18:00:00Z");
    expect(toLocalDate(now, "Asia/Ho_Chi_Minh").toISOString()).toBe("2026-11-15T00:00:00.000Z");
    expect(toLocalDate(now, "UTC").toISOString()).toBe("2026-11-14T00:00:00.000Z");
    expect(toLocalDate(now, "America/Los_Angeles").toISOString()).toBe("2026-11-14T00:00:00.000Z");
  });

  it("matches the day toLocalCalendarDay starts", () => {
    const now = new Date("2026-11-14T18:00:00Z");
    const start = toLocalCalendarDay(now, "Asia/Ho_Chi_Minh");
    expect(toLocalDate(start, "Asia/Ho_Chi_Minh").toISOString()).toBe("2026-11-15T00:00:00.000Z");
    expect(toLocalDate(new Date(start.getTime() - 1), "Asia/Ho_Chi_Minh").toISOString()).toBe(
      "2026-11-14T00:00:00.000Z"
    );
  });
});

describe("localDayStart", () => {
  it("returns the instant a local date began, including DST days", () => {
    const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
    expect(localDayStart(day(2026, 11, 12), "UTC").toISOString()).toBe("2026-11-12T00:00:00.000Z");
    expect(localDayStart(day(2026, 11, 12), "Asia/Ho_Chi_Minh").toISOString()).toBe("2026-11-11T17:00:00.000Z");
    // US spring-forward: 23-hour day, starts at 05:00Z; next day starts 04:00Z.
    expect(localDayStart(day(2026, 3, 8), "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(localDayStart(day(2026, 3, 9), "America/New_York").toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(localDayStart(day(2026, 11, 1), "Pacific/Kiritimati").toISOString()).toBe("2026-10-31T10:00:00.000Z");
  });
});
