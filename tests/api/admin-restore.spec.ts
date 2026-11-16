import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";
import { DAY_MS, toLocalDate, type BackupExport } from "@training-sanctum/domain";

const PASSWORD = "correct-horse-battery";
const FALLBACK_BASE = "http://localhost:3100";
const ADMIN_EMAIL = "admin-e2e@example.test";

type PW = { request: { newContext: () => Promise<APIRequestContext> } };

async function signUp(playwright: PW, base: string, email: string) {
  const request = await playwright.request.newContext();
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Restore Test", timezone: "UTC" },
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

async function seedUser(email: string, timezone = "Asia/Ho_Chi_Minh") {
  const user = await prisma.user.create({
    data: { name: "Seed", email, timezone, cultivationXp: 120, studyDirections: "TERM_TO_DEFINITION" },
  });
  const klass = await prisma.class.create({
    data: { name: "Seed class", color: "BUTTER", userId: user.id, createdAt: new Date("2026-11-01T00:00:00Z") },
  });
  const folder = await prisma.folder.create({
    data: { name: "Unsorted", isUnsorted: true, classId: klass.id, userId: user.id },
  });
  const flashcard = await prisma.flashcard.create({
    data: { name: "Seed set", folderId: folder.id, userId: user.id },
  });
  const card = await prisma.card.create({
    data: { term: "ephemeral", definition: "short-lived", example: "an ephemeral joy", flashcardId: flashcard.id, userId: user.id },
  });
  await prisma.schedulingRecord.createMany({
    data: [
      {
        cardId: card.id,
        direction: "TERM_TO_DEFINITION",
        interval: 6,
        repetitions: 2,
        easeFactor: 2.36,
        nextReviewDate: new Date("2026-11-16T00:00:00.000Z"),
        firstGradedAt: new Date("2026-11-10T08:30:00.000Z"),
      },
      { cardId: card.id, direction: "DEFINITION_TO_TERM", nextReviewDate: new Date("2026-11-14T00:00:00.000Z") },
    ],
  });
  await prisma.cultivationDay.create({
    data: { userId: user.id, localDay: new Date("2026-11-12"), quests: [{ kind: "CLEAR_REVIEW", xp: 40 }] },
  });
  await prisma.xpEvent.create({
    data: { userId: user.id, localDay: new Date("2026-11-12"), questKind: "CLEAR_REVIEW", delta: 40, reason: "CLAIM" },
  });
  await prisma.user.update({ where: { id: user.id }, data: { cultivationSettledThrough: new Date("2026-11-13") } });
  return user;
}

async function exportOf(request: APIRequestContext, base: string, userId: string): Promise<BackupExport> {
  const res = await request.get(`${base}/api/admin/users/${userId}/export`);
  expect(res.status()).toBe(200);
  return (await res.json()) as BackupExport;
}

/** The export minus ids and the export timestamp, with relations replaced by position. */
function shape(b: BackupExport) {
  const classIdx = new Map(b.classes.map((c, i) => [c.id, i]));
  const folderIdx = new Map(b.folders.map((f, i) => [f.id, i]));
  const flashIdx = new Map(b.flashcards.map((f, i) => [f.id, i]));
  const strip = <T extends { id: string }>({ id: _id, ...rest }: T) => rest;
  return {
    studyDirections: b.user.studyDirections,
    classes: b.classes.map(strip),
    folders: b.folders.map((f) => ({ ...strip(f), classId: classIdx.get(f.classId) })),
    flashcards: b.flashcards.map((f) => ({ ...strip(f), folderId: folderIdx.get(f.folderId) })),
    cards: b.cards.map((c) => ({
      ...strip(c),
      flashcardId: flashIdx.get(c.flashcardId),
      schedulingRecords: c.schedulingRecords.map(strip),
    })),
    xp: b.cultivation.xp,
    days: b.cultivation.days.map(strip),
    xpEvents: b.cultivation.xpEvents.map(strip),
  };
}

const post = (request: APIRequestContext, base: string, userId: string, data: unknown) =>
  request.post(`${base}/api/admin/users/${userId}/restore`, { headers: { Origin: base }, data });

test.describe("POST /api/admin/users/[id]/restore", () => {
  test("no cookie gets 401, a normal user 403", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const anon = await playwright.request.newContext();
    const res = await post(anon, base, "anything", {});
    expect(res.status()).toBe(401);
    const { request } = await signUp(playwright, base, `plain-${randomUUID()}@example.test`);
    const res2 = await post(request, base, "anything", {});
    expect(res2.status()).toBe(403);
    expect((await res2.json()).error.code).toBe("FORBIDDEN");
  });

  test("an unknown user gets 404", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const res = await post(admin, base, randomUUID(), { confirm: true, backup: {} });
    expect(res.status()).toBe(404);
  });

  test("a missing confirm or a bad file is a 400 and changes nothing", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const user = await seedUser(`restore-400-${randomUUID()}@example.test`);
    try {
      const backup = await exportOf(admin, base, user.id);
      expect((await post(admin, base, user.id, { backup })).status()).toBe(400);
      expect((await post(admin, base, user.id, { confirm: false, backup })).status()).toBe(400);
      expect((await post(admin, base, user.id, { confirm: true, backup: { ...backup, version: 2 } })).status()).toBe(400);
      expect((await post(admin, base, user.id, { confirm: true, backup: { hello: 1 } })).status()).toBe(400);
      const res = await admin.post(`${base}/api/admin/users/${user.id}/restore`, {
        headers: { Origin: base, "Content-Type": "application/json" },
        data: "not json",
      });
      expect(res.status()).toBe(400);
      expect(await prisma.card.count({ where: { userId: user.id } })).toBe(1);
    } finally {
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });

  test("broken links are a 422 BACKUP_INVALID and change nothing", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const user = await seedUser(`restore-422-${randomUUID()}@example.test`);
    try {
      const backup = await exportOf(admin, base, user.id);
      const orphan = structuredClone(backup);
      orphan.cards[0].flashcardId = "missing";
      const dupFolder = structuredClone(backup);
      dupFolder.folders.push({ ...dupFolder.folders[0], id: "extra" });
      const dupName = structuredClone(backup);
      dupName.flashcards.push({ ...dupName.flashcards[0], id: "extra", name: "SEED SET" });
      for (const bad of [orphan, dupFolder, dupName]) {
        const res = await post(admin, base, user.id, { confirm: true, backup: bad });
        expect(res.status()).toBe(422);
        const body = await res.json();
        expect(body.error.code).toBe("BACKUP_INVALID");
        expect(body.error.details.length).toBeGreaterThan(0);
      }
      expect(await prisma.card.count({ where: { userId: user.id } })).toBe(1);
      expect(await prisma.class.count({ where: { userId: user.id } })).toBe(1);
    } finally {
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });

  test("round trip replaces, never merges, and keeps the target's identity", async ({ playwright, baseURL }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const user = await seedUser(`restore-rt-${randomUUID()}@example.test`);
    try {
      const before = await exportOf(admin, base, user.id);
      const oldIds = new Set([
        ...before.classes.map((c) => c.id),
        ...before.folders.map((f) => f.id),
        ...before.flashcards.map((f) => f.id),
        ...before.cards.map((c) => c.id),
      ]);

      // Edit after the export: extra Class, changed Card, different XP and directions.
      await prisma.class.create({ data: { name: "Added later", color: "ROSE", userId: user.id } });
      await prisma.card.updateMany({ where: { userId: user.id }, data: { term: "changed" } });
      await prisma.xpEvent.deleteMany({ where: { userId: user.id } });
      await prisma.user.update({
        where: { id: user.id },
        data: { cultivationXp: 5, studyDirections: "BOTH", role: "user", disabled: true },
      });

      const res = await post(admin, base, user.id, { confirm: true, backup: before });
      expect(res.status()).toBe(200);
      const counts = (await res.json()).data;
      expect(counts).toMatchObject({ classes: 1, folders: 1, flashcards: 1, cards: 1, schedulingRecords: 2, xpEvents: 1 });

      const after = await exportOf(admin, base, user.id);
      expect(shape(after)).toEqual(shape(before));
      expect(after.classes[0].color).toBe("BUTTER");
      expect(after.cards[0].schedulingRecords.find((r) => r.direction === "TERM_TO_DEFINITION")?.firstGradedAt).toBe(
        "2026-11-10T08:30:00.000Z"
      );
      expect(after.user.studyDirections).toBe("TERM_TO_DEFINITION");
      expect(after.cultivation.xp).toBe(120);
      const yesterday = new Date(toLocalDate(new Date(), "Asia/Ho_Chi_Minh").getTime() - DAY_MS);
      expect(after.cultivation.settledThrough).toBe(yesterday.toISOString().slice(0, 10));

      // Fresh ids, and no merge.
      const newIds = [
        ...after.classes.map((c) => c.id),
        ...after.folders.map((f) => f.id),
        ...after.flashcards.map((f) => f.id),
        ...after.cards.map((c) => c.id),
      ];
      for (const id of newIds) expect(oldIds.has(id)).toBe(false);
      expect(after.classes.map((c) => c.name)).toEqual(["Seed class"]);

      // Identity untouched.
      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.email).toBe(user.email);
      expect(row.timezone).toBe("Asia/Ho_Chi_Minh");
      expect(row.disabled).toBe(true);
    } finally {
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });

  test("a file from another user restores into the target without touching the source", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const a = await seedUser(`restore-a-${randomUUID()}@example.test`);
    const b = await prisma.user.create({
      data: { name: "B", email: `restore-b-${randomUUID()}@example.test`, timezone: "UTC" },
    });
    await prisma.class.create({ data: { name: "B only", color: "SKY", userId: b.id } });
    try {
      const fileA = await exportOf(admin, base, a.id);
      const res = await post(admin, base, b.id, { confirm: true, backup: fileA });
      expect(res.status()).toBe(200);
      const afterB = await exportOf(admin, base, b.id);
      expect(shape(afterB).cards).toEqual(shape(fileA).cards);
      expect(afterB.classes.map((c) => c.name)).toEqual(["Seed class"]);
      expect(afterB.user.email).toBe(b.email);
      expect(afterB.user.timezone).toBe("UTC");
      // A is unchanged, and still holds its own rows.
      const afterA = await exportOf(admin, base, a.id);
      expect(afterA.classes.map((c) => c.id)).toEqual(fileA.classes.map((c) => c.id));
      expect(afterA.cards.map((c) => c.id)).toEqual(fileA.cards.map((c) => c.id));
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    }
  });

  test("Classes without a colour get colours by creation order; an empty target works", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const donor = await seedUser(`restore-col-${randomUUID()}@example.test`);
    const empty = await prisma.user.create({
      data: { name: "E", email: `restore-empty-${randomUUID()}@example.test`, timezone: "UTC" },
    });
    try {
      const file = await exportOf(admin, base, donor.id);
      const second = { ...file.classes[0], id: "c-second", name: "Second", createdAt: "2026-11-05T00:00:00.000Z" };
      const classes = [second, file.classes[0]].map(({ color: _c, ...rest }) => rest);
      const res = await post(admin, base, empty.id, { confirm: true, backup: { ...file, classes } });
      expect(res.status()).toBe(200);
      const rows = await prisma.class.findMany({ where: { userId: empty.id }, orderBy: { createdAt: "asc" } });
      expect(rows.map((r) => [r.name, r.color])).toEqual([
        ["Seed class", "LAVENDER"],
        ["Second", "SKY"],
      ]);
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [donor.id, empty.id] } } });
    }
  });

  test("a database failure mid-write rolls everything back (500 RESTORE_FAILED)", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const user = await seedUser(`restore-nul-${randomUUID()}@example.test`);
    try {
      const backup = await exportOf(admin, base, user.id);
      backup.classes[0].name = "Replacement";
      backup.cards[0].term = "bad\u0000term";
      const res = await post(admin, base, user.id, { confirm: true, backup });
      expect(res.status()).toBe(500);
      expect((await res.json()).error.code).toBe("RESTORE_FAILED");

      const after = await exportOf(admin, base, user.id);
      expect(after.classes.map((c) => c.name)).toEqual(["Seed class"]);
      expect(after.cards[0].term).toBe("ephemeral");
      expect(after.cultivation.xp).toBe(120);
      expect(after.cultivation.xpEvents).toHaveLength(1);
      expect(after.cultivation.settledThrough).toBe("2026-11-13");
    } finally {
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });

  test("a restore larger than one insert chunk keeps every row", async ({ playwright, baseURL }) => {
    test.setTimeout(120_000);
    const base = baseURL ?? FALLBACK_BASE;
    const admin = await adminSession(playwright, base);
    const user = await seedUser(`restore-big-${randomUUID()}@example.test`);
    try {
      const flashcard = await prisma.flashcard.findFirstOrThrow({ where: { userId: user.id } });
      const N = 1100;
      const ids = Array.from({ length: N }, () => randomUUID());
      await prisma.card.createMany({
        data: ids.map((id, i) => ({
          id,
          term: `bulk-${i}`,
          definition: "d",
          flashcardId: flashcard.id,
          userId: user.id,
        })),
      });
      await prisma.schedulingRecord.createMany({
        data: ids.flatMap((cardId) =>
          (["TERM_TO_DEFINITION", "DEFINITION_TO_TERM"] as const).map((direction) => ({
            cardId,
            direction,
            nextReviewDate: new Date("2026-11-16T00:00:00.000Z"),
          }))
        ),
      });
      const file = await exportOf(admin, base, user.id);
      expect(file.cards).toHaveLength(N + 1);

      const res = await post(admin, base, user.id, { confirm: true, backup: file });
      expect(res.status()).toBe(200);
      expect((await res.json()).data).toMatchObject({ cards: N + 1, schedulingRecords: 2 * (N + 1) });
      expect(await prisma.card.count({ where: { userId: user.id } })).toBe(N + 1);
      expect(await prisma.schedulingRecord.count({ where: { card: { userId: user.id } } })).toBe(2 * (N + 1));
    } finally {
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });
});
