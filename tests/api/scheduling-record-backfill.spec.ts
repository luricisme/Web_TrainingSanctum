import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@training-sanctum/db";

const MIGRATIONS_DIR = join(process.cwd(), "packages", "db", "migrations");

function migrationSql(): string {
  const dir = readdirSync(MIGRATIONS_DIR).find((n) => n.endsWith("_add_scheduling_record_user_id"));
  expect(dir, "add_scheduling_record_user_id migration").toBeTruthy();
  return readFileSync(join(MIGRATIONS_DIR, dir!, "migration.sql"), "utf8");
}

async function seedCard(userId: string) {
  const cls = await prisma.class.create({ data: { color: "LAVENDER", name: "C", userId } });
  const folder = await prisma.folder.create({ data: { name: "F", classId: cls.id, userId } });
  const flashcard = await prisma.flashcard.create({ data: { name: "W", folderId: folder.id, userId } });
  return prisma.card.create({
    data: { term: "t", definition: "d", userId, flashcardId: flashcard.id },
  });
}

const newUser = () =>
  prisma.user.create({
    data: { email: `srbackfill-${randomUUID()}@example.test`, name: "Backfill", timezone: "UTC" },
  });

// Story 12.1 (AD-19): the migration's backfill, unique key and indexes.
test.describe("scheduling_records.userId migration", () => {
  test("backfill statement sets userId to the Card's userId", async () => {
    const sql = migrationSql();
    const statement = sql
      .split(";")
      .map((p) =>
        p
          .split("\n")
          .filter((l) => !l.trim().startsWith("--"))
          .join("\n")
          .trim()
      )
      .find((p) => p.startsWith("UPDATE"));
    expect(statement, "backfill UPDATE").toBeTruthy();
    expect(sql).toMatch(/ALTER COLUMN "userId" SET NOT NULL/);
    expect(sql).toMatch(/ON DELETE CASCADE/);

    // The column is NOT NULL now, so rehearse with a record held by another user
    // and let the statement correct it to the Card's owner.
    const owner = await newUser();
    const other = await newUser();
    const card = await seedCard(owner.id);
    const record = await prisma.schedulingRecord.create({
      data: {
        cardId: card.id,
        userId: other.id,
        direction: "TERM_TO_DEFINITION",
        nextReviewDate: new Date(),
      },
    });
    await prisma.$executeRawUnsafe(`${statement} AND sr."id" = $1`, record.id);
    const after = await prisma.schedulingRecord.findUniqueOrThrow({ where: { id: record.id } });
    expect(after.userId).toBe(owner.id);
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  });

  test("userId is required and unique per (userId, cardId, direction)", async () => {
    const a = await newUser();
    const b = await newUser();
    const card = await seedCard(a.id);
    const base = {
      cardId: card.id,
      direction: "TERM_TO_DEFINITION" as const,
      nextReviewDate: new Date(),
    };
    await prisma.schedulingRecord.create({ data: { ...base, userId: a.id } });
    // Another learner can hold the same (card, direction); the same learner cannot.
    await prisma.schedulingRecord.create({ data: { ...base, userId: b.id } });
    await expect(prisma.schedulingRecord.create({ data: { ...base, userId: a.id } })).rejects.toThrow();
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO scheduling_records (id, "cardId", "userId", direction, "nextReviewDate", "updatedAt") VALUES ($1, $2, NULL, 'DEFINITION_TO_TERM', now(), now())`,
        randomUUID(),
        card.id
      )
    ).rejects.toThrow();
    await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  });

  test("the new indexes exist and deleting a learner removes their records", async () => {
    const indexes = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'scheduling_records'`
    );
    const names = indexes.map((i) => i.indexname);
    expect(names).toContain("scheduling_records_userId_nextReviewDate_idx");
    expect(names).toContain("scheduling_records_userId_cardId_direction_key");
    expect(names).not.toContain("scheduling_records_cardId_direction_key");

    const owner = await newUser();
    const learner = await newUser();
    const card = await seedCard(owner.id);
    await prisma.schedulingRecord.create({
      data: {
        cardId: card.id,
        userId: learner.id,
        direction: "TERM_TO_DEFINITION",
        nextReviewDate: new Date(),
      },
    });
    await prisma.user.delete({ where: { id: learner.id } });
    expect(await prisma.schedulingRecord.count({ where: { cardId: card.id } })).toBe(0);
    await prisma.user.delete({ where: { id: owner.id } });
  });
});
