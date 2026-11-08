import { describe, it, expect } from "vitest";
import { loginSchema } from "@training-sanctum/domain";

describe("loginSchema", () => {
  it("accepts a valid email and any non-empty password", () => {
    expect(
      loginSchema.safeParse({ email: "a@example.test", password: "x" }).success
    ).toBe(true);
  });

  it("does not apply the 8-character registration minimum", () => {
    expect(
      loginSchema.safeParse({ email: "a@example.test", password: "short" }).success
    ).toBe(true);
  });

  it("trims surrounding whitespace from the email", () => {
    const result = loginSchema.safeParse({
      email: " user@example.test ",
      password: "pw",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("user@example.test");
  });

  it("rejects a malformed email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "pw" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path[0]).toBe("email");
  });

  it("rejects an empty password with a field-level message", () => {
    const result = loginSchema.safeParse({ email: "a@example.test", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path[0]).toBe("password");
      expect(result.error.issues[0].message).toBe("Password is required");
    }
  });

  it("rejects missing fields", () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
  });
});
