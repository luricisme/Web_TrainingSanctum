import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";
import { levelForXp } from "@training-sanctum/domain";

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

async function seedUser(email: string) {
  const user = await prisma.user.create({
    data: { name: "Seed", email, timezone: "UTC", cultivationXp: 120, disabled: true },
  });
  const klass = await prisma.class.create({ data: { name: "Seed class", color: "MINT", userId: user.id } });
  const folder = await prisma.folder.create({
    data: { name: "Unsorted", isUnsorted: true, classId: klass.id, userId: user.id },
  });
  const flashcard = await prisma.flashcard.create({ data: { name: "Seed set", folderId: folder.id, userId: user.id } });
  const card = await prisma.card.create({
    data: { term: "ephemeral", definition: "short-lived", flashcardId: flashcard.id, userId: user.id },
  });
  await prisma.schedulingRecord.createMany({
    data: [
      {
        cardId: card.id,
        userId: user.id,
        direction: "TERM_TO_DEFINITION",
        interval: 6,
        repetitions: 2,
        easeFactor: 2.36,
        nextReviewDate: new Date("2026-11-16T00:00:00.000Z"),
        firstGradedAt: new Date("2026-11-10T08:30:00.000Z"),
      },
      { cardId: card.id, userId: user.id, direction: "DEFINITION_TO_TERM", nextReviewDate: new Date("2026-11-14T00:00:00.000Z") },
    ],
  });
  await prisma.xpEvent.create({
    data: { userId: user.id, localDay: new Date("2026-11-12"), questKind: "CLEAR_REVIEW", delta: 40, reason: "CLAIM" },
  });
  await prisma.xpEvent.create({
    data: { userId: user.id, localDay: new Date("2026-11-13"), questKind: "LEARN_FLASHCARDS", delta: -20, reason: "PENALTY" },
  });
  await prisma.user.update({ where: { id: user.id }, data: { cultivationSettledThrough: new Date("2026-11-13") } });
  return user;
}

async function openAll(page: Page) {
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
}

