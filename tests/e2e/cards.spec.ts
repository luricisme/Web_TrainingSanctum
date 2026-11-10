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

// spec-2-4: Edit a Card.
async function seedCard(email: string) {
  const { user, folder } = await seedFolder(email);
  const card = await prisma.card.create({
    data: {
      term: "under the weather",
      definition: "slightly ill",
      folderId: folder.id,
      userId: user.id,
    },
  });
  return { user, folder, card };
}

test("edit a card with the keyboard, field error keeps old text, discard prompt", async ({
  page,
}) => {
  const email = await register(page);
  const { folder, card } = await seedCard(email);
  await page.goto(`/folders/${folder.id}`);

  await page.getByRole("button", { name: /^Edit card 1/ }).click();
  const dialog = page.getByRole("dialog");
  const term = dialog.getByLabel("Term", { exact: true });
  await expect(dialog.getByRole("heading", { name: "Edit card" })).toBeVisible();
  await expect(term).toHaveValue("under the weather");
  await expect(term).toBeFocused();

  // Clearing Term shows a field error and the row keeps its old text.
  await term.fill("");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Enter a term.")).toBeVisible();
  await expect(page.getByText("under the weather")).toBeVisible();
  expect((await prisma.card.findUniqueOrThrow({ where: { id: card.id } })).term).toBe(
    "under the weather"
  );

  // Fix by keyboard, change the definition, add Part of speech, save.
  await expect(term).toBeFocused();
  await page.keyboard.type("café 日本語");
  await page.keyboard.press("Tab");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("/ˈkɒl.ə.keɪt/");
  await dialog.getByRole("button", { name: "More fields" }).click();
  await dialog.getByLabel("Part of speech").fill("noun");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("café 日本語")).toBeVisible();
  await expect(page.getByText("/ˈkɒl.ə.keɪt/")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Edit card 1/ })).toBeFocused();
  const row = await prisma.card.findUniqueOrThrow({
    where: { id: card.id },
    include: { schedulingRecords: true },
  });
  expect(row).toMatchObject({ term: "café 日本語", partOfSpeech: "noun" });

  // Unsaved changes ask before discarding.
  await page.getByRole("button", { name: /^Edit card 1/ }).click();
  await term.fill("changed");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog.getByText("Discard your changes?")).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(term).toHaveValue("changed");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.getByRole("button", { name: "Discard" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("café 日本語")).toBeVisible();

  // Escape with unsaved changes also asks before discarding.
  await page.getByRole("button", { name: /^Edit card 1/ }).click();
  await term.fill("changed again");
  await page.keyboard.press("Escape");
  await expect(dialog.getByText("Discard your changes?")).toBeVisible();
});

for (const theme of ["dark", "light"] as const) {
  test(`edit modal screenshots (${theme})`, async ({ page }) => {
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    const email = await register(page);
    const { folder } = await seedCard(email);
    await page.goto(`/folders/${folder.id}`);
    await page.evaluate((t) => {
      if (t === "light") document.documentElement.dataset.theme = "light";
      else delete document.documentElement.dataset.theme;
    }, theme);
    const shot = (name: string) =>
      page.screenshot({
        path: `test-results/screenshots/edit-card-${name}-${theme}.png`,
        animations: "disabled",
      });

    await expect(page.getByRole("button", { name: /^Edit card 1/ })).toBeVisible();
    await shot("row");
    await page.getByRole("button", { name: /^Edit card 1/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "More fields" }).click();
    await dialog.getByLabel("Example sentence").fill("I am feeling under the weather today.");
    await shot("prefilled");
    await dialog.getByLabel("Term", { exact: true }).fill("");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Enter a term.")).toBeVisible();
    await shot("error");
  });
}

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

