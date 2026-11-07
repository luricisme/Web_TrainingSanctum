import { describe, expect, it } from "vitest";
import { registerSchema } from "@training-sanctum/domain";

// AC3 (spec-1-2): invalid email format or missing/short password fail Zod
// validation before any Better Auth call is made (AD-6).
describe("registerSchema (spec-1-2)", () => {
  it("accepts a valid email, password (>=8 chars), and timezone", () => {
    const result = registerSchema.safeParse({
      email: "person@example.com",
      password: "correct-horse",
      timezone: "America/New_York",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email format", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "correct-horse",
      timezone: "America/New_York",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "email")).toBe(
        true
      );
    }
  });

  it("rejects a missing password", () => {
    const result = registerSchema.safeParse({
      email: "person@example.com",
      timezone: "America/New_York",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === "password")
      ).toBe(true);
    }
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({
      email: "person@example.com",
      password: "short1",
      timezone: "America/New_York",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === "password")
      ).toBe(true);
    }
  });

  it("rejects a missing timezone", () => {
    const result = registerSchema.safeParse({
      email: "person@example.com",
      password: "correct-horse",
      timezone: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === "timezone")
      ).toBe(true);
    }
  });
});
