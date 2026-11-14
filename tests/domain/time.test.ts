import { describe, expect, it } from "vitest";
import { toLocalCalendarDay, toLocalDate } from "@training-sanctum/domain";

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