// spec-2-5: Delete a Card.
test("delete a card: Cancel and Escape keep it, confirm removes it and shows empty state", async ({
  page,
}) => {
  const email = await register(page);
  const { user, folder, card } = await seedCard(email);
  await prisma.card.create({
    data: { term: "second card", definition: "other", folderId: folder.id, userId: user.id },
  });
  await page.goto(`/folders/${folder.id}`);
  await expect(page.getByText("2 cards")).toBeVisible();

  const dialog = page.getByRole("dialog");
  const del = page.getByRole("button", { name: /^Delete card \d: under the weather/ });
  await del.focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("heading", { name: "Delete card" })).toBeVisible();
  await expect(dialog).toContainText("under the weather");
  await expect(dialog).toContainText("cannot be undone");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(del).toBeFocused();
  await del.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await prisma.card.count({ where: { folderId: folder.id } })).toBe(2);

  // Confirm: row and count go, focus moves to the next row's Delete.
  await del.click();
  await dialog.getByRole("button", { name: "Delete card" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("under the weather")).toHaveCount(0);
  await expect(page.getByText("1 card", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Delete card 1: second card/ })).toBeFocused();
  expect(await prisma.card.findUnique({ where: { id: card.id } })).toBeNull();

  // Last card: empty state with Add cards, focus on it.
  await page.getByRole("button", { name: /^Delete card 1/ }).click();
  await dialog.getByRole("button", { name: "Delete card" }).click();
  await expect(page.getByText("This folder has no cards yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add cards" })).toBeFocused();
});

test("delete: a server failure keeps the card and modal; a 404 counts as already deleted", async ({
  page,
}) => {
  const email = await register(page);
  const { folder } = await seedCard(email);
  await page.goto(`/folders/${folder.id}`);
  const dialog = page.getByRole("dialog");
  const open = page.getByRole("button", { name: /^Delete card 1: under the weather/ });

  // 5xx: modal stays open with a message, the card is still listed and still in the DB.
  await page.route("**/api/cards/*", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "INTERNAL", message: "Could not delete the card." } }),
        })
      : route.continue()
  );
  await open.click();
  await dialog.getByRole("button", { name: "Delete card" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Could not delete the card.");
  await expect(dialog.getByRole("button", { name: "Delete card" })).toBeEnabled();
  await expect(page.getByText("under the weather").first()).toBeVisible();
  expect(await prisma.card.count({ where: { folderId: folder.id } })).toBe(1);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.unroute("**/api/cards/*");

  // 404: the card is already gone, so the modal closes and the row disappears.
  await page.route("**/api/cards/*", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "NOT_FOUND", message: "Card not found." } }),
        })
      : route.continue()
  );
  await open.click();
  // Another tab deletes the card while the modal is open.
  await prisma.card.deleteMany({ where: { folderId: folder.id } });
  await dialog.getByRole("button", { name: "Delete card" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("This folder has no cards yet.")).toBeVisible();
});

