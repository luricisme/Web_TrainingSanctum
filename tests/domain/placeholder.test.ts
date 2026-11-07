import { describe, expect, it } from "vitest";
import { isErrorEnvelope } from "@training-sanctum/domain";

// Trivial placeholder (AC3): proves the Vitest pipeline runs against
// packages/domain with no network/DB/browser dependency (AD-12). Real
// domain-logic coverage (SM-2, import parsing, duplicate detection) lands in
// stories 1.2+ / Epic 2.
describe("packages/domain wiring", () => {
  it("exposes the shared HTTP envelope helpers", () => {
    expect(isErrorEnvelope({ data: "ok" })).toBe(false);
    expect(isErrorEnvelope({ error: { code: "E", message: "bad" } })).toBe(
      true
    );
  });
});
