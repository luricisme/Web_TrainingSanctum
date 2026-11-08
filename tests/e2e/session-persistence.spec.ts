import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const PASSWORD = "correct-horse-battery";
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

// spec-1-4: closing and reopening the browser keeps the user logged in.
test("session survives a browser restart (persistent cookie, fresh context)", async ({
  browser,
}) => {
  const email = `e2e-persist-${randomUUID()}@example.test`;

  const first = await browser.newContext();
  const page = await first.newPage();
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Persist Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");

  const cookie = (await first.cookies()).find((c) =>
    c.name.includes("session_token")
  );
  expect(cookie).toBeTruthy();
  // A browser-session cookie has expires === -1 and would not survive a restart.
  const secondsLeft = (cookie?.expires ?? -1) - Date.now() / 1000;
  expect(secondsLeft).toBeGreaterThan(THIRTY_DAYS_S - 120);
  expect(secondsLeft).toBeLessThanOrEqual(THIRTY_DAYS_S + 60);

  // "Close the browser": keep only what a real browser would persist
  // (cookies with an expiry), then reopen in a brand-new context.
  const persisted = await first.storageState();
  persisted.cookies = persisted.cookies.filter((c) => c.expires > 0);
  await first.close();

  const reopened = await browser.newContext({ storageState: persisted });
  const page2 = await reopened.newPage();
  await page2.goto("/settings");
  await expect(page2.getByRole("button", { name: "Log out" })).toBeVisible();
  await reopened.close();
});
