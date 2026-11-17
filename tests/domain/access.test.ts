import { describe, expect, it } from "vitest";
import { classAccess, classLearnerIds } from "@training-sanctum/domain";

const cls = { userId: "owner" };

describe("classAccess", () => {
  it("returns owner for the Owner", () => {
    expect(classAccess("owner", cls, [{ userId: "m1" }])).toBe("owner");
  });
  it("returns member for a Member", () => {
    expect(classAccess("m1", cls, [{ userId: "m1" }, { userId: "m2" }])).toBe("member");
  });
  it("returns null for a stranger", () => {
    expect(classAccess("x", cls, [{ userId: "m1" }])).toBeNull();
    expect(classAccess("x", cls, [])).toBeNull();
  });
  it("owner wins even if also listed as a member", () => {
    expect(classAccess("owner", cls, [{ userId: "owner" }])).toBe("owner");
  });
});

describe("classLearnerIds", () => {
  it("lists the owner first, then members", () => {
    expect(classLearnerIds(cls, [{ userId: "m1" }, { userId: "m2" }])).toEqual(["owner", "m1", "m2"]);
  });
  it("has only the owner when there are no members", () => {
    expect(classLearnerIds(cls, [])).toEqual(["owner"]);
  });
  it("removes duplicates", () => {
    expect(
      classLearnerIds(cls, [{ userId: "m1" }, { userId: "m1" }, { userId: "owner" }])
    ).toEqual(["owner", "m1"]);
  });
});
