import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

// AC1/AC2 (spec-1-2): successful registration creates a session + `User`
// row with a hashed password (stored on the related Account row, per
// Better Auth's email/password provider) and the browser-captured
// timezone; a duplicate email returns a structured, field-identifiable
// error and mutates nothing.
test.describe("POST /api/auth/sign-up/email", () => {
  test("creates a User row + session on success", async ({ request, baseURL }) => {
    const email = `registration-${randomUUID()}@example.test`;
    const timezone = "America/New_York";

    const response = await request.post(
      `${baseURL ?? "http://localhost:3000"}/api/auth/sign-up/email`,
      {
        data: {
          email,
          password: "correct-horse-battery",
          name: "Registration Test",
          timezone,
        },
      }
    );

    expect(response.ok()).toBeTruthy();
    expect(response.headers()["set-cookie"]).toBeTruthy();

    const user = await prisma.user.findUnique({
      where: { email },
      include: { accounts: true },
    });

    expect(user).not.toBeNull();
    expect(user?.timezone).toBe(timezone);

    const credentialAccount = user?.accounts.find(
      (account) => account.providerId === "credential"
    );
    expect(credentialAccount?.password).toBeTruthy();
  });

  test("rejects a duplicate email without mutating the existing record", async ({
    request,
    baseURL,
  }) => {
    const email = `registration-dup-${randomUUID()}@example.test`;
    const timezone = "Europe/London";
    const base = baseURL ?? "http://localhost:3000";

    const first = await request.post(`${base}/api/auth/sign-up/email`, {
      // Better Auth's origin check requires an Origin header once a request
      // carries a session cookie (CSRF protection); a real browser always
      // sends this on same-origin fetch/XHR, so mirror that here rather than
      // disabling the check.
      headers: { Origin: base },
      data: {
        email,
        password: "correct-horse-battery",
        name: "Registration Test",
        timezone,
      },
    });
    expect(first.ok()).toBeTruthy();

    const before = await prisma.user.findUnique({ where: { email } });

    const second = await request.post(`${base}/api/auth/sign-up/email`, {
      headers: { Origin: base },
      data: {
        email,
        password: "a-different-password",
        // Deliberately different from the first attempt's "Registration
        // Test" so a silent mutation of `name` would actually be caught
        // below, rather than passing by coincidence.
        name: "Second Attempt Name",
        timezone: "Asia/Tokyo",
      },
    });

    expect(second.ok()).toBeFalsy();
    const body = await second.json();
    // apps/web/app/api/auth/[...all]/route.ts reshapes this endpoint's error
    // responses into the standard `{error:{code,message,fields}}` envelope
    // (AD-10) instead of Better Auth's native flat `{code,message}` body.
    expect(body.error.code).toBe("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");
    expect(body.error.fields?.email).toBeTruthy();

    const after = await prisma.user.findUnique({ where: { email } });
    expect(after?.name).toBe(before?.name);
    expect(after?.timezone).toBe(before?.timezone);
    expect(after?.updatedAt).toEqual(before?.updatedAt);
  });
});
