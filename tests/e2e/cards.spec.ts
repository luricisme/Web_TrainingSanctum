import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";

async function register(page: Page): Promise<string> {
  const email = `e2e-cards-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Cards E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  return email;
}

async function seedFolder(email: string, folderName = "Weather idioms") {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const cls = await prisma.class.create({
    data: {
      name: "IELTS",
      userId: user.id,
      folders: {
        create: [
          { name: "Unsorted", isUnsorted: true, userId: user.id },
          { name: folderName, userId: user.id },
        ],
      },
    },
    include: { folders: true },
  });
  const folder = cls.folders.find((f) => f.name === folderName)!;
  return { user, cls, folder };
}

test("class page links to the folder page and the empty state offers Add cards", async ({
  page,
}) => {
  const email = await register(page);
  const { cls, folder } = await seedFolder(email);
  await page.goto(`/classes/${cls.id}`);
  await page.getByRole("link", { name: /Weather idioms/ }).click();
  await expect(page).toHaveURL(`/folders/${folder.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Weather idioms" })).toBeVisible();
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs).toContainText("Classes / IELTS / Weather idioms");
  await expect(page.getByText("This folder has no cards yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add cards" })).toHaveCount(1);
  await crumbs.getByRole("link", { name: "IELTS" }).click();
  await expect(page).toHaveURL(`/classes/${cls.id}`);
});

test("Unsorted is reachable and an unknown folder shows not found", async ({ page }) => {
  const email = await register(page);
  const { cls } = await seedFolder(email);
  await page.goto(`/classes/${cls.id}`);
  await page.getByRole("link", { name: /Unsorted/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Unsorted" })).toBeVisible();
  await page.goto("/folders/does-not-exist");
  await expect(page.getByText("This folder does not exist.")).toBeVisible();
});

test("add rows with the keyboard, save Unicode, mixed rows, discard prompt", async ({
  page,
}) => {
  const email = await register(page);
  const { folder } = await seedFolder(email);
  await page.goto(`/folders/${folder.id}`);
  await page.getByRole("button", { name: "Add cards" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Add cards to Weather idioms" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Manual" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(dialog.getByRole("tab", { name: "Import" })).toBeDisabled();
  await expect(dialog.getByLabel("Term, row 1")).toBeFocused();
  await expect(dialog.getByLabel(/^Term, row/)).toHaveCount(3);

  // Row 1, keyboard only: Term, then Tab to Definition.
  await page.keyboard.type("/ˈkɒl.ə.keɪt/");
  await page.keyboard.press("Tab");
  await page.keyboard.type("café 日本語");
  // Row 2 is half filled (no Definition).
  await dialog.getByLabel("Term, row 2").fill("orphan");
  // Row 3 stays empty. Enter in the last field of the last row adds row 4.
  await dialog.getByLabel("Definition, row 3").focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByLabel("Term, row 4")).toBeFocused();
  await page.keyboard.type("second");
  await page.keyboard.press("Tab");
  await page.keyboard.type("two");

  await dialog.getByRole("button", { name: "Save" }).click();
  // Valid rows saved; the bad row stays open with a field error.
  await expect(dialog.getByText("Enter a definition.")).toBeVisible();
  await expect(dialog.getByText("2 cards added.")).toBeVisible();
  await expect(dialog.getByLabel(/^Term, row/)).toHaveCount(2);
  expect(await prisma.card.count({ where: { folderId: folder.id } })).toBe(2);

  // Closing with unsaved text asks first.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog.getByText("Discard the cards you have typed?")).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog.getByLabel("Term, row 1")).toHaveValue("orphan");
  await dialog.getByLabel("Definition, row 1").fill("fixed");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText("3 cards", { exact: true })).toBeVisible();
  await expect(page.getByText("/ˈkɒl.ə.keɪt/")).toBeVisible();
  await expect(page.getByText("café 日本語")).toBeVisible();
  const cards = await prisma.card.findMany({
    where: { folderId: folder.id },
    include: { schedulingRecords: true },
  });
  expect(cards).toHaveLength(3);
  expect(cards.every((c) => c.schedulingRecords.length === 2)).toBe(true);

  // Counts update on the class list.
  await page.goto("/classes");
  await expect(page.getByText("3 cards").first()).toBeVisible();
});

test("saving nothing shows an inline message; discard closes the panel", async ({ page }) => {
  const email = await register(page);
  const { folder } = await seedFolder(email);
  await page.goto(`/folders/${folder.id}`);
  await page.getByRole("button", { name: "Add cards" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Fill in at least one row.")).toBeVisible();
  expect(await prisma.card.count({ where: { folderId: folder.id } })).toBe(0);

  await dialog.getByRole("button", { name: "More fields, row 1" }).click();
  await dialog.getByLabel("Example sentence, row 1").fill("typed");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.getByRole("button", { name: "Discard" }).click();
  await expect(dialog).toBeHidden();
});

// Visual check: screenshots land in test-results/screenshots.
for (const theme of ["dark", "light"] as const) {
  test(`folder page and panel screenshots (${theme})`, async ({ page }) => {
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    const email = await register(page);
    const { user, folder } = await seedFolder(email);
    const setTheme = () =>
      page.evaluate((t) => {
        if (t === "light") document.documentElement.dataset.theme = "light";
        else delete document.documentElement.dataset.theme;
      }, theme);
    const shot = async (name: string) => {
      await expect(page.getByRole("heading", { level: 1, name: "Weather idioms" })).toBeVisible();
      await setTheme();
      await page.screenshot({
        path: `test-results/screenshots/cards-${name}-${theme}.png`,
        animations: "disabled",
      });
    };

    await page.goto(`/folders/${folder.id}`);
    await shot("empty");

    for (const [term, definition] of [
      ["break the ice", "to make people feel comfortable at the start"],
      ["under the weather", "slightly ill"],
      ["a storm in a teacup", "a lot of fuss about something minor"],
    ]) {
      await prisma.card.create({
        data: { term, definition, folderId: folder.id, userId: user.id },
      });
    }
    await page.reload();
    await shot("populated");

    await page.getByRole("button", { name: "Add cards" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Term, row 1").fill("raining cats and dogs");
    await dialog.getByLabel("Definition, row 1").fill("raining very hard");
    await dialog.getByLabel("Term, row 2").fill("missing definition");
    await dialog.getByRole("button", { name: "More fields, row 2" }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Enter a definition.")).toBeVisible();
    await expect(dialog.getByText(/1 card added/)).toBeVisible();
    await shot("panel-error");
  });
}
