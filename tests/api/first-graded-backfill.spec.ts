import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@training-sanctum/db";

const MIGRATIONS_DIR = join(process.cwd(), "packages", "db", "migrations");

/** The backfill `UPDATE` statement, read from the add_first_graded_at migration. */
function backfillStatement(): string {
  const dir = readdirSync(MIGRATIONS_DIR).find((name) => name.endsWith("_add_first_graded_at"));
  expect(dir, "add_first_graded_at migration").toBeTruthy();
  const sql = readFileSync(join(MIGRATIONS_DIR, dir!, "migration.sql"), "utf8");
  const statement = sql
    .split(";")
    .map((part) =>
      part
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .find((part) => part.startsWith("UPDATE"));
  expect(statement, "backfill UPDATE").toBeTruthy();
  return statement!;
}

// spec-4-6: the migration backfill keeps every record graded before it learned.
test.describe("firstGradedAt backfill migration", () => {
  test("sets firstGradedAt = updatedAt where interval > 0, leaves interval 0 null", async () => {
    const statement = backfillStatement();
    expect(statement).toMatch(/WHERE\s+"interval"\s*>\s*0$/);

    const user = await prisma.user.create({
      data: {
        email: `backfill-${randomUUID()}@example.test`,
        name: "Backfill Test",
        timezone: "UTC",
      },
    });
    const cls = await prisma.class.create({ data: { color: "LAVENDER", name: "C", userId: user.id } });
    const folder = await prisma.folder.create({
      data: { name: "F", classId: cls.id, userId: user.id },
    });
    const flashcard = await prisma.flashcard.create({
      data: { name: "W", folderId: folder.id, userId: user.id },
    });
    const card = await prisma.card.create({
      data: {
        term: "collate",
        definition: "gather",
        userId: user.id,
        flashcardId: flashcard.id,
        schedulingRecords: {
          create: [
            {
              direction: "TERM_TO_DEFINITION",
              interval: 6,
              repetitions: 2,
              nextReviewDate: new Date(),
              firstGradedAt: null,
            },
            {
              direction: "DEFINITION_TO_TERM",
              interval: 0,
              repetitions: 0,
              nextReviewDate: new Date(),
              firstGradedAt: null,
            },
          ],
        },
      },
      include: { schedulingRecords: true },
    });

    // The migration's statement, narrowed to this Card so parallel tests' rows are untouched.
    await prisma.$executeRawUnsafe(`${statement} AND "cardId" = $1`, card.id);

    const after = await prisma.schedulingRecord.findMany({ where: { cardId: card.id } });
    const graded = after.find((r) => r.direction === "TERM_TO_DEFINITION")!;
    const fresh = after.find((r) => r.direction === "DEFINITION_TO_TERM")!;
    expect(graded.firstGradedAt?.toISOString()).toBe(graded.updatedAt.toISOString());
    expect(fresh.firstGradedAt).toBeNull();

    await prisma.user.delete({ where: { id: user.id } });
  });
});
