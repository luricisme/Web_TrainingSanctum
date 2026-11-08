import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

// AC1 (spec-1-2): filling and submitting the registration form logs the
// user in immediately (no separate login step) and redirects to /review.
test("registering redirects to /review with a session cookie set", async ({
  page,
  context,
}) => {
  const email = `e2e-registration-${randomUUID()}@example.test`;

  await page.goto("/register");
  await page.getByLabel("Full name").fill("Registration Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL("/review");
  await expect(
    page.getByRole("heading", { name: "Review" })
  ).toBeVisible();

  const cookies = await context.cookies();
  expect(
    cookies.some((cookie) => cookie.name.includes("session"))
  ).toBe(true);
});

// AC3 (spec-1-2): invalid email format or a too-short password fail the
// shared Zod schema client-side (AD-6) before any Better Auth call is made —
// the user stays on /register and sees field-level errors.
test("invalid email or short password shows field errors and stays on /register", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Registration Test");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("short1");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.locator("#email-error")).toBeVisible();
  await expect(page.locator("#password-error")).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
});

// AC3 (spec-1-2): an empty name is a required Better Auth field — the form's
// native `required` attribute is inert under `noValidate`, so the shared Zod
// schema must be the thing that actually catches it before any Better Auth
// call is made.
test("empty name shows a field error and stays on /register", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByLabel("Email").fill("not-submitted@example.test");
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.locator("#name-error")).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
});

// AC2 (spec-1-2): registering an already-registered email surfaces a
// field-level error on the email field (the standard error envelope,
// mapped client-side from Better Auth's response — see
// apps/web/app/api/auth/[...all]/route.ts), not a generic form-level error.
test("duplicate email shows the existing-account message on the email field", async ({
  page,
}) => {
  const email = `e2e-registration-dup-${randomUUID()}@example.test`;

  await page.goto("/register");
  await page.getByLabel("Full name").fill("Registration Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");

  // /register redirects logged-in users, so clear the session first.
  await page.context().clearCookies();
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Registration Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-different-password");
  await page.getByRole("button", { name: "Create account" }).click();

  const emailError = page.locator("#email-error");
  await expect(emailError).toBeVisible();
  await expect(emailError).toHaveText(/already exists/i);
  await expect(page).toHaveURL(/\/register$/);
});
