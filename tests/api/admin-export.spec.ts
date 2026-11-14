import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";
import { backupExportSchema } from "@training-sanctum/domain";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";
const ADMIN_EMAIL = "admin-e2e@example.test";

type PW = { request: { newContext: () => Promise<APIRequestContext> } };

async function signUp(playwright: PW, base: string, email: string) {
  const request = await playwright.request.newContext();
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Export Test", timezone: "UTC" },
  });
  return { request, response };
}

async function adminSession(playwright: PW, base: string) {
  const { request, response } = await signUp(playwright, base, ADMIN_EMAIL);
  if (response.ok()) return request;
  const login = await request.post(`${base}/api/auth/sign-in/email`, {
    headers: { Origin: base },
    data: { email: ADMIN_EMAIL, password: PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  return request;
}

/** One Class, Unsorted Folder, Flashcard and Card with two records, plus cultivation rows. */
async function seedUser(email: string, disabled = false) {
  const user = await prisma.user.create({
    data: { name: "Seed", email, timezone: "Asia/Ho_Chi_Minh", disabled, cultivationXp: 120 },
  });
  const klass = await prisma.class.create({
    data: { name: "Seed class", color: "MINT", userId: user.id },
  });
  const folder = await prisma.folder.create({
    data: { name: "Unsorted", isUnsorted: true, classId: klass.id, userId: user.id },
  });
  const flashcard = await prisma.flashcard.create({
    data: { name: "Seed set", folderId: folder.id, userId: user.id },
  });
  const card = await prisma.card.create({
    data: { term: "ephemeral", definition: "short-lived", flashcardId: flashcard.id, userId: user.id },
  });
  const graded = new Date("2026-11-10T08:30:00.000Z");
  await prisma.schedulingRecord.createMany({
    data: [
      {
        cardId: card.id,
        direction: "TERM_TO_DEFINITION",
        interval: 6,
        repetitions: 2,
        easeFactor: 2.36,
        nextReviewDate: new Date("2026-11-16T00:00:00.000Z"),
        firstGradedAt: graded,
      },
      {
        cardId: card.id,
        direction: "DEFINITION_TO_TERM",
        nextReviewDate: new Date("2026-11-14T00:00:00.000Z"),
      },
    ],
  });
  const records = await prisma.schedulingRecord.findMany({ where: { cardId: card.id } });
  const cultivationDay = await prisma.cultivationDay.create({
    data: { userId: user.id, localDay: new Date("2026-11-12"), quests: [{ kind: "CLEAR_REVIEW", xp: 40 }] },
  });
  const claim = await prisma.xpEvent.create({
    data: { userId: user.id, localDay: new Date("2026-11-12"), questKind: "CLEAR_REVIEW", delta: 40, reason: "CLAIM" },
  });
  const penalty = await prisma.xpEvent.create({
    data: { userId: user.id, localDay: new Date("2026-11-13"), questKind: "LEARN_FLASHCARDS", delta: -10, reason: "PENALTY" },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { cultivationSettledThrough: new Date("2026-11-13") },
  });
  const ids = [
    klass.id,
    folder.id,
    flashcard.id,
    card.id,
    ...records.map((x) => x.id),
    cultivationDay.id,
    claim.id,
    penalty.id,
  ];
  return { user, card, graded, ids };
}

// Story 5.2: GET /api/admin/users/[id]/export
test.describe("GET /api/admin/users/[id]/export", () => {
  test("no cookie gets 401", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await playwright.request.newContext();
    const res = await request.get(`${base}/api/admin/users/anything/export`);
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("a normal user gets 403 and no data", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const { request } = await signUp(playwright, base, `plain-${randomUUID()}@example.test`);
    const res = await request.get(`${base}/api/admin/users/anything/export`);
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.user).toBeUndefined();
  });

  test("an unknown user gets 404", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await adminSession(playwright, base);
    const res = await request.get(`${base}/api/admin/users/${randomUUID()}/export`);
    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  test("an admin downloads a validated, verbatim backup (disabled user too)", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await adminSession(playwright, base);
    const target = await seedUser(`export-${randomUUID()}@example.test`, true);
    const other = await seedUser(`export-other-${randomUUID()}@example.test`);
    try {
      const res = await request.get(`${base}/api/admin/users/${target.user.id}/export`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("application/json");
      expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename=".+\.json"$/);
      expect(res.headers()["cache-control"]).toBe("no-store");

      const body = await res.json();
      expect(body.data).toBeUndefined();
      const parsed = backupExportSchema.parse(body);

      expect(parsed.user).toEqual({
        id: target.user.id,
        email: target.user.email,
        studyDirections: "BOTH",
        timezone: "Asia/Ho_Chi_Minh",
      });
      expect(parsed.classes).toHaveLength(1);
      expect(parsed.classes[0].name).toBe("Seed class");
      expect(parsed.classes[0].color).toBe("MINT");
      expect(parsed.classes[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
      expect(new Date(parsed.classes[0].updatedAt).toISOString()).toBe(parsed.classes[0].updatedAt);
      expect(parsed.folders).toHaveLength(1);
      expect(parsed.folders[0].name).toBe("Unsorted");
      expect(parsed.folders[0].isUnsorted).toBe(true);
      expect(parsed.flashcards).toHaveLength(1);
      expect(parsed.flashcards[0].name).toBe("Seed set");
      expect(parsed.cards).toHaveLength(1);
      expect(parsed.cards[0].term).toBe("ephemeral");
      expect(parsed.cards[0].definition).toBe("short-lived");
      expect(parsed.cards[0].flashcardId).toBe(parsed.flashcards[0].id);
      const records = parsed.cards[0].schedulingRecords;
      expect(records).toHaveLength(2);
      const t2d = records.find((r) => r.direction === "TERM_TO_DEFINITION")!;
      const d2t = records.find((r) => r.direction === "DEFINITION_TO_TERM")!;
      expect(t2d.firstGradedAt).toBe(target.graded.toISOString());
      expect(t2d.interval).toBe(6);
      expect(t2d.easeFactor).toBe(2.36);
      expect(t2d.repetitions).toBe(2);
      expect(t2d.nextReviewDate).toBe("2026-11-16T00:00:00.000Z");
      expect(d2t.repetitions).toBe(0);
      expect(d2t.nextReviewDate).toBe("2026-11-14T00:00:00.000Z");
      expect(d2t.firstGradedAt).toBeNull();

      expect(parsed.cultivation.xp).toBe(120);
      expect(parsed.cultivation.settledThrough).toBe("2026-11-13");
      expect(parsed.cultivation.days).toHaveLength(1);
      expect(parsed.cultivation.days[0].localDay).toBe("2026-11-12");
      expect(parsed.cultivation.days[0].quests).toEqual([{ kind: "CLEAR_REVIEW", xp: 40 }]);
      expect(parsed.cultivation.xpEvents.map((e) => e.reason)).toEqual(["CLAIM", "PENALTY"]);
      expect(parsed.cultivation.xpEvents.map((e) => e.delta)).toEqual([40, -10]);
      expect(parsed.cultivation.xpEvents.map((e) => e.questKind)).toEqual([
        "CLEAR_REVIEW",
        "LEARN_FLASHCARDS",
      ]);

      // Isolation: nothing of the other user appears.
      const text = JSON.stringify(body);
      expect(text).not.toContain(other.user.id);
      for (const otherId of other.ids) expect(text).not.toContain(otherId);

      // No auth or admin fields.
      for (const key of ["password", "role", "disabled", "sessions", "accounts", "token"]) {
        expect(text).not.toContain(`"${key}"`);
      }
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [target.user.id, other.user.id] } } });
    }
  });

  test("an empty account exports empty sections", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const request = await adminSession(playwright, base);
    const user = await prisma.user.create({
      data: { name: "Empty", email: `export-empty-${randomUUID()}@example.test`, timezone: "UTC" },
    });
    try {
      const res = await request.get(`${base}/api/admin/users/${user.id}/export`);
      expect(res.status()).toBe(200);
      const parsed = backupExportSchema.parse(await res.json());
      expect(parsed.classes).toEqual([]);
      expect(parsed.folders).toEqual([]);
      expect(parsed.flashcards).toEqual([]);
      expect(parsed.cards).toEqual([]);
      expect(parsed.cultivation).toEqual({ xp: 0, settledThrough: null, days: [], xpEvents: [] });
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
