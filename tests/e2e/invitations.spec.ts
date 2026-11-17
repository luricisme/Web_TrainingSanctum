import { test, expect, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

const PASSWORD = "correct-horse-battery";

async function register(page: Page, name: string): Promise<string> {
  const email = `e2e-invite-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  return email;
}

async function second(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = await register(page, name);
  return { page, email, context };
}

async function createClass(page: Page, name: string) {
  await page.goto("/classes");
  await page.getByRole("button", { name: "Create class" }).first().click();
  await page.getByLabel("Class name").fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Create class" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

async function openShare(page: Page, className: string) {
  await page.getByRole("button", { name: `Options for ${className}` }).click();
  await page.getByRole("menuitem", { name: "Share" }).click();
  await expect(page.getByRole("dialog", { name: `Share ${className}` })).toBeVisible();
}

test("owner invites, invitee accepts from the bell, owner removes the Member", async ({
  page,
  browser,
}) => {
  await register(page, "Luric Owner");
  const friend = await second(browser, "Friend Member");
  await createClass(page, "IELTS");

  // Owner: a field error, then a real invite (case-insensitive).
  await openShare(page, "IELTS");
  const dialog = page.getByRole("dialog", { name: "Share IELTS" });
  await dialog.getByLabel("Invite by email").fill(`nobody-${randomUUID()}@example.test`);
  await dialog.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("No account uses this email");
  await dialog.getByLabel("Invite by email").fill(friend.email.toUpperCase());
  await dialog.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Pending" })).toBeVisible();
  await expect(dialog.getByText(friend.email, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // Invitee: the bell shows 1 and the invitation text; Decline empties it.
  await friend.page.goto("/classes");
  const bell = friend.page.getByRole("button", { name: "Invitations, 1 pending" });
  await expect(bell).toBeVisible();
  await bell.click();
  const popover = friend.page.getByRole("dialog", { name: "Invitations" });
  await expect(popover).toContainText("Luric Owner invited you to IELTS (0 cards)");
  await popover.getByRole("button", { name: "Decline" }).click();
  await expect(popover).toContainText("No invitations.");
  await friend.page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(friend.page.getByRole("button", { name: "Invitations", exact: true })).toBeFocused();

  // Owner sees it Declined and invites again.
  await openShare(page, "IELTS");
  await expect(dialog.getByRole("heading", { name: "Declined" })).toBeVisible();
  await dialog.getByRole("button", { name: `Invite ${friend.email} again` }).click();
  await expect(dialog.getByRole("heading", { name: "Pending" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Declined" })).toBeHidden();
  await page.keyboard.press("Escape");

  // Keyboard: opening focuses the row, Enter accepts and goes to the Class.
  await friend.page.reload();
  await friend.page.getByRole("button", { name: "Invitations, 1 pending" }).click();
  await expect(friend.page.locator("[data-invitation]").first()).toBeFocused();
  await friend.page.keyboard.press("Enter");
  await friend.page.waitForURL(/\/classes\/.+/);

  // Owner: the Member is listed; Remove asks for confirmation.
  await page.reload();
  await openShare(page, "IELTS");
  await expect(dialog.getByRole("heading", { name: "Members" })).toBeVisible();
  await dialog.getByRole("button", { name: `Remove ${friend.email}` }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText(
    `Remove ${friend.email}? Their progress in IELTS will be deleted.`
  );
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Members" })).toBeHidden();
  await expect(dialog).toContainText("Only you can see this class.");

  await friend.context.close();
});

test("Cancel withdraws an invitation; the bell moves into the panel below 640px and is hidden in focus mode", async ({
  page,
  browser,
}) => {
  await register(page, "Owner Two");
  const friend = await second(browser, "Friend Two");
  await createClass(page, "Cancelable");
  await openShare(page, "Cancelable");
  const dialog = page.getByRole("dialog", { name: "Share Cancelable" });
  await dialog.getByLabel("Invite by email").fill(friend.email);
  await dialog.getByRole("button", { name: "Invite", exact: true }).click();
  await dialog.getByRole("button", { name: `Cancel invitation to ${friend.email}` }).click();
  await expect(dialog.getByRole("heading", { name: "Pending" })).toBeHidden();
  await page.keyboard.press("Escape");
  await friend.page.goto("/classes");
  await expect(friend.page.getByRole("button", { name: "Invitations", exact: true })).toBeVisible();

  // App bar bell from 640px; panel bell below.
  const bar = page.locator("[data-app-bar]");
  await expect(bar.getByRole("button", { name: /^Invitations/ })).toBeVisible();
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(bar).toBeHidden();
  await expect(page.locator("[data-panel-bell]").getByRole("button", { name: /^Invitations/ })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });

  // Learn is a focus-mode session: no bell anywhere.
  const created = await page.request.post("/api/classes", { data: { name: "Focus" } });
  const classId = (await created.json()).data.id as string;
  const folders = await (await page.request.get(`/api/classes/${classId}/folders`)).json();
  const folderId = (folders.data.folders as { id: string }[])[0].id;
  const flashcard = await page.request.post(`/api/folders/${folderId}/flashcards`, {
    data: { name: "Deck" },
  });
  const flashcardId = (await flashcard.json()).data.id as string;
  await page.request.post("/api/cards/batch", {
    data: { flashcardId, cards: [{ term: "a", definition: "b" }] },
  });
  await page.goto(`/flashcards/${flashcardId}/learn`);
  await expect(bar).toBeHidden();
  await expect(page.getByRole("button", { name: /^Invitations/ })).toHaveCount(0);
  await friend.context.close();
});

test("with two invitations, ArrowDown moves between rows and Delete declines the focused one", async ({
  page,
  browser,
}) => {
  const friend = await second(browser, "Friend Keys");
  await register(page, "Owner Keys");
  for (const name of ["Alpha", "Beta"]) {
    await createClass(page, name);
    await openShare(page, name);
    const dialog = page.getByRole("dialog", { name: `Share ${name}` });
    await dialog.getByLabel("Invite by email").fill(friend.email);
    await dialog.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Pending" })).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await friend.page.goto("/classes");
  await friend.page.getByRole("button", { name: "Invitations, 2 pending" }).click();
  const rows = friend.page.locator("[data-invitation]");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toBeFocused();
  await friend.page.keyboard.press("ArrowDown");
  await expect(rows.nth(1)).toBeFocused();
  await friend.page.keyboard.press("Delete");
  await expect(rows).toHaveCount(1);
  await expect(friend.page.getByRole("button", { name: "Invitations, 1 pending" })).toBeVisible();
  await friend.context.close();
});

// Visual check: screenshots land in test-results/screenshots for comparison
// against DESIGN.md and mockups/key-screens.html.
for (const theme of ["dark", "light"] as const) {
  test(`share modal and bell screenshots (${theme})`, async ({ page, browser }) => {
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await register(page, "Luric Owner");
    const a = await second(browser, "Mai Tran");
    const b = await second(browser, "Linh Pham");
    const c = await second(browser, "Minh Vo");
    await createClass(page, "IELTS Academic");
    await createClass(page, "English Idioms");

    const setTheme = (p: Page) =>
      p.evaluate((t) => {
        if (t === "light") document.documentElement.dataset.theme = "light";
        else delete document.documentElement.dataset.theme;
      }, theme);
    const shot = async (p: Page, name: string) => {
      await setTheme(p);
      await p.screenshot({
        path: `test-results/screenshots/invitations-${name}-${theme}.png`,
        animations: "disabled",
      });
    };

    // Owner: one Member, one Pending, one Declined, one Pending left for the bell.
    await openShare(page, "IELTS Academic");
    const dialog = page.getByRole("dialog", { name: "Share IELTS Academic" });
    for (const who of [a, b, c]) {
      await dialog.getByLabel("Invite by email").fill(who.email);
      await dialog.getByRole("button", { name: "Invite", exact: true }).click();
      await expect(dialog.getByText(who.email, { exact: true })).toBeVisible();
    }
    await shot(page, "share-pending");
    await page.keyboard.press("Escape");
    await a.page.goto("/classes");
    await a.page.getByRole("button", { name: "Invitations, 1 pending" }).click();
    await a.page.getByRole("button", { name: "Accept" }).click();
    await a.page.waitForURL(/\/classes\/.+/);
    await b.page.goto("/classes");
    await b.page.getByRole("button", { name: "Invitations, 1 pending" }).click();
    await b.page.getByRole("button", { name: "Decline" }).click();

    await page.reload();
    await openShare(page, "IELTS Academic");
    await expect(dialog.getByRole("heading", { name: "Declined" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Members" })).toBeVisible();
    await dialog.getByLabel("Invite by email").fill("nobody@example.test");
    await dialog.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await shot(page, "share-full");
    await dialog.getByRole("button", { name: `Remove ${a.email}` }).click();
    await shot(page, "remove-confirm");
    await page.setViewportSize({ width: 600, height: 800 });
    await shot(page, "remove-confirm-mobile");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 800 });

    // Invitee with a pending invitation: bell closed and open, empty popover.
    await c.page.setViewportSize({ width: 1280, height: 800 });
    await c.page.goto("/classes");
    await expect(c.page.getByRole("button", { name: "Invitations, 1 pending" })).toBeVisible();
    await shot(c.page, "bell-closed");
    await c.page.getByRole("button", { name: "Invitations, 1 pending" }).click();
    await expect(c.page.getByRole("dialog", { name: "Invitations" })).toContainText("Luric Owner");
    await shot(c.page, "bell-open");
    await c.page.setViewportSize({ width: 600, height: 800 });
    await shot(c.page, "bell-open-mobile");
    await c.page.setViewportSize({ width: 1280, height: 800 });
    await c.page.getByRole("button", { name: "Decline" }).click();
    await expect(c.page.getByRole("dialog", { name: "Invitations" })).toContainText("No invitations.");
    await shot(c.page, "bell-empty");

    for (const who of [a, b, c]) await who.context.close();
  });
}
