import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const ADMIN_EMAIL = "admin-e2e@example.test";

async function registerOrLogin(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Admin E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  try {
    await page.waitForURL("/review", { timeout: 8000 });
  } catch {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/review");
  }
}

async function seedUser(email: string, term: string) {
  const user = await prisma.user.create({ data: { name: "Seed", email, timezone: "UTC", cultivationXp: 60 } });
  const klass = await prisma.class.create({ data: { name: "Seed class", color: "MINT", userId: user.id } });
  const folder = await prisma.folder.create({
    data: { name: "Unsorted", isUnsorted: true, classId: klass.id, userId: user.id },
  });
  const flashcard = await prisma.flashcard.create({ data: { name: "Seed set", folderId: folder.id, userId: user.id } });
  const card = await prisma.card.create({
    data: { term, definition: "short-lived", flashcardId: flashcard.id, userId: user.id },
  });
  await prisma.schedulingRecord.createMany({
    data: [
      { cardId: card.id, userId: user.id, direction: "TERM_TO_DEFINITION", nextReviewDate: new Date("2026-11-16T00:00:00.000Z") },
      { cardId: card.id, userId: user.id, direction: "DEFINITION_TO_TERM", nextReviewDate: new Date("2026-11-14T00:00:00.000Z") },
    ],
  });
  return user;
}

async function backupOf(page: Page, userId: string) {
  const res = await page.request.get(`/api/admin/users/${userId}/export`);
  expect(res.status()).toBe(200);
  return res.text();
}

test("an admin restores a backup through the confirmation modal", async ({ page }) => {
  const source = await seedUser(`e2e-restore-src-${randomUUID()}@example.test`, "restored-term");
  const targetEmail = `e2e-restore-dst-${randomUUID()}@example.test`;
  const target = await seedUser(targetEmail, "original-term");
  try {
    await registerOrLogin(page, ADMIN_EMAIL);
    const file = await backupOf(page, source.id);
    await page.goto(`/admin/users/${target.id}`);
    const buffer = { name: "backup.json", mimeType: "application/json", buffer: Buffer.from(file) };

    // A file that is not a backup: no modal, a message.
    await page.getByLabel("Backup file").setInputFiles({ ...buffer, buffer: Buffer.from('{"hello":1}') });
    await expect(page.getByText("This is not a Training Sanctum backup.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Cancel sends nothing.
    await page.getByLabel("Backup file").setInputFiles(buffer);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(targetEmail);
    await expect(dialog).toContainText(source.email);
    await expect(dialog).toContainText("replace all of");
    await expect(dialog.getByRole("textbox")).toHaveCount(0);

    mkdirSync("test-results/screenshots", { recursive: true });
    for (const theme of ["dark", "light"] as const) {
      await page.evaluate((t) => {
        if (t === "light") document.documentElement.dataset.theme = "light";
        else delete document.documentElement.dataset.theme;
      }, theme);
      await page.screenshot({
        path: `test-results/screenshots/admin-restore-modal-${theme}.png`,
        animations: "disabled",
      });
    }

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    expect((await prisma.card.findFirstOrThrow({ where: { userId: target.id } })).term).toBe("original-term");

    // Confirm restores and the page shows it.
    await page.getByLabel("Backup file").setInputFiles(buffer);
    await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Restored.", { exact: false })).toBeVisible();
    // router.refresh() lands after the status text: wait for the new rows before opening the tree.
    await expect(page.getByText("restored-term")).toBeAttached();
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    await expect(page.getByText("restored-term")).toBeVisible();
    await expect(page.getByText("original-term")).toHaveCount(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).email).toBe(targetEmail);

    for (const theme of ["dark", "light"] as const) {
      await page.evaluate((t) => {
        if (t === "light") document.documentElement.dataset.theme = "light";
        else delete document.documentElement.dataset.theme;
      }, theme);
      await page.screenshot({
        path: `test-results/screenshots/admin-restore-done-${theme}.png`,
        animations: "disabled",
      });
    }
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [source.id, target.id] } } });
  }
});

test("the restore control fits at 390px and is keyboard reachable", async ({ page }) => {
  const user = await seedUser(`e2e-restore-mob-${randomUUID()}@example.test`, "mobile-term");
  try {
    await page.setViewportSize({ width: 390, height: 800 });
    await registerOrLogin(page, ADMIN_EMAIL);
    const file = await backupOf(page, user.id);
    await page.goto(`/admin/users/${user.id}`);
    await page.getByRole("button", { name: "Restore" }).focus();
    await expect(page.getByRole("button", { name: "Restore" })).toBeFocused();
    await page.getByLabel("Backup file").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(file),
    });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
    await page.screenshot({ path: "test-results/screenshots/admin-restore-modal-390.png", animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("the modal shows a server failure and stays open; broken links never reach the modal", async ({ page }) => {
  const user = await seedUser(`e2e-restore-fail-${randomUUID()}@example.test`, "kept-term");
  try {
    await registerOrLogin(page, ADMIN_EMAIL);
    const backup = JSON.parse(await backupOf(page, user.id));
    await page.goto(`/admin/users/${user.id}`);
    const upload = (data: unknown) =>
      page.getByLabel("Backup file").setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data)),
      });

    const broken = structuredClone(backup);
    broken.cards[0].flashcardId = "missing";
    await upload(broken);
    await expect(page.getByText("This backup is inconsistent:")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    backup.cards[0].term = "bad\u0000term";
    await upload(backup);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Nothing was changed");
    await expect(dialog).toBeVisible();
    expect((await prisma.card.findFirstOrThrow({ where: { userId: user.id } })).term).toBe("kept-term");
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
