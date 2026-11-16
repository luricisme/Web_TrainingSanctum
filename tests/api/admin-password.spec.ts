import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { verifyPassword } from "better-auth/crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "new-pass-123";
const FALLBACK_BASE = "http://localhost:3100";
const ADMIN_EMAIL = "admin-e2e@example.test";

type PW = { request: { newContext: () => Promise<APIRequestContext> } };

async function signUp(playwright: PW, base: string, email: string) {
  const request = await playwright.request.newContext();
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Reset Test", timezone: "UTC" },
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

async function account(playwright: PW, base: string, role: "user" | "admin" = "user") {
  const email = `reset-${randomUUID()}@example.test`;
  const { request, response } = await signUp(playwright, base, email);
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  if (role === "admin") await prisma.user.update({ where: { id: user.id }, data: { role: "admin" } });
  return { email, id: user.id, request };
}

const put = (request: APIRequestContext, base: string, userId: string, data: unknown) =>
  request.put(`${base}/api/admin/users/${userId}/password`, { headers: { Origin: base }, data });

async function exportOf(request: APIRequestContext, base: string, userId: string) {
  const res = await request.get(`${base}/api/admin/users/${userId}/export`);
  expect(res.status()).toBe(200);
  const { exportedAt: _at, ...rest } = await res.json();
  return rest;
}

test.describe("PUT /api/admin/users/[id]/password", () => {
  test("no cookie gets 401, a normal user 403", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const anon = await playwright.request.newContext();
    expect((await put(anon, base, "anything", { password: NEW_PASSWORD })).status()).toBe(401);
    const plain = await account(playwright, base);
    try {
      const res = await put(plain.request, base, "anything", { password: NEW_PASSWORD });
      expect(res.status()).toBe(403);
      expect((await res.json()).error.code).toBe("FORBIDDEN");
    } finally {
      await prisma.user.deleteMany({ where: { id: plain.id } });
    }
  });

  test("unknown id is 404; bad body, bad id and bad lengths are 400", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const missing = await put(admin, base, randomUUID(), { password: NEW_PASSWORD });
    expect(missing.status()).toBe(404);
    expect((await missing.json()).error.code).toBe("NOT_FOUND");

    for (const body of [{}, { password: 12345678 }, { password: null }, { password: "x".repeat(7) }, { password: "x".repeat(129) }]) {
      const res = await put(admin, base, randomUUID(), body);
      expect(res.status()).toBe(400);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
    const notJson = await admin.put(`${base}/api/admin/users/${randomUUID()}/password`, {
      headers: { Origin: base, "Content-Type": "application/json" },
      data: Buffer.from("not json{"),
    });
    expect(notJson.status()).toBe(400);
    expect((await notJson.json()).error.code).toBe("INVALID_JSON");
    expect((await put(admin, base, "x".repeat(65), { password: NEW_PASSWORD })).status()).toBe(400);
  });

  test("reset replaces the hash, signs the user out, and only the new password works", async ({
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
      await prisma.class.create({ data: { name: "Kept class", color: "MINT", userId: target.id } });
      await prisma.user.update({ where: { id: target.id }, data: { cultivationXp: 75 } });
      const before = await exportOf(admin, base, target.id);
      const oldHash = (
        await prisma.account.findFirstOrThrow({ where: { userId: target.id, providerId: "credential" } })
      ).password;

      const res = await put(admin, base, target.id, { password: NEW_PASSWORD });
      expect(res.status()).toBe(200);
      const text = await res.text();
      expect(JSON.parse(text).data).toEqual({ id: target.id });
      expect(text).not.toContain(NEW_PASSWORD);

      expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
      expect((await target.request.get(`${base}/api/me`)).status()).toBe(401);
      expect((await second.request.get(`${base}/api/me`)).status()).toBe(401);

      const stored = (
        await prisma.account.findFirstOrThrow({ where: { userId: target.id, providerId: "credential" } })
      ).password;
      expect(stored).not.toBe(oldHash);
      expect(stored).not.toBe(NEW_PASSWORD);
      expect(await verifyPassword({ hash: stored!, password: NEW_PASSWORD })).toBe(true);
      expect(await verifyPassword({ hash: stored!, password: PASSWORD })).toBe(false);

      const old = await logIn(playwright, base, target.email, PASSWORD);
      expect(old.response.status()).toBe(401);
      const fresh = await logIn(playwright, base, target.email, NEW_PASSWORD);
      expect(fresh.response.ok()).toBeTruthy();
      expect((await fresh.request.get(`${base}/api/me`)).status()).toBe(200);

      expect(await exportOf(admin, base, target.id)).toEqual(before);
    } finally {
      await prisma.user.deleteMany({ where: { id: target.id } });
    }
  });

  test("a disabled user's password can be reset and they stay disabled", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const target = await account(playwright, base);
    try {
      await prisma.user.update({ where: { id: target.id }, data: { disabled: true } });
      expect((await put(admin, base, target.id, { password: NEW_PASSWORD })).status()).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).disabled).toBe(true);
      const refused = await logIn(playwright, base, target.email, NEW_PASSWORD);
      expect(refused.response.status()).toBe(403);
      expect((await refused.response.json()).error.code).toBe("USER_DISABLED");
    } finally {
      await prisma.user.deleteMany({ where: { id: target.id } });
    }
  });

  test("an admin cannot reset their own password", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const actor = await account(playwright, base, "admin");
    try {
      const before = (
        await prisma.account.findFirstOrThrow({ where: { userId: actor.id, providerId: "credential" } })
      ).password;
      const res = await put(actor.request, base, actor.id, { password: NEW_PASSWORD });
      expect(res.status()).toBe(409);
      expect((await res.json()).error.code).toBe("CANNOT_RESET_SELF");
      const after = (
        await prisma.account.findFirstOrThrow({ where: { userId: actor.id, providerId: "credential" } })
      ).password;
      expect(after).toBe(before);
      expect(await prisma.session.count({ where: { userId: actor.id } })).toBe(1);
    } finally {
      await prisma.user.deleteMany({ where: { id: actor.id } });
    }
  });

  test("a user without a credential account gets 409 and nothing changes", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const user = await prisma.user.create({
      data: { name: "No password", email: `nopw-${randomUUID()}@example.test`, timezone: "UTC" },
    });
    try {
      await prisma.session.create({
        data: {
          userId: user.id,
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      const res = await put(admin, base, user.id, { password: NEW_PASSWORD });
      expect(res.status()).toBe(409);
      expect((await res.json()).error.code).toBe("NO_PASSWORD_ACCOUNT");
      expect(await prisma.account.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    } finally {
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });
});
