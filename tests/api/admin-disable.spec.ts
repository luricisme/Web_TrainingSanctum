import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";
const ADMIN_EMAIL = "admin-e2e@example.test";

type PW = { request: { newContext: () => Promise<APIRequestContext> } };

async function signUp(playwright: PW, base: string, email: string) {
  const request = await playwright.request.newContext();
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Disable Test", timezone: "UTC" },
  });
  return { request, response };
}

async function logIn(playwright: PW, base: string, email: string, password = PASSWORD) {
  const request = await playwright.request.newContext();
  const response = await request.post(`${base}/api/auth/sign-in/email`, {
    headers: { Origin: base },
    data: { email, password },
  });
  return { request, response };
}

async function adminSession(playwright: PW, base: string) {
  const { request, response } = await signUp(playwright, base, ADMIN_EMAIL);
  if (response.ok()) return request;
  const login = await logIn(playwright, base, ADMIN_EMAIL);
  expect(login.response.ok()).toBeTruthy();
  return login.request;
}

/** A fresh account with a live session; optionally made an admin straight in the database. */
async function account(playwright: PW, base: string, role: "user" | "admin" = "user") {
  const email = `disable-${randomUUID()}@example.test`;
  const { request, response } = await signUp(playwright, base, email);
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  if (role === "admin") await prisma.user.update({ where: { id: user.id }, data: { role: "admin" } });
  return { email, id: user.id, request };
}

const patch = (request: APIRequestContext, base: string, userId: string, data: unknown) =>
  request.patch(`${base}/api/admin/users/${userId}`, { headers: { Origin: base }, data });

async function exportOf(request: APIRequestContext, base: string, userId: string) {
  const res = await request.get(`${base}/api/admin/users/${userId}/export`);
  expect(res.status()).toBe(200);
  const { exportedAt: _at, ...rest } = await res.json();
  return rest;
}

test.describe("PATCH /api/admin/users/[id]", () => {
  test("no cookie gets 401, a normal user 403", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const anon = await playwright.request.newContext();
    expect((await patch(anon, base, "anything", { disabled: true })).status()).toBe(401);
    const plain = await account(playwright, base);
    try {
      const res = await patch(plain.request, base, "anything", { disabled: true });
      expect(res.status()).toBe(403);
      expect((await res.json()).error.code).toBe("FORBIDDEN");
    } finally {
      await prisma.user.deleteMany({ where: { id: plain.id } });
    }
  });

  test("an unknown id gets 404 and a bad body or id gets 400", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const missing = await patch(admin, base, randomUUID(), { disabled: true });
    expect(missing.status()).toBe(404);
    expect((await missing.json()).error.code).toBe("NOT_FOUND");

    for (const body of [{}, { disabled: "yes" }, { disabled: 1 }, { disabled: null }]) {
      const res = await patch(admin, base, randomUUID(), body);
      expect(res.status()).toBe(400);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
    const badId = await patch(admin, base, "x".repeat(65), { disabled: true });
    expect(badId.status()).toBe(400);
  });

  test("disable signs the user out, blocks login, enable restores it, data is untouched", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const target = await account(playwright, base);
    try {
      const second = await logIn(playwright, base, target.email);
      expect(second.response.ok()).toBeTruthy();
      expect(await prisma.session.count({ where: { userId: target.id } })).toBe(2);
      const klass = await prisma.class.create({
        data: { name: "Kept class", color: "MINT", userId: target.id },
      });
      await prisma.user.update({ where: { id: target.id }, data: { cultivationXp: 75 } });
      const before = await exportOf(admin, base, target.id);

      const res = await patch(admin, base, target.id, { disabled: true });
      expect(res.status()).toBe(200);
      expect((await res.json()).data).toEqual({ id: target.id, disabled: true });
      expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
      expect((await target.request.get(`${base}/api/me`)).status()).toBe(401);
      expect((await second.request.get(`${base}/api/me`)).status()).toBe(401);

      // Correct password: refused, no cookie, no session row.
      const refused = await logIn(playwright, base, target.email);
      expect(refused.response.status()).toBe(403);
      expect(refused.response.headers()["set-cookie"]).toBeUndefined();
      const refusedBody = await refused.response.json();
      expect(refusedBody.error.code).toBe("USER_DISABLED");
      expect(refusedBody.error.message).toBe("This account is disabled. Contact an administrator.");
      expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);

      // Wrong password: the same 401 as any wrong password.
      const wrong = await logIn(playwright, base, target.email, "not-the-password");
      expect(wrong.response.status()).toBe(401);
      expect((await wrong.response.json()).error.code).toBe("INVALID_EMAIL_OR_PASSWORD");

      // Repeat disable is fine.
      expect((await patch(admin, base, target.id, { disabled: true })).status()).toBe(200);

      const enabled = await patch(admin, base, target.id, { disabled: false });
      expect(enabled.status()).toBe(200);
      expect((await enabled.json()).data).toEqual({ id: target.id, disabled: false });
      expect((await patch(admin, base, target.id, { disabled: false })).status()).toBe(200);

      const back = await logIn(playwright, base, target.email);
      expect(back.response.ok()).toBeTruthy();
      expect((await back.request.get(`${base}/api/me`)).status()).toBe(200);

      expect(await exportOf(admin, base, target.id)).toEqual(before);
      expect(await prisma.class.findUnique({ where: { id: klass.id } })).not.toBeNull();
    } finally {
      await prisma.user.deleteMany({ where: { id: target.id } });
    }
  });

  test("an admin cannot disable themselves", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const actor = await account(playwright, base, "admin");
    try {
      const res = await patch(actor.request, base, actor.id, { disabled: true });
      expect(res.status()).toBe(409);
      expect((await res.json()).error.code).toBe("CANNOT_DISABLE_SELF");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: actor.id } })).disabled).toBe(false);
      expect(await prisma.session.count({ where: { userId: actor.id } })).toBe(1);
      expect((await actor.request.get(`${base}/api/me`)).status()).toBe(200);
    } finally {
      await prisma.user.deleteMany({ where: { id: actor.id } });
    }
  });

  test("the last enabled admin cannot be disabled", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    // The actor is an admin whose account is flagged disabled directly (its session is still
    // valid), so it does not count as an enabled admin. Every other admin is flagged for the
    // few statements below and restored in `finally`.
    const actor = await account(playwright, base, "admin");
    const target = await account(playwright, base, "admin");
    const others = await prisma.user.findMany({
      where: { role: "admin", disabled: false, id: { notIn: [actor.id, target.id] } },
      select: { id: true },
    });
    try {
      await prisma.user.updateMany({
        where: { id: { in: [actor.id, ...others.map((o) => o.id)] } },
        data: { disabled: true },
      });
      const res = await patch(actor.request, base, target.id, { disabled: true });
      expect(res.status()).toBe(409);
      expect((await res.json()).error.code).toBe("LAST_ADMIN");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).disabled).toBe(false);
      expect(await prisma.session.count({ where: { userId: target.id } })).toBe(1);
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: others.map((o) => o.id) } },
        data: { disabled: false },
      });
      await prisma.user.deleteMany({ where: { id: { in: [actor.id, target.id] } } });
    }
  });

  test("an admin can be disabled while another enabled admin remains", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const actor = await account(playwright, base, "admin");
    const target = await account(playwright, base, "admin");
    try {
      const res = await patch(actor.request, base, target.id, { disabled: true });
      expect(res.status()).toBe(200);
      expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [actor.id, target.id] } } });
    }
  });
});
