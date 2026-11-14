import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@training-sanctum/db";

const MIGRATIONS_DIR = join(process.cwd(), "packages", "db", "migrations");

/** The backfill `UPDATE` statement, read from the add_class_color migration. */
function backfillStatement(): string {
  const dir = readdirSync(MIGRATIONS_DIR).find((name) => name.endsWith("_add_class_color"));
  expect(dir, "add_class_color migration").toBeTruthy();
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

async function newUser() {
  return prisma.user.create({
    data: { email: `color-${randomUUID()}@example.test`, name: "Color Test", timezone: "UTC" },
  });
}

// Story 6.4: existing Classes get a colour by creation order per user.
test.describe("class colour backfill migration", () => {
  test("colours by creation order per user, restarting for each user; column is NOT NULL, no default", async () => {
    const statement = backfillStatement();
    const u1 = await newUser();
    const u2 = await newUser();

    // Pre-migration shape: every row holds the same placeholder colour.
    const seed = (userId: string, name: string, minute: number) =>
      prisma.class.create({
        data: {
          name,
          userId,
          color: "ROSE",
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, minute)),
        },
      });
    // Insert out of order so only createdAt decides the colour.
    const c6 = await seed(u1.id, "c6", 6);
    const c2 = await seed(u1.id, "c2", 2);
    const c1 = await seed(u1.id, "c1", 1);
    const c5 = await seed(u1.id, "c5", 5);
    const c3 = await seed(u1.id, "c3", 3);
    const c4 = await seed(u1.id, "c4", 4);
    const d2 = await seed(u2.id, "d2", 2);
    const d1 = await seed(u2.id, "d1", 1);

    // The migration's statement, narrowed to these users so parallel tests' rows are untouched.
    await prisma.$executeRawUnsafe(`${statement} AND c."userId" IN ($1, $2)`, u1.id, u2.id);

    const colorOf = async (id: string) =>
      (await prisma.class.findUniqueOrThrow({ where: { id } })).color;
    expect(await Promise.all([c1, c2, c3, c4, c5, c6].map((c) => colorOf(c.id)))).toEqual([
      "LAVENDER",
      "SKY",
      "MINT",
      "BUTTER",
      "ROSE",
      "LAVENDER",
    ]);
    expect(await Promise.all([d1, d2].map((c) => colorOf(c.id)))).toEqual(["LAVENDER", "SKY"]);

    const [column] = await prisma.$queryRaw<
      { is_nullable: string; column_default: string | null }[]
    >`SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'classes' AND column_name = 'color'`;
    expect(column.is_nullable).toBe("NO");
    expect(column.column_default).toBeNull();

    await prisma.user.deleteMany({ where: { id: { in: [u1.id, u2.id] } } });
  });
});
