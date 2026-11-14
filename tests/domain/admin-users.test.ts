import { describe, expect, it } from "vitest";
import { adminUsersQuerySchema } from "@training-sanctum/domain";

// Story 7.2: the Admin user list query contract.
describe("adminUsersQuerySchema", () => {
  it("defaults to page 1, 20 per page", () => {
    expect(adminUsersQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it("coerces numeric strings", () => {
    expect(adminUsersQuerySchema.parse({ page: "3", pageSize: "100" })).toEqual({
      page: 3,
      pageSize: 100,
    });
  });

  it.each([
    { page: "0" },
    { page: "-1" },
    { page: "abc" },
    { page: "1.5" },
    { page: "1000001" },
    { page: "99999999999999999" },
    { pageSize: "0" },
    { pageSize: "101" },
    { pageSize: "500" },
  ])("rejects %j", (input) => {
    expect(adminUsersQuerySchema.safeParse(input).success).toBe(false);
  });
});
