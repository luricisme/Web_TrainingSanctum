import { describe, expect, it } from "vitest";
import { classifyInvite, inviteSchema, normalizeEmail } from "@training-sanctum/domain";

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  Friend@Example.COM ")).toBe("friend@example.com");
  });
});

describe("inviteSchema", () => {
  it("trims a valid email", () => {
    expect(inviteSchema.parse({ email: "  a@b.co " }).email).toBe("a@b.co");
  });
  it("rejects blank and malformed emails", () => {
    for (const email of ["", "   ", "not-an-email"]) {
      expect(inviteSchema.safeParse({ email }).success, email).toBe(false);
    }
    expect(inviteSchema.safeParse({}).success).toBe(false);
  });
});

describe("classifyInvite", () => {
  const base = { ownerId: "o", memberIds: ["m"], pendingInviteeIds: ["p"] };
  it("flags an unknown account", () => {
    expect(classifyInvite({ ...base, invitee: null })).toBe("unknown-account");
  });
  it("flags the Owner's own email", () => {
    expect(classifyInvite({ ...base, invitee: { id: "o" } })).toBe("own-email");
  });
  it("flags an existing Member", () => {
    expect(classifyInvite({ ...base, invitee: { id: "m" } })).toBe("already-member");
  });
  it("flags an already pending invitee", () => {
    expect(classifyInvite({ ...base, invitee: { id: "p" } })).toBe("already-pending");
  });
  it("lets a fresh account through", () => {
    expect(classifyInvite({ ...base, invitee: { id: "x" } })).toBeNull();
  });
});
