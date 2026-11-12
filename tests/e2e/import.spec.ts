import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";

async function register(page: Page): Promise<string> {
  const email = `e2e-import-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Import E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  return email;
}

/** A Flashcard "Weather idioms" that already holds "under the weather". */
async function seedFlashcard(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const cls = await prisma.class.create({
    data: {
      name: "IELTS",
      userId: user.id,
      folders: { create: [{ name: "Speaking", userId: user.id }] },
    },
    include: { folders: true },
  });
  return prisma.flashcard.create({
    data: {
      name: "Weather idioms",
      folderId: cls.folders[0]!.id,
      userId: user.id,
      cards: {
        create: [
          { term: "under the weather", definition: "feeling slightly ill", userId: user.id },
        ],
      },
    },
  });
}

const PASTE = [
  "rain cats and dogs — to rain very heavily",
  "",
  "on cloud nine — extremely happy",
  "a perfect storm: a rare combination of bad events",
  "Under the weather — feeling ill",
  "storm in a teacup — a fuss about nothing",
  "Rain cats and dogs — again",
  "broken line",
].join("\n");

async function openImport(page: Page, flashcardId: string) {
  await page.goto(`/flashcards/${flashcardId}`);
  await page.getByRole("button", { name: "Add cards" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Import" }).click();
  return dialog;
}

test("paste → preview → fix → save → results → Cards listed", async ({ page }) => {
  const email = await register(page);
  const flashcard = await seedFlashcard(email);
  const dialog = await openImport(page, flashcard.id);

  // Same panel, same target, no route change.
  await expect(dialog.getByRole("heading", { name: "Add cards to Weather idioms" })).toBeVisible();
  await expect(page).toHaveURL(`/flashcards/${flashcard.id}`);
  await expect(dialog.getByRole("tab", { name: "Import" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(dialog.getByLabel("Delimiter")).toHaveValue("tab");
  await expect(dialog.getByLabel("Paste cards")).toBeFocused();

  await dialog.getByLabel("Delimiter").selectOption("em-dash");
  await dialog.getByLabel("Paste cards").fill(PASTE);
  await dialog.getByRole("button", { name: "Preview" }).click();

  // Review editor: rows labelled by source line, problems inline. Nothing saved.
  await expect(dialog.getByLabel("Term, line 1")).toHaveValue("rain cats and dogs");
  await expect(dialog.getByLabel(/^Term, line/)).toHaveCount(7);
  await expect(dialog.getByLabel("Term, line 3")).toHaveValue("on cloud nine");
  await expect(dialog.getByText("Already in Weather idioms — will be skipped")).toBeVisible();
  await expect(dialog.getByText("Duplicate of line 1 — will be skipped")).toBeVisible();
  await expect(dialog.getByText("No delimiter found")).toHaveCount(2);
  expect(await prisma.card.count({ where: { flashcardId: flashcard.id } })).toBe(1);

  // The summary strip jumps to the first problem row.
  const strip = dialog.getByRole("button", { name: /7 rows, 2 need fixing, 2 duplicates/ });
  await expect(strip).toBeVisible();
  await strip.click();
  await expect(dialog.getByLabel("Definition, line 4")).toBeFocused();

  // Fix line 4 in place, remove line 6, add a new row.
  await dialog.getByLabel("Term, line 4").fill("a perfect storm");
  await dialog.getByLabel("Definition, line 4").fill("a rare combination of bad events");
  await expect(dialog.getByText("No delimiter found")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Remove line 6" }).click();
  await expect(dialog.getByLabel("Term, line 6")).toHaveCount(0);
  await dialog.getByRole("button", { name: "+ Add row" }).click();
  await expect(dialog.getByLabel("Term, new row 1")).toBeFocused();
  await page.keyboard.type("fair-weather friend");
  await page.keyboard.press("Tab");
  await page.keyboard.type("someone who is only around in good times");

  await dialog.getByRole("button", { name: "Save 4 cards" }).click();

  // Results: exactly three groups.
  const results = dialog.getByRole("group", { name: "Import results" });
  await expect(results.getByRole("heading", { name: "Created (4)" })).toBeVisible();
  await expect(results.getByRole("heading", { name: "Duplicates skipped (2)" })).toBeVisible();
  await expect(results.getByRole("heading", { name: "Errors (1)" })).toBeVisible();
  await expect(results.getByRole("heading")).toHaveCount(3);
  await expect(results).toContainText("L5");
  await expect(results).toContainText("L7");
  await expect(results).toContainText("L8");
  await expect(results).toContainText("Definition is required");
  await expect(dialog.getByText("Import successful!")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("5 cards", { exact: true })).toBeVisible();
  await expect(page.getByText("fair-weather friend")).toBeVisible();
  await expect(page.getByText("on cloud nine")).toBeVisible();

  const cards = await prisma.card.findMany({
    where: { flashcardId: flashcard.id },
    include: { schedulingRecords: true },
  });
  expect(cards.map((c) => c.term).sort()).toEqual([
    "a perfect storm",
    "fair-weather friend",
    "on cloud nine",
    "rain cats and dogs",
    "under the weather",
  ]);
  // The seeded Card has no Scheduling Records; each imported Card has two.
  const imported = cards.filter((c) => c.term !== "under the weather");
  expect(imported.every((c) => c.schedulingRecords.length === 2)).toBe(true);
});

test("Back and switching to Manual ask before discarding reviewed rows", async ({ page }) => {
  const email = await register(page);
  const flashcard = await seedFlashcard(email);
  const dialog = await openImport(page, flashcard.id);
  await dialog.getByLabel("Paste cards").fill("alpha\tone\nbeta\ttwo");
  await dialog.getByRole("button", { name: "Preview" }).click();
  await expect(dialog.getByRole("button", { name: "Save 2 cards" })).toBeVisible();

  await dialog.getByLabel("Definition, line 2").fill("edited");
  await dialog.getByRole("button", { name: "← Back to paste" }).click();
  await expect(
    dialog.getByText("Go back to the paste box? Your edits to these rows are discarded.")
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog.getByLabel("Definition, line 2")).toHaveValue("edited");

  await dialog.getByRole("tab", { name: "Manual" }).click();
  await expect(dialog.getByText("Switch to Manual? The reviewed rows are discarded.")).toBeVisible();
  await dialog.getByRole("button", { name: "Discard rows" }).click();
  await expect(dialog.getByRole("tab", { name: "Manual" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(dialog.getByLabel("Term, row 1")).toBeVisible();

  // The paste text survives; Back discards the edits after the confirm.
  await dialog.getByRole("tab", { name: "Import" }).click();
  await expect(dialog.getByLabel("Paste cards")).toHaveValue("alpha\tone\nbeta\ttwo");
  await dialog.getByRole("button", { name: "Preview" }).click();
  await dialog.getByRole("button", { name: "← Back to paste" }).click();
  await dialog.getByRole("button", { name: "Discard edits" }).click();
  await expect(dialog.getByLabel("Paste cards")).toBeVisible();
  expect(await prisma.card.count({ where: { flashcardId: flashcard.id } })).toBe(1);
});

test("discard prompts on close; repeats follow the current rows; Done closes", async ({
  page,
}) => {
  const email = await register(page);
  const flashcard = await seedFlashcard(email);
  const dialog = await openImport(page, flashcard.id);
  const paste = dialog.getByLabel("Paste cards");

  // Cancel with pasted text asks first; Keep editing keeps the text.
  await paste.fill("cat\tmèo\ndog\tchó\nCat\tcon mèo");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog.getByText("Discard the pasted text?")).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(paste).toHaveValue("cat\tmèo\ndog\tchó\nCat\tcon mèo");

  // Escape in review asks before discarding the reviewed rows.
  await dialog.getByRole("button", { name: "Preview" }).click();
  await expect(dialog.getByLabel("Term, line 1")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog.getByText("Discard the reviewed rows?")).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toBeVisible();

  // In-paste repeats are derived from the current rows.
  await expect(dialog.getByText("Duplicate of line 1 — will be skipped")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save 2 cards" })).toBeVisible();
  await dialog.getByLabel("Term, line 1").fill("kitten");
  await expect(dialog.getByText("Duplicate of line 1 — will be skipped")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Save 3 cards" })).toBeVisible();
  // Editing a Term into a repeat flags it.
  await dialog.getByLabel("Term, line 2").fill("Kitten");
  await expect(dialog.getByText("Duplicate of line 1 — will be skipped")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save 2 cards" })).toBeVisible();
  // Removing the earlier row clears the later row's note.
  await dialog.getByRole("button", { name: "Remove line 1" }).click();
  await expect(dialog.getByText(/Duplicate of line/)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Save 2 cards" })).toBeVisible();

  await dialog.getByRole("button", { name: "Save 2 cards" }).click();
  await expect(
    dialog.getByRole("group", { name: "Import results" }).getByRole("heading", {
      name: "Created (2)",
    })
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(await prisma.card.count({ where: { flashcardId: flashcard.id } })).toBe(3);
});

test("more than 200 lines is rejected at Preview", async ({ page }) => {
  const email = await register(page);
  const flashcard = await seedFlashcard(email);
  const dialog = await openImport(page, flashcard.id);
  const text = Array.from({ length: 201 }, (_, i) => `t${i}\td`).join("\n");
  await dialog.getByLabel("Paste cards").fill(text);
  await dialog.getByRole("button", { name: "Preview" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Paste at most 200 lines per import.");
  await expect(dialog.getByLabel(/^Term, line/)).toHaveCount(0);
});

// Visual check: screenshots land in test-results/screenshots.
for (const theme of ["dark", "light"] as const) {
  test(`import paste, review and results screenshots (${theme})`, async ({ page }) => {
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.setViewportSize({ width: 1280, height: 1000 });
    const email = await register(page);
    const flashcard = await seedFlashcard(email);
    await page.goto(`/flashcards/${flashcard.id}`);
    await page.evaluate((t) => {
      if (t === "light") document.documentElement.dataset.theme = "light";
      else delete document.documentElement.dataset.theme;
    }, theme);
    const shot = (name: string) =>
      page.screenshot({
        path: `test-results/screenshots/import-${name}-${theme}.png`,
        animations: "disabled",
      });
    await page.getByRole("button", { name: "Add cards" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Import" }).click();
    await dialog.getByLabel("Delimiter").selectOption("em-dash");
    await dialog.getByLabel("Paste cards").fill(PASTE);
    await shot("paste");
    await dialog.getByRole("button", { name: "Preview" }).click();
    await expect(dialog.getByLabel("Term, line 1")).toBeVisible();
    await shot("review");
    await dialog.getByRole("button", { name: /^Save \d+ cards?$/ }).click();
    await expect(dialog.getByRole("group", { name: "Import results" })).toBeVisible();
    await shot("results");
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Add cards" }).click();
    await page.getByRole("dialog").getByRole("tab", { name: "Import" }).click();
    await page.getByRole("dialog").getByLabel("Delimiter").selectOption("em-dash");
    await page.getByRole("dialog").getByLabel("Paste cards").fill(PASTE);
    await page.getByRole("dialog").getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("dialog").getByLabel("Term, line 1")).toBeVisible();
    await shot("review-mobile");
  });
}
