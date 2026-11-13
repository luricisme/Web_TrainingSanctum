import { describe, expect, it } from "vitest";
import {
  STUDY_DIRECTIONS,
  studyDirectionsSchema,
  updateSettingsSchema,
} from "@training-sanctum/domain";

// spec-4-9: the settings contract (FR-18).
describe("studyDirectionsSchema", () => {
  it.each(STUDY_DIRECTIONS)("accepts %s", (value) => {
    expect(studyDirectionsSchema.parse(value)).toBe(value);
  });

  it.each(["SIDEWAYS", "both", "", null, undefined, 1])("rejects %j", (value) => {
    expect(studyDirectionsSchema.safeParse(value).success).toBe(false);
  });

  it("lists exactly the three settings", () => {
    expect(STUDY_DIRECTIONS).toEqual(["BOTH", "TERM_TO_DEFINITION", "DEFINITION_TO_TERM"]);
  });
});

describe("updateSettingsSchema", () => {
  it("accepts a valid body", () => {
    expect(updateSettingsSchema.parse({ studyDirections: "DEFINITION_TO_TERM" })).toEqual({
      studyDirections: "DEFINITION_TO_TERM",
    });
  });

  it("rejects a missing or invalid value with a plain message", () => {
    for (const body of [{}, { studyDirections: "SIDEWAYS" }]) {
      const parsed = updateSettingsSchema.safeParse(body);
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.path).toEqual(["studyDirections"]);
    }
  });
});
