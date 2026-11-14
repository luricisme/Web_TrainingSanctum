import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";

// spec-2-7: Flashcard CRUD on the Folder page.

async function register(page: Page): Promise<string> {
  const email = `e2e-flashcards-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Flashcards E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  return email;
}

async function seedFolder(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const cls = await prisma.class.create({
    data: { color: "LAVENDER",
      name: "IELTS",
      userId: user.id,
      folders: {
        create: [
          { name: "Unsorted", isUnsorted: true, userId: user.id },
          { name: "Speaking", userId: user.id },
        ],
      },
    },
    include: { folders: true },
  });
  const folder = cls.folders.find((f) => f.name === "Speaking")!;
  return { user, cls, folder };
}

async function openMenu(page: Page, name: string, item: "Rename" | "Move to…" | "Delete") {
  await page.getByRole("button", { name: `Options for ${name}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

function setTheme(page: Page, theme: "dark" | "light") {
  return page.evaluate((t) => {
    if (t === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
  }, theme);
}

test("an empty Folder shows the empty state; create, duplicate error and open", async ({
  page,
}) => {
  const email = await register(page);
  const { folder } = await seedFolder(email);
  await page.goto(`/folders/${folder.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Speaking" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" })
  ).toContainText("Classes / IELTS / Speaking");
  await expect(page.getByText("Create a flashcard to start adding cards.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create flashcard" })).toHaveCount(1);

  await page.getByRole("button", { name: "Create flashcard" }).click();
  await expect(page.getByLabel("Flashcard name")).toBeFocused();
  await page.getByLabel("Flashcard name").fill("Weather idioms");
  await page.getByRole("dialog").getByRole("button", { name: "Create flashcard" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Weather idioms", { exact: true })).toBeVisible();
  await expect(page.getByText("0 cards", { exact: true })).toBeVisible();
  await expect(page.getByText("Create a flashcard to start adding cards.")).toHaveCount(0);

  // Same name in any casing is rejected inline and nothing is created.
  await page.getByRole("button", { name: "Create flashcard" }).click();
  await page.getByLabel("Flashcard name").fill("weather IDIOMS");
  await page.getByRole("dialog").getByRole("button", { name: "Create flashcard" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("already exists");
  await page.keyboard.press("Escape");
  expect(await prisma.flashcard.count({ where: { folderId: folder.id } })).toBe(1);

  await page.getByRole("link", { name: /Weather idioms/ }).click();
  await expect(page).toHaveURL(/\/flashcards\//);
  await expect(page.getByRole("heading", { level: 1, name: "Weather idioms" })).toBeVisible();
});

test("rename updates both pages; a clash errors inline", async ({ page }) => {
  const email = await register(page);
  const { user, folder } = await seedFolder(email);
  const a = await prisma.flashcard.create({
    data: { name: "Alpha", folderId: folder.id, userId: user.id },
  });
  await prisma.flashcard.create({
    data: { name: "Beta", folderId: folder.id, userId: user.id },
  });
  await page.goto(`/folders/${folder.id}`);

  await openMenu(page, "Alpha", "Rename");
  await expect(page.getByLabel("Flashcard name")).toBeFocused();
  await page.getByLabel("Flashcard name").fill("beta");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("already exists");

  await page.getByLabel("Flashcard name").fill("Gamma");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Gamma", { exact: true })).toBeVisible();
  await expect(page.getByText("Alpha", { exact: true })).toHaveCount(0);

  await page.goto(`/flashcards/${a.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Gamma" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(
    "Classes / IELTS / Speaking / Gamma"
  );
});

test("delete confirms with the name and Card count; Cancel and Escape keep it", async ({
  page,
}) => {
  const email = await register(page);
  const { user, folder } = await seedFolder(email);
  const doomed = await prisma.flashcard.create({
    data: { name: "Doomed set", folderId: folder.id, userId: user.id },
  });
  const cards = [];
  for (const term of ["a", "b", "c"]) {
    cards.push(
      await prisma.card.create({
        data: { term, definition: term, flashcardId: doomed.id, userId: user.id },
      })
    );
  }
  for (const card of cards) {
    await prisma.schedulingRecord.createMany({
      data: (["TERM_TO_DEFINITION", "DEFINITION_TO_TERM"] as const).map((direction) => ({
        cardId: card.id,
        direction,
        nextReviewDate: new Date(),
      })),
    });
  }
  await page.goto(`/folders/${folder.id}`);
  await expect(page.getByText("3 cards", { exact: true }).first()).toBeVisible();

  const dialog = page.getByRole("dialog");
  await openMenu(page, "Doomed set", "Delete");
  await expect(dialog).toContainText("Doomed set");
  await expect(dialog).toContainText("3 cards");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await openMenu(page, "Doomed set", "Delete");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await prisma.flashcard.count({ where: { id: doomed.id } })).toBe(1);
  expect(await prisma.card.count({ where: { flashcardId: doomed.id } })).toBe(3);

  await openMenu(page, "Doomed set", "Delete");
  await dialog.getByRole("button", { name: "Delete flashcard" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Doomed set", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Create a flashcard to start adding cards.")).toBeVisible();
  expect(await prisma.flashcard.count({ where: { id: doomed.id } })).toBe(0);
  expect(await prisma.card.count({ where: { flashcardId: doomed.id } })).toBe(0);
  expect(
    await prisma.schedulingRecord.count({ where: { cardId: { in: cards.map((c) => c.id) } } })
  ).toBe(0);
});

test("open a Flashcard and add, edit and delete Cards in it", async ({ page }) => {
  const email = await register(page);
  const { user, folder } = await seedFolder(email);
  const flashcard = await prisma.flashcard.create({
    data: { name: "Weather idioms", folderId: folder.id, userId: user.id },
  });
  await page.goto(`/folders/${folder.id}`);
  await page.getByRole("link", { name: /Weather idioms/ }).click();

  await page.getByRole("button", { name: "Add cards" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Add cards to Weather idioms" })
  ).toBeVisible();
  await dialog.getByLabel("Term, row 1").fill("under the weather");
  await dialog.getByLabel("Definition, row 1").fill("slightly ill");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("region", { name: "Cards", exact: true }).getByText("under the weather")).toBeVisible();
  expect(await prisma.card.count({ where: { flashcardId: flashcard.id } })).toBe(1);

  // Back to the Folder page through the breadcrumb (no reload): the count is fresh.
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await crumbs.getByRole("link", { name: folder.name }).click();
  await expect(page.getByText("1 card", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: /Weather idioms/ }).click();

  await page.getByRole("button", { name: /^Edit card 1/ }).click();
  await dialog.getByLabel("Term", { exact: true }).fill("break the ice");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("region", { name: "Cards", exact: true }).getByText("break the ice")).toBeVisible();

  await page.getByRole("button", { name: /^Delete card 1/ }).click();
  await dialog.getByRole("button", { name: "Delete card" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Add cards to start studying this flashcard.")).toBeVisible();

  // Counts reach the Folder page without a reload.
  await crumbs.getByRole("link", { name: folder.name }).click();
  await expect(page.getByText("0 cards", { exact: true }).first()).toBeVisible();
});

async function seedMoveWorld(email: string) {
  const { user, cls, folder } = await seedFolder(email);
  const other = await prisma.class.create({
    data: { color: "LAVENDER",
      name: "Work",
      userId: user.id,
      folders: {
        create: [
          { name: "Unsorted", isUnsorted: true, userId: user.id },
          { name: "Meetings", userId: user.id },
        ],
      },
    },
    include: { folders: true },
  });
  const meetings = other.folders.find((f) => f.name === "Meetings")!;
  const flashcard = await prisma.flashcard.create({
    data: { name: "Idioms", folderId: folder.id, userId: user.id },
  });
  await prisma.card.create({
    data: { term: "t", definition: "d", flashcardId: flashcard.id, userId: user.id },
  });
  return { user, cls, folder, other, meetings, flashcard };
}

test("Move to… via keyboard; Cancel and Escape keep it; across Classes renames on a clash", async ({
  page,
}) => {
  const email = await register(page);
  const { user, folder, meetings, flashcard } = await seedMoveWorld(email);
  await prisma.flashcard.create({
    data: { name: "idioms", folderId: meetings.id, userId: user.id },
  });
  await page.goto(`/folders/${folder.id}`);
  const dialog = page.getByRole("dialog");

  await page.getByRole("button", { name: "Options for Idioms" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem")).toHaveText(["Rename", "Move to…", "Delete"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("heading", { name: "Move flashcard" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expect(dialog.getByLabel("Class")).toHaveValue(folder.classId);
  // Current Folder is omitted; only Unsorted remains in this Class.
  await expect(dialog.getByLabel("Folder").locator("option")).toHaveText([
    "Choose a folder",
    "Unsorted",
  ]);
  await expect(dialog.getByRole("button", { name: "Move flashcard" })).toBeDisabled();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await openMenu(page, "Idioms", "Move to…");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect((await prisma.flashcard.findUniqueOrThrow({ where: { id: flashcard.id } })).folderId).toBe(
    folder.id
  );

  await openMenu(page, "Idioms", "Move to…");
  await dialog.getByLabel("Class").selectOption({ label: "Work" });
  await dialog.getByLabel("Folder").selectOption({ label: "Meetings" });
  await dialog.getByRole("button", { name: "Move flashcard" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Idioms", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Create a flashcard to start adding cards.")).toBeVisible();
  const moved = await prisma.flashcard.findUniqueOrThrow({ where: { id: flashcard.id } });
  expect(moved.folderId).toBe(meetings.id);
  expect(moved.name).toBe("Idioms (2)");
  expect(await prisma.card.count({ where: { flashcardId: flashcard.id } })).toBe(1);

  await page.goto(`/folders/${meetings.id}`);
  await expect(page.getByText("Idioms (2)", { exact: true })).toBeVisible();
});

test("Move modal handles a Class with no other Folder, 5xx and both 404 branches", async ({
  page,
}) => {
  const email = await register(page);
  const { user, folder, flashcard } = await seedMoveWorld(email);
  const empty = await prisma.class.create({
    data: { color: "LAVENDER",
      name: "Empty",
      userId: user.id,
      folders: { create: [{ name: "Unsorted", isUnsorted: true, userId: user.id }] },
    },
    include: { folders: true },
  });
  const lone = empty.folders[0];
  await prisma.flashcard.create({ data: { name: "Solo", folderId: lone.id, userId: user.id } });
  await page.goto(`/folders/${folder.id}`);
  const dialog = page.getByRole("dialog");
  const moveButton = dialog.getByRole("button", { name: "Move flashcard" });
  const url = `**/api/flashcards/${flashcard.id}/move`;
  const respond = (status: number, code: string, message: string) =>
    page.route(url, (route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: { code, message } }),
      })
    );

  await openMenu(page, "Idioms", "Move to…");
  await dialog.getByLabel("Class").selectOption({ label: "Work" });
  await dialog.getByLabel("Folder").selectOption({ label: "Meetings" });

  // 5xx: modal stays open with an inline message, row still listed.
  await respond(500, "INTERNAL_ERROR", "boom");
  await moveButton.click();
  await expect(dialog.getByRole("alert")).toContainText("Could not move the flashcard");
  await page.unroute(url);

  // FOLDER_NOT_FOUND: modal stays open with the specific message.
  await respond(404, "FOLDER_NOT_FOUND", "Folder not found.");
  await dialog.getByLabel("Folder").selectOption({ label: "Meetings" });
  await moveButton.click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "That folder no longer exists. Choose another."
  );
  await page.unroute(url);

  // NAME_CONFLICT: a racing duplicate keeps the modal open and asks for a retry.
  await respond(409, "NAME_CONFLICT", "That name was just taken. Try again.");
  await dialog.getByLabel("Folder").selectOption({ label: "Meetings" });
  await moveButton.click();
  await expect(dialog.getByRole("alert")).toContainText("Try again");
  await expect(moveButton).toBeEnabled();
  await page.unroute(url);

  // NOT_FOUND: already gone, so the modal closes.
  await respond(404, "NOT_FOUND", "Flashcard not found.");
  await dialog.getByLabel("Folder").selectOption({ label: "Meetings" });
  await moveButton.click();
  await expect(dialog).toBeHidden();
  await page.unroute(url);

  // A Class whose only Folder is the current one says so and keeps Move disabled.
  await page.goto(`/folders/${lone.id}`);
  await openMenu(page, "Solo", "Move to…");
  await expect(dialog.getByLabel("Folder")).toContainText("No other folders in this class");
  await expect(dialog.getByLabel("Folder")).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Move flashcard" })).toBeDisabled();
});

for (const theme of ["dark", "light"] as const) {
  test(`move modal and row menu screenshots (${theme})`, async ({ page }) => {
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    const email = await register(page);
    const { folder } = await seedMoveWorld(email);
    await page.goto(`/folders/${folder.id}`);
    await setTheme(page, theme);
    await page.getByRole("button", { name: "Options for Idioms" }).click();
    await page.screenshot({
      path: `test-results/screenshots/flashcards-move-menu-${theme}.png`,
      animations: "disabled",
    });
    await page.getByRole("menuitem", { name: "Move to…" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Class").selectOption({ label: "Work" });
    await dialog.getByLabel("Folder").selectOption({ label: "Meetings" });
    await setTheme(page, theme);
    await page.screenshot({
      path: `test-results/screenshots/flashcards-move-modal-${theme}.png`,
      animations: "disabled",
    });
  });
}

// Visual check: screenshots land in test-results/screenshots.
for (const theme of ["dark", "light"] as const) {
  test(`flashcard list, flashcard page and delete modal screenshots (${theme})`, async ({
    page,
  }) => {
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    const email = await register(page);
    const { user, folder } = await seedFolder(email);
    const shot = async (name: string) => {
      await setTheme(page, theme);
      await page.screenshot({
        path: `test-results/screenshots/flashcards-${name}-${theme}.png`,
        animations: "disabled",
      });
    };

    await page.goto(`/folders/${folder.id}`);
    await expect(page.getByText("Create a flashcard to start adding cards.")).toBeVisible();
    await shot("list-empty");

    const sets: [string, [string, string][]][] = [
      [
        "Weather idioms",
        [
          ["break the ice", "to make people feel comfortable at the start"],
          ["under the weather", "slightly ill"],
          ["a storm in a teacup", "a lot of fuss about something minor"],
        ],
      ],
      ["Business vocabulary", [["leverage", "use something to maximum advantage"]]],
      ["Phrasal verbs", []],
    ];
    let first = "";
    for (const [name, cards] of sets) {
      const flashcard = await prisma.flashcard.create({
        data: { name, folderId: folder.id, userId: user.id },
      });
      if (!first) first = flashcard.id;
      for (const [term, definition] of cards) {
        await prisma.card.create({
          data: { term, definition, flashcardId: flashcard.id, userId: user.id },
        });
      }
    }
    await page.reload();
    await expect(page.getByText("Weather idioms", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Options for Weather idioms" }).hover();
    await shot("list");

    await page.getByRole("button", { name: "Options for Weather idioms" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await shot("delete-modal");
    await page.keyboard.press("Escape");

    await page.goto(`/flashcards/${first}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Weather idioms" })
    ).toBeVisible();
    await shot("page");
  });
}