// Story 7.3: the read-only user page.
for (const width of [1280, 390]) {
  test(`an admin views a user read-only (${width}px)`, async ({ page }) => {
    const email = `e2e-view-${randomUUID()}@example.test`;
    const user = await seedUser(email);
    try {
      await page.setViewportSize({ width, height: 900 });
      await registerOrLogin(page, ADMIN_EMAIL);
      await page.goto("/admin");
      await page.getByRole("link", { name: email, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/users/${user.id}$`));
      await expect(page.getByText(`Read-only. You are viewing ${email}'s data.`)).toBeVisible();
      await expect(page.getByText("Seed class")).toBeVisible();
      await expect(page.getByText("Unsorted")).toBeHidden();
      await openAll(page);
      await expect(page.getByText("Unsorted")).toBeVisible();
      await expect(page.getByText("ephemeral")).toBeVisible();
      await expect(page.getByRole("region", { name: "Term to definition" })).toContainText("2.36");
      await expect(page.getByRole("region", { name: "Definition to term" })).toContainText("Not graded yet");
      await expect(page.getByRole("heading", { name: "Cultivation" })).toBeVisible();
      await expect(page.getByText("+40 XP")).toBeVisible();
      const cultivation = page.getByRole("region", { name: "Cultivation" });
      await expect(cultivation).toContainText(levelForXp(120).label);
      await expect(cultivation).toContainText("120");
      await expect(cultivation).toContainText("Nov 13, 2026");
      const events = cultivation.locator("ul > li");
      await expect(events).toHaveCount(2);
      await expect(events.nth(0)).toContainText("Missed day");
      await expect(events.nth(0)).toContainText("-20 XP");
      await expect(events.nth(1)).toContainText("Claimed");
      await expect(events.nth(1)).toContainText("+40 XP");
      const t2d = page.getByRole("region", { name: "Term to definition" });
      await expect(t2d).toContainText("6 d");
      await expect(t2d).toContainText("Nov 16, 2026");
      await expect(t2d).toContainText("Nov 10, 2026, 08:30 UTC");
      await expect(page.getByText("1 Folder")).toBeVisible();
      await expect(page.getByText("1 Card", { exact: true })).toBeVisible();
      await expect(page.getByText("Timezone UTC.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Export", exact: true })).toHaveAttribute(
        "href",
        `/api/admin/users/${user.id}/export`
      );
      // Story 5.3: Restore (a button plus its hidden file input) is the only control besides Export.
      // Story 7.4 adds Disable (or Enable, for a disabled account).
      const buttons = await page.locator("main button").allTextContents();
      expect(buttons[0]).toBe("Restore");
      // Story 7.5 adds Reset password.
      // Story 7.6 adds Delete.
      expect(buttons.slice(1)).toHaveLength(3);
      expect(buttons[1]).toMatch(/^(Disable|Enable)$/);
      expect(buttons[2]).toBe("Reset password");
      expect(buttons[3]).toBe("Delete");
      expect(await page.locator("main input:not([type=file]), main textarea, main select").count()).toBe(0);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow).toBe(false);

      mkdirSync("test-results/screenshots", { recursive: true });
      for (const theme of ["dark", "light"] as const) {
        await page.evaluate((t) => {
          if (t === "light") document.documentElement.dataset.theme = "light";
          else delete document.documentElement.dataset.theme;
        }, theme);
        await page.screenshot({
          path: `test-results/screenshots/admin-user-view-${theme}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
    } finally {
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  });
}

test("the Export link downloads the backup", async ({ page }) => {
  const user = await seedUser(`e2e-view-${randomUUID()}@example.test`);
  try {
    await registerOrLogin(page, ADMIN_EMAIL);
    await page.goto(`/admin/users/${user.id}`);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Export", exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("a normal user gets 404 for an existing user, and anonymous goes to login", async ({ page, browser }) => {
  const user = await seedUser(`e2e-view-${randomUUID()}@example.test`);
  try {
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    // The app-wide proxy sends cookie-less visitors to /login before the page runs.
    await anonPage.goto(`/admin/users/${user.id}`);
    await expect(anonPage).toHaveURL(/\/login$/);
    await expect(anonPage.getByText("ephemeral")).toHaveCount(0);
    await anon.close();

    await registerOrLogin(page, `e2e-plain-${randomUUID()}@example.test`);
    const response = await page.goto(`/admin/users/${user.id}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByText("ephemeral")).toHaveCount(0);
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("an empty account shows the banner and an empty state", async ({ page }) => {
  const email = `e2e-empty-${randomUUID()}@example.test`;
  const user = await prisma.user.create({ data: { name: "Empty", email, timezone: "UTC" } });
  try {
    await registerOrLogin(page, ADMIN_EMAIL);
    await page.goto(`/admin/users/${user.id}`);
    await expect(page.getByText(`Read-only. You are viewing ${email}'s data.`)).toBeVisible();
    await expect(page.getByText("No Classes yet.")).toBeVisible();
    await expect(page.getByText("No XP events yet.")).toBeVisible();
    await expect(page.getByText("Not settled yet")).toBeVisible();
    const cultivation = page.getByRole("region", { name: "Cultivation" });
    await expect(cultivation).toContainText(levelForXp(0).label);
    await expect(cultivation).toContainText("0");
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("an admin can view their own page", async ({ page }) => {
  await registerOrLogin(page, ADMIN_EMAIL);
  const me = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  await page.goto(`/admin/users/${me.id}`);
  await expect(page.getByText(`Read-only. You are viewing ${ADMIN_EMAIL}'s data.`)).toBeVisible();
});

test("the page shows only the target user's data", async ({ page }) => {
  const ids: string[] = [];
  try {
    const a = await seedUser(`e2e-view-${randomUUID()}@example.test`);
    ids.push(a.id);
    const other = await seedUser(`e2e-view-${randomUUID()}@example.test`);
    ids.push(other.id);
    await prisma.card.updateMany({ where: { userId: other.id }, data: { term: "other-users-secret" } });
    await registerOrLogin(page, ADMIN_EMAIL);
    await page.goto(`/admin/users/${a.id}`);
    await openAll(page);
    await expect(page.getByText("ephemeral")).toBeVisible();
    await expect(page.getByText("other-users-secret")).toHaveCount(0);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
});

test("the cultivation summary renders a Planner XP event with no quest kind", async ({ page }) => {
  const user = await seedUser(`e2e-view-${randomUUID()}@example.test`);
  try {
    await prisma.xpEvent.create({
      data: { userId: user.id, localDay: new Date("2026-11-14"), questKind: null, delta: 5, reason: "TASK_DONE" },
    });
    await registerOrLogin(page, ADMIN_EMAIL);
    await page.goto(`/admin/users/${user.id}`);
    const events = page.getByRole("region", { name: "Cultivation" }).locator("ul > li");
    await expect(events).toHaveCount(3);
    const row = events.filter({ hasText: "Task done" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("+5 XP");
    await expect(row).not.toContainText("undefined");
    await expect(row).not.toContainText("·");
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("an admin gets 404 for an unknown or over-long id", async ({ page }) => {
  await registerOrLogin(page, ADMIN_EMAIL);
  expect((await page.goto(`/admin/users/${randomUUID()}`))?.status()).toBe(404);
  expect((await page.goto(`/admin/users/${"x".repeat(300)}`))?.status()).toBe(404);
});

// Story 12.5: member counts and the shared-classes line.
test("the admin view shows member counts and shared-class membership", async ({ page }) => {
  const owner = await seedUser(`e2e-share-own-${randomUUID()}@example.test`);
  const m1 = await prisma.user.create({ data: { name: "M1", email: `e2e-m1-${randomUUID()}@example.test`, timezone: "UTC" } });
  const m2 = await prisma.user.create({ data: { name: "M2", email: `e2e-m2-${randomUUID()}@example.test`, timezone: "UTC" } });
  try {
    const klass = await prisma.class.findFirstOrThrow({ where: { userId: owner.id } });
    await prisma.classMember.createMany({
      data: [
        { classId: klass.id, userId: m1.id },
        { classId: klass.id, userId: m2.id },
      ],
    });
    const hostClass = await prisma.class.create({ data: { name: "Host", color: "SKY", userId: owner.id } });
    await prisma.classMember.create({ data: { classId: hostClass.id, userId: m1.id } });
    await registerOrLogin(page, ADMIN_EMAIL);
    await page.goto(`/admin/users/${owner.id}`);
    await expect(page.getByText("2 members · 1 Folder")).toBeVisible();
    mkdirSync("test-results/screenshots", { recursive: true });
    for (const theme of ["dark", "light"] as const) {
      await page.evaluate((t) => {
        if (t === "light") document.documentElement.dataset.theme = "light";
        else delete document.documentElement.dataset.theme;
      }, theme);
      await page.screenshot({ path: `test-results/screenshots/admin-members-${theme}.png`, animations: "disabled" });
    }
    await page.goto(`/admin/users/${m1.id}`);
    await expect(page.getByText("Member of 2 shared classes")).toBeVisible();
    await page.goto(`/admin/users/${m2.id}`);
    await expect(page.getByText("Member of 1 shared class")).toBeVisible();
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, m1.id, m2.id] } } });
  }
});
