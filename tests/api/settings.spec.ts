import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";

async function newUser(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  base: string
): Promise<APIRequestContext> {
  const request = await playwright.request.newContext();
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: {
      email: `settings-${randomUUID()}@example.test`,
      password: PASSWORD,
      name: "Settings Test",
      timezone: "UTC",
    },
  });
  expect(response.ok()).toBeTruthy();
  return request;
}

// spec-4-9: GET / PATCH /api/settings (FR-18).
test.describe("/api/settings", () => {
  test("unauthenticated requests return 401", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const ctx = await playwright.request.newContext();
    const get = await ctx.get(`${base}/api/settings`);
    expect(get.status()).toBe(401);
    expect((await get.json()).error.code).toBe("UNAUTHENTICATED");
    const patch = await ctx.patch(`${base}/api/settings`, {
      data: { studyDirections: "BOTH" },
    });
    expect(patch.status()).toBe(401);
    expect((await patch.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("a new account studies both directions", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await newUser(playwright, base);
    const res = await request.get(`${base}/api/settings`);
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toEqual({ studyDirections: "BOTH" });
  });

  test("PATCH saves each setting and returns it", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await newUser(playwright, base);
    for (const studyDirections of ["TERM_TO_DEFINITION", "DEFINITION_TO_TERM", "BOTH"]) {
      const res = await request.patch(`${base}/api/settings`, { data: { studyDirections } });
      expect(res.status()).toBe(200);
      expect((await res.json()).data).toEqual({ studyDirections });
      const read = await request.get(`${base}/api/settings`);
      expect((await read.json()).data).toEqual({ studyDirections });
    }
  });

  test("an invalid body returns 400 and changes nothing", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await newUser(playwright, base);
    for (const data of [{ studyDirections: "SIDEWAYS" }, {}, { studyDirections: null }]) {
      const res = await request.patch(`${base}/api/settings`, { data });
      expect(res.status()).toBe(400);
      const { error } = await res.json();
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.fields.studyDirections).toBeTruthy();
    }
    const malformed = await request.patch(`${base}/api/settings`, {
      headers: { "Content-Type": "application/json" },
      data: "{not json",
    });
    expect(malformed.status()).toBe(400);
    expect((await malformed.json()).error).toBeTruthy();

    const read = await request.get(`${base}/api/settings`);
    expect((await read.json()).data).toEqual({ studyDirections: "BOTH" });
  });
});
