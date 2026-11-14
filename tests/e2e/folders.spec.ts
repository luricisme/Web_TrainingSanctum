import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";

async function register(page: Page): Promise<string> {
  const email = `e2e-folders-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Folders E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  return email;
}

/** Seeds a class through Prisma and opens its detail page. */
async function openClass(page: Page, email: string, name: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const cls = await prisma.class.create({
    data: { color: "LAVENDER",
      name,
      userId: user.id,
      folders: { create: { name: "Unsorted", isUnsorted: true, userId: user.id } },
    },
    include: { folders: true },
  });
  await page.goto(`/classes/${cls.id}`);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return { user, cls };
}

async function addFolder(page: Page, name: string) {
  await page.getByRole("button", { name: "Create folder" }).first().click();
  await page.getByLabel("Folder name").fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Create folder" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function openMenu(page: Page, folder: string, item: "Rename" | "Delete") {
  await page.getByRole("button", { name: `Options for ${folder}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("class row links to the detail page with breadcrumb back", async ({ page }) => {
  const email = await register(page);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.class.create({
    data: { color: "LAVENDER",
      name: "IELTS",
      userId: user.id,
      folders: { create: { name: "Unsorted", isUnsorted: true, userId: user.id } },
    },
  });
  await page.goto("/classes");
  await page.getByRole("link", { name: "IELTS" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "IELTS" })).toBeVisible();
  await expect(page.getByText("Unsorted", { exact: true })).toBeVisible();
  await expect(page.getByText("0 flashcards · 0 cards").first()).toBeVisible();
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Classes" }).click();
  await expect(page).toHaveURL(/\/classes$/);
});

test("Unsorted has no menu; create, rename and clash handling", async ({ page }) => {
  const email = await register(page);
  await openClass(page, email, "Weather class");
  await expect(page.getByRole("button", { name: "Options for Unsorted" })).toHaveCount(0);

  await addFolder(page, "Weather");
  await expect(page.getByText("Create a folder to group flashcards by topic.")).toHaveCount(0);

  await page.getByRole("button", { name: "Create folder" }).first().click();
  await page.getByLabel("Folder name").fill("weather");
  await page.getByRole("dialog").getByRole("button", { name: "Create folder" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("already exists");
  await page.keyboard.press("Escape");

  await openMenu(page, "Weather", "Rename");
  await expect(page.getByLabel("Folder name")).toBeFocused();
  await page.getByLabel("Folder name").fill("Storms");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Storms", { exact: true })).toBeVisible();
  await expect(page.getByText("Weather", { exact: true })).toHaveCount(0);
});

test("delete with move keeps the flashcards in Unsorted; delete flashcards too removes them", async ({
  page,
}) => {
  const email = await register(page);
  const { user, cls } = await openClass(page, email, "Deleting");
  const unsorted = cls.folders[0];
  const keep = await prisma.folder.create({
    data: { name: "Keep me", classId: cls.id, userId: user.id },
  });
  const drop = await prisma.folder.create({
    data: { name: "Drop me", classId: cls.id, userId: user.id },
  });
  // "Shared" exists in Unsorted and in "Keep me": the moved one gets " (2)".
  const sharedInUnsorted = await prisma.flashcard.create({
    data: { name: "Shared", folderId: unsorted.id, userId: user.id },
  });
  const sharedInKeep = await prisma.flashcard.create({
    data: { name: "shared", folderId: keep.id, userId: user.id },
  });
  const dropSet = await prisma.flashcard.create({
    data: { name: "Doomed set", folderId: drop.id, userId: user.id },
  });
  for (const [flashcardId, term] of [
    [sharedInKeep.id, "a"],
    [sharedInKeep.id, "b"],
    [dropSet.id, "c"],
  ] as const) {
    await prisma.card.create({
      data: { term, definition: term, flashcardId, userId: user.id },
    });
  }
  await page.reload();
  await expect(page.getByText("1 flashcard · 2 cards", { exact: true })).toBeVisible();

  await openMenu(page, "Keep me", "Delete");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("1 flashcard and 2 cards");
  await expect(
    dialog.getByRole("button", { name: "Move flashcards to Unsorted" })
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Move flashcards to Unsorted" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Keep me", { exact: true })).toHaveCount(0);
  await expect(page.getByText("2 flashcards · 2 cards", { exact: true })).toBeVisible();
  const moved = await prisma.flashcard.findUniqueOrThrow({ where: { id: sharedInKeep.id } });
  expect(moved).toMatchObject({ folderId: unsorted.id, name: "shared (2)" });
  expect(
    (await prisma.flashcard.findUniqueOrThrow({ where: { id: sharedInUnsorted.id } })).name
  ).toBe("Shared");
  expect(await prisma.card.count({ where: { flashcard: { folderId: unsorted.id } } })).toBe(2);

  await openMenu(page, "Drop me", "Delete");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete flashcards too" })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Drop me", { exact: true })).toHaveCount(0);
  expect(await prisma.flashcard.count({ where: { folderId: drop.id } })).toBe(0);
  expect(await prisma.card.count({ where: { flashcardId: dropSet.id } })).toBe(0);

  await page.goto("/classes");
  await expect(page.getByText("1 folder · 2 flashcards · 2 cards")).toBeVisible();
});

test("an unknown class shows a not-found state", async ({ page }) => {
  await register(page);
  await page.goto("/classes/does-not-exist");
  await expect(page.getByText("This class does not exist.")).toBeVisible();
});

// Visual check: screenshots land in test-results/screenshots.
for (const theme of ["dark", "light"] as const) {
  test(`class detail screenshots (${theme})`, async ({ page }) => {
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    const email = await register(page);
    const { user, cls } = await openClass(page, email, "IELTS Academic");
    const setTheme = () =>
      page.evaluate((t) => {
        if (t === "light") document.documentElement.dataset.theme = "light";
        else delete document.documentElement.dataset.theme;
      }, theme);
    const shot = async (name: string) => {
      await setTheme();
      await page.screenshot({
        path: `test-results/screenshots/folders-${name}-${theme}.png`,
        animations: "disabled",
      });
    };

    await shot("empty");

    const weather = await prisma.folder.create({
      data: { name: "Weather idioms", classId: cls.id, userId: user.id },
    });
    await prisma.folder.create({
      data: { name: "Business vocabulary", classId: cls.id, userId: user.id },
    });
    const set = await prisma.flashcard.create({
      data: { name: "Storm words", folderId: weather.id, userId: user.id },
    });
    for (let i = 0; i < 4; i += 1) {
      await prisma.card.create({
        data: { term: `t${i}`, definition: `d${i}`, flashcardId: set.id, userId: user.id },
      });
    }
    await page.reload();
    await setTheme();
    await page.getByRole("button", { name: "Options for Weather idioms" }).hover();
    await shot("populated");

    await page.getByRole("button", { name: "Options for Weather idioms" }).click();
    await shot("menu");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await shot("delete-modal");
  });
}
