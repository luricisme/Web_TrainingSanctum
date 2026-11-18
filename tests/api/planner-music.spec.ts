import { test, expect, type PlaywrightWorkerArgs } from "@playwright/test";
import { randomUUID } from "node:crypto";

const PASSWORD = "correct-horse-battery";

async function signedInContext(
  playwright: PlaywrightWorkerArgs["playwright"],
  baseURL: string
) {
  const request = await playwright.request.newContext();
  const signUp = await request.post(`${baseURL}/api/auth/sign-up/email`, {
    headers: { Origin: baseURL },
    data: {
      email: `planner-music-${randomUUID()}@example.test`,
      password: PASSWORD,
      name: "Planner Music",
      timezone: "UTC",
    },
  });
  expect(signUp.ok()).toBeTruthy();
  return request;
}

// spec-11-1: Jamendo adapter routes. Session-guarded; a music failure is a
// 502 in the error envelope, never a thrown page error.
test.describe("planner music routes", () => {
  test("401 without a session on both routes", async ({ request, baseURL }) => {
    const search = await request.get(`${baseURL}/api/planner/music/search?q=rain`);
    expect(search.status()).toBe(401);
    expect((await search.json()).error.code).toBe("UNAUTHENTICATED");

    const track = await request.get(`${baseURL}/api/planner/music/123`);
    expect(track.status()).toBe(401);
  });

  test("non-numeric track id is 404 NOT_FOUND without calling Jamendo", async ({
    playwright,
    baseURL,
  }) => {
    const request = await signedInContext(playwright, baseURL!);
    const res = await request.get(`${baseURL}/api/planner/music/not-a-number`);
    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
    await request.dispose();
  });

  // Smoke check: relies on the test server's placeholder JAMENDO_CLIENT_ID
  // (or no network) so that Jamendo cannot answer successfully.
  test("smoke: search degrades to 502 MUSIC_UNAVAILABLE with the placeholder client id", async ({
    playwright,
    baseURL,
  }) => {
    const request = await signedInContext(playwright, baseURL!);
    const search = await request.get(
      `${baseURL}/api/planner/music/search?q=rain&tags=lofi`
    );
    expect(search.status()).toBe(502);
    expect((await search.json()).error.code).toBe("MUSIC_UNAVAILABLE");
    await request.dispose();
  });
});