for (const theme of ["dark", "light"] as const) {
  test(`delete modal screenshots (${theme})`, async ({ page }) => {
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    const email = await register(page);
    const { folder } = await seedCard(email);
    await page.goto(`/folders/${folder.id}`);
    await page.evaluate((t) => {
      if (t === "light") document.documentElement.dataset.theme = "light";
      else delete document.documentElement.dataset.theme;
    }, theme);
    await expect(page.getByRole("button", { name: /^Delete card 1/ })).toBeVisible();
    await page.screenshot({
      path: `test-results/screenshots/delete-card-row-${theme}.png`,
      animations: "disabled",
    });
    await page.getByRole("button", { name: /^Delete card 1/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({
      path: `test-results/screenshots/delete-card-modal-${theme}.png`,
      animations: "disabled",
    });
  });
}

// spec-2-6: Move a Card.
async function seedSecondClass(userId: string) {
  return prisma.class.create({
    data: {
      name: "TOEFL",
      userId,
      folders: {
        create: [
          { name: "Unsorted", isUnsorted: true, userId },
          { name: "Academic", userId },
        ],
      },
    },
    include: { folders: true },
  });
}

test("move a card: Cancel and Escape keep it, move across Classes removes the row, last card shows empty state", async ({
  page,
}) => {
  const email = await register(page);
  const { user, folder, card } = await seedCard(email);
  const toefl = await seedSecondClass(user.id);
  const academic = toefl.folders.find((f) => f.name === "Academic")!;
  await page.goto(`/folders/${folder.id}`);

  const dialog = page.getByRole("dialog");
  const move = page.getByRole("button", { name: /^Move card \d: under the weather/ });
  await move.focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("heading", { name: "Move card" })).toBeVisible();
  await expect(dialog).toContainText("under the weather");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Move card" })).toBeDisabled();
  // Current Class preselected; the current Folder is not offered.
  await expect(dialog.getByLabel("Class").locator("option:checked")).toHaveText("IELTS");
  await expect(dialog.getByLabel("Folder").locator("option", { hasText: "Weather idioms" })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await move.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect((await prisma.card.findUniqueOrThrow({ where: { id: card.id } })).folderId).toBe(folder.id);

  // Move across Classes.
  await move.click();
  await dialog.getByLabel("Class").selectOption({ label: "TOEFL" });
  await dialog.getByLabel("Folder").selectOption({ label: "Academic" });
  await dialog.getByRole("button", { name: "Move card" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("This folder has no cards yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add cards" })).toBeFocused();
  expect((await prisma.card.findUniqueOrThrow({ where: { id: card.id } })).folderId).toBe(academic.id);

  await page.goto(`/folders/${academic.id}`);
  await expect(page.getByText("under the weather")).toBeVisible();
  await expect(page.getByText("1 card", { exact: true })).toBeVisible();
});

test("move: a server failure keeps the card and modal open", async ({ page }) => {
  const email = await register(page);
  const { user, folder, card } = await seedCard(email);
  await seedSecondClass(user.id);
  await page.goto(`/folders/${folder.id}`);
  await page.route("**/api/cards/*/move", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "INTERNAL", message: "Could not move the card." } }),
    })
  );
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: /^Move card 1/ }).click();
  await dialog.getByLabel("Class").selectOption({ label: "TOEFL" });
  await dialog.getByLabel("Folder").selectOption({ label: "Academic" });
  await dialog.getByRole("button", { name: "Move card" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Could not move the card.");
  await expect(dialog.getByRole("button", { name: "Move card" })).toBeEnabled();
  await expect(page.getByText("under the weather").first()).toBeVisible();
  expect((await prisma.card.findUniqueOrThrow({ where: { id: card.id } })).folderId).toBe(folder.id);
});

test("move: a missing folder keeps the modal open; a missing card closes it and drops the row", async ({
  page,
}) => {
  const email = await register(page);
  const { user, folder } = await seedCard(email);
  await seedSecondClass(user.id);
  await page.goto(`/folders/${folder.id}`);
  const dialog = page.getByRole("dialog");
  const pickAndMove = async () => {
    await page.getByRole("button", { name: /^Move card 1/ }).click();
    await dialog.getByLabel("Class").selectOption({ label: "TOEFL" });
    await dialog.getByLabel("Folder").selectOption({ label: "Academic" });
    await dialog.getByRole("button", { name: "Move card" }).click();
  };

  await page.route("**/api/cards/*/move", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "FOLDER_NOT_FOUND", message: "Folder not found." } }),
    })
  );
  await pickAndMove();
  await expect(dialog.getByRole("alert")).toContainText("That folder no longer exists");
  await expect(page.getByText("under the weather").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.unroute("**/api/cards/*/move");

  await page.route("**/api/cards/*/move", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "NOT_FOUND", message: "Card not found." } }),
    })
  );
  await pickAndMove();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("This folder has no cards yet.")).toBeVisible();
});

for (const theme of ["dark", "light"] as const) {
  test(`move modal screenshots (${theme})`, async ({ page }) => {
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    const email = await register(page);
    const { user, folder } = await seedCard(email);
    await seedSecondClass(user.id);
    await page.goto(`/folders/${folder.id}`);
    await page.evaluate((t) => {
      if (t === "light") document.documentElement.dataset.theme = "light";
      else delete document.documentElement.dataset.theme;
    }, theme);
    await expect(page.getByRole("button", { name: /^Move card 1/ })).toBeVisible();
    await page.screenshot({
      path: `test-results/screenshots/move-card-row-${theme}.png`,
      animations: "disabled",
    });
    await page.getByRole("button", { name: /^Move card 1/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Class").selectOption({ label: "TOEFL" });
    await dialog.getByLabel("Folder").selectOption({ label: "Academic" });
    await page.screenshot({
      path: `test-results/screenshots/move-card-modal-${theme}.png`,
      animations: "disabled",
    });
  });
}
