import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";
import { buildDaySnapshot, levelForXp, toLocalDate } from "@training-sanctum/domain";

async function register(page: Page): Promise<string> {
  const email = `e2e-cultivation-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Cultivation E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  return email;
}

/**
 * Seeds one Flashcard with an unlearned Card and one with a learned Card
 * whose two records are due, then drops today's snapshot so the next read
 * rebuilds it from this data.
 */
async function seedWork(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const cls = await prisma.class.create({
    data: {
      color: "LAVENDER",
      name: "IELTS",
      userId: user.id,
      folders: { create: [{ name: "Unsorted", isUnsorted: true, userId: user.id }] },
    },
    include: { folders: true },
  });
  const folderId = cls.folders[0]!.id;
  const fresh = await prisma.flashcard.create({
    data: { name: "Weather idioms", folderId, userId: user.id },
  });
  const freshCard = await prisma.card.create({
    data: {
      term: "drizzle",
      definition: "light rain",
      flashcardId: fresh.id,
      userId: user.id,
      schedulingRecords: {
        create: [
          { direction: "TERM_TO_DEFINITION", nextReviewDate: new Date() },
          { direction: "DEFINITION_TO_TERM", nextReviewDate: new Date() },
        ],
      },
    },
    include: { schedulingRecords: true },
  });
  const old = await prisma.flashcard.create({
    data: { name: "Phrasal verbs", folderId, userId: user.id },
  });
  const then = new Date(Date.now() - 3 * 86_400_000);
  const dueCard = await prisma.card.create({
    data: {
      term: "give up",
      definition: "stop trying",
      flashcardId: old.id,
      userId: user.id,
      schedulingRecords: {
        create: ["TERM_TO_DEFINITION", "DEFINITION_TO_TERM"].map((direction) => ({
          direction: direction as "TERM_TO_DEFINITION" | "DEFINITION_TO_TERM",
          nextReviewDate: new Date(Date.now() - 60_000),
          firstGradedAt: then,
          updatedAt: then,
        })),
      },
    },
    include: { schedulingRecords: true },
  });
  await prisma.cultivationDay.deleteMany({ where: { userId: user.id } });
  return {
    freshIds: freshCard.schedulingRecords.map((r) => r.id),
    dueIds: dueCard.schedulingRecords.map((r) => r.id),
  };
}

const learnedToday = (ids: string[]) =>
  prisma.schedulingRecord.updateMany({
    where: { id: { in: ids } },
    data: { firstGradedAt: new Date(), nextReviewDate: new Date(Date.now() + 86_400_000) },
  });

const reviewedToday = (ids: string[]) =>
  prisma.schedulingRecord.updateMany({
    where: { id: { in: ids } },
    data: { nextReviewDate: new Date(Date.now() + 86_400_000), updatedAt: new Date() },
  });

test("quests: disabled with progress, tick to claim, XP bar and Breakthrough notice", async ({
  page,
}) => {
  const email = await register(page);
  const { freshIds, dueIds } = await seedWork(email);

  await page.goto("/cultivation");
  const main = page.getByRole("main");
  const learn = main.getByRole("checkbox", { name: "Learn 1 Flashcard" });
  const clear = main.getByRole("checkbox", { name: "Clear Review" });
  await expect(learn).toBeDisabled();
  await expect(clear).toBeDisabled();
  await expect(main.getByText("0 / 1 Flashcards")).toBeVisible();
  await expect(main.getByText("2 due left")).toBeVisible();

  // Learning the Flashcard unlocks the quest, and ticking claims it at once.
  await learnedToday(freshIds);
  await page.goto("/cultivation");
  await expect(main.getByText("Done. Tick to claim before the day ends.")).toBeVisible();
  await expect(learn).toBeEnabled();
  await learn.click();
  await expect(learn).toBeChecked();
  await expect(learn).toBeDisabled();
  await expect(main.getByText("Breakthrough: Ngưng Khí · Tầng 2")).toBeVisible();
  // The claim refreshes the XP chart on the same page, without navigating.
  await expect(main.getByText(/, 10 XP on /)).toBeVisible();
  await expect(main.getByRole("progressbar", { name: "Ngưng Khí · Tầng 2" })).toHaveAttribute(
    "aria-valuenow",
    "0"
  );

  // The Empty due-queue state counts claimed over active quests.
  await reviewedToday(dueIds);
  await page.goto("/review");
  const count = page.getByRole("main").getByRole("link", { name: /Today's quests\s*1 \/ 2/ });
  await expect(count).toBeVisible();
  await count.click();
  await expect(page).toHaveURL(/\/cultivation$/);
  await clear.click();
  await expect(clear).toBeChecked();
  await expect(main.getByText("10 / 15 XP")).toBeVisible();

  await page.goto("/review");
  await expect(page.getByRole("main").getByRole("link", { name: /Today's quests\s*2 \/ 2/ })).toBeVisible();
});

test("a failed claim rolls the tick back with an inline error", async ({ page }) => {
  const email = await register(page);
  const { freshIds } = await seedWork(email);
  await page.goto("/cultivation");
  await expect(page.getByText("0 / 1 Flashcards")).toBeVisible();
  await learnedToday(freshIds);
  await page.goto("/cultivation");
  const learn = page.getByRole("checkbox", { name: "Learn 1 Flashcard" });
  await expect(learn).toBeEnabled();
  await page.route("**/api/cultivation/quests/learn-flashcards/claim", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "QUEST_NOT_MET", message: "This quest is not complete yet." } }),
    })
  );
  await learn.click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("This quest is not complete yet.");
  await expect(learn).not.toBeChecked();
});

test("with no work both quests read as skipped and the empty state hides the count", async ({
  page,
}) => {
  await register(page);
  await page.goto("/cultivation");
  await expect(page.getByText("Nothing to do today.")).toHaveCount(2);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.goto("/review");
  await expect(page.getByRole("main").getByText("0 / 10 XP")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /Today's quests/ })).toHaveCount(0);
});

/**
 * Puts the user `xp` XP deep, settled through `n + 1` days ago, with an
 * unclaimed stored snapshot for each of the last `n` days, then settles by
 * reading Cultivation through the page's own session.
 */
async function missDays(page: Page, email: string, n: number, xp: number) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const today = toLocalDate(new Date(), user.timezone).getTime();
  const snapshot = buildDaySnapshot(1, { flashcardsWithUnlearned: 5, dueCount: 5 });
  for (let i = 1; i <= n; i++) {
    const localDay = new Date(today - i * 86_400_000);
    await prisma.cultivationDay.upsert({
      where: { userId_localDay: { userId: user.id, localDay } },
      create: { userId: user.id, localDay, quests: snapshot as never },
      update: { quests: snapshot as never },
    });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      cultivationXp: xp,
      cultivationSettledThrough: new Date(today - (n + 1) * 86_400_000),
    },
  });
  const res = await page.request.get("/api/cultivation");
  expect(res.ok()).toBeTruthy();
}

test("a missed day shows a notice that dismisses and stays dismissed after reload", async ({
  page,
}) => {
  const email = await register(page);
  await missDays(page, email, 1, 100);
  const label = levelForXp(60).label;

  await page.goto("/cultivation");
  const main = page.getByRole("main");
  await expect(
    main.getByText(`2 quests missed, −40 XP. Now ${label}.`)
  ).toBeVisible();
  await expect(main.getByRole("progressbar", { name: label })).toBeVisible();

  await main.getByRole("button", { name: /Dismiss/ }).click();
  await expect(main.getByText(/quests missed/)).toHaveCount(0);
  // The strip is gone, so focus moves to the quests heading, not the body.
  await expect(main.getByRole("heading", { name: "Today's quests" })).toBeFocused();

  await page.reload();
  await expect(main.getByText("Today's quests")).toBeVisible();
  await expect(main.getByText(/quests missed/)).toHaveCount(0);

  // A later run is newer than the watermark and shows again.
  await missDays(page, email, 1, 60);
  await page.reload();
  await expect(main.getByText(/quests missed/)).toHaveCount(1);
});

test("dismissing hides that notice and every older one, and focus stays in place", async ({
  page,
}) => {
  const email = await register(page);
  await missDays(page, email, 1, 9_300);
  await missDays(page, email, 3, 400);
  await missDays(page, email, 1, 150);
  await page.goto("/cultivation");
  const main = page.getByRole("main");
  const notices = main.getByText(/quests missed/);
  await expect(notices).toHaveCount(3);

  // The middle (three-day) notice hides itself and the older one only.
  await main.getByRole("button", { name: /Dismiss/ }).nth(1).click();
  await expect(notices).toHaveCount(1);
  await expect(main.getByText(/6 quests missed/)).toHaveCount(0);
  await expect(main.getByRole("button", { name: /Dismiss/ })).toBeFocused();

  await main.getByRole("button", { name: /Dismiss/ }).click();
  await expect(notices).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Today's quests" })).toBeFocused();

  await page.reload();
  await expect(main.getByRole("heading", { name: "Today's quests" })).toBeVisible();
  await expect(notices).toHaveCount(0);
});

// Visual check: screenshots land in test-results/screenshots for comparison
// against DESIGN.md and history/focus-indigo/mockups/key-screens.html.
for (const theme of ["dark", "light"] as const) {
  for (const width of [1280, 390]) {
    test(`quest list screenshots (${theme}, ${width}px)`, async ({ page }) => {
      mkdirSync("test-results/screenshots", { recursive: true });
      await page.setViewportSize({ width, height: 900 });
      const email = await register(page);
      const setTheme = () =>
        page.evaluate((t) => {
          if (t === "light") document.documentElement.dataset.theme = "light";
          else delete document.documentElement.dataset.theme;
        }, theme);
      const shot = (name: string) =>
        page.screenshot({
          path: `test-results/screenshots/cultivation-${name}-${theme}-${width}.png`,
          animations: "disabled",
        });

      await page.goto("/cultivation");
      await expect(page.getByText("Nothing to do today.")).toHaveCount(2);
      await setTheme();
      await shot("skipped");

      const { freshIds, dueIds } = await seedWork(email);
      await page.goto("/cultivation");
      await expect(page.getByText("2 due left")).toBeVisible();
      await setTheme();
      await shot("locked");

      await learnedToday(freshIds);
      await page.goto("/cultivation");
      await expect(page.getByText("Done. Tick to claim before the day ends.")).toBeVisible();
      await setTheme();
      await shot("ready");

      await page.getByRole("checkbox", { name: "Learn 1 Flashcard" }).click();
      await expect(page.getByText("Breakthrough: Ngưng Khí · Tầng 2")).toBeVisible();
      await expect(page.getByRole("checkbox", { name: "Learn 1 Flashcard" })).toBeChecked();
      await expect(page.getByRole("main").getByText("0 / 15 XP")).toBeVisible();
      await shot("claimed-breakthrough");

      await reviewedToday(dueIds);
      await page.goto("/review");
      await expect(page.getByRole("link", { name: /Today's quests\s*1 \/ 2/ })).toBeVisible();
      await setTheme();
      await shot("empty-state");
    });
  }
}

for (const theme of ["dark", "light"] as const) {
  for (const width of [1280, 390]) {
    test(`missed-day notice screenshots (${theme}, ${width}px)`, async ({ page }) => {
      mkdirSync("test-results/screenshots", { recursive: true });
      await page.setViewportSize({ width, height: 900 });
      const email = await register(page);
      // Oldest first: a demotion, then a three-day range, then one day.
      await missDays(page, email, 1, 9_300);
      await missDays(page, email, 3, 400);
      await missDays(page, email, 1, 150);
      await page.goto("/cultivation");
      await expect(page.getByText(/quests missed/)).toHaveCount(3);
      await page.evaluate((t) => {
        if (t === "light") document.documentElement.dataset.theme = "light";
        else delete document.documentElement.dataset.theme;
      }, theme);
      await page.screenshot({
        path: `test-results/screenshots/cultivation-missed-${theme}-${width}.png`,
        animations: "disabled",
      });
    });
  }
}

// spec-5-4: Realm Ladder and stats sections.
test("the Ladder lists 19 realms and marks the current one", async ({ page }) => {
  const email = await register(page);
  await prisma.user.update({ where: { email }, data: { cultivationXp: 9_275 } }); // Khuy Niết, Nhị Bộ
  await page.goto("/cultivation");
  const ladder = page.getByRole("region", { name: "Realm Ladder" });
  await expect(ladder.getByRole("listitem")).toHaveCount(19);
  const current = ladder.getByRole("listitem").filter({ hasText: "Current" });
  await expect(current).toHaveCount(1);
  await expect(current).toContainText("Khuy Niết");
  await expect(current).toContainText("Khuy Niết · Sơ kỳ");
  await expect(current).toHaveAttribute("aria-current", "step");
  await expect(ladder.getByRole("listitem").first()).toContainText("Reached");
  await expect(ladder.getByRole("listitem").last()).toContainText("Ahead");
  // The fill: full when reached, empty ahead, and at the realm's start for 9,275 XP.
  await expect(ladder.getByRole("listitem").first()).toHaveAttribute("data-fill", "100");
  await expect(ladder.getByRole("listitem").last()).toHaveAttribute("data-fill", "0");
  await expect(current).toHaveAttribute("data-fill", "0");
  // Realm avatars are decorative: no image role carries a name.
  await expect(ladder.getByRole("img")).toHaveCount(0);
  // Each realm is a tab stop.
  await ladder.getByRole("listitem").first().focus();
  await page.keyboard.press("Tab");
  await expect(ladder.getByRole("listitem").nth(1)).toBeFocused();
});

test("the current realm fills to the XP earned across its stages", async ({ page }) => {
  const email = await register(page);
  // Khuy Niết starts at 9,275 XP and costs 4 × 800: one stage in is a quarter.
  await prisma.user.update({ where: { email }, data: { cultivationXp: 9_275 + 800 } });
  await page.goto("/cultivation");
  const ladder = page.getByRole("region", { name: "Realm Ladder" });
  const current = ladder.getByRole("listitem").filter({ hasText: "Current" });
  await expect(current).toContainText("Khuy Niết · Trung kỳ");
  await expect(current).toHaveAttribute("data-fill", "25");
  await expect(current).toContainText("25%");
});

test("the final realm is Current and every other realm is Reached", async ({ page }) => {
  const email = await register(page);
  await prisma.user.update({ where: { email }, data: { cultivationXp: 115_309 } });
  await page.goto("/cultivation");
  const items = page.getByRole("region", { name: "Realm Ladder" }).getByRole("listitem");
  await expect(items.last()).toContainText("Current");
  await expect(items.last()).toContainText("Đạp Thiên Cảnh");
  await expect(items.filter({ hasText: "Reached" })).toHaveCount(18);
  await expect(items.last()).toHaveAttribute("data-fill", "100");
});

test("on a phone the Ladder scrolls sideways and opens on the current realm", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const email = await register(page);
  await prisma.user.update({ where: { email }, data: { cultivationXp: 9_275 } });
  await page.goto("/cultivation");
  const list = page.getByRole("region", { name: "Realm Ladder" }).getByRole("list");
  await expect(list).toBeVisible();
  const scrolls = await list.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(scrolls).toBe(true);
  const current = list.getByRole("listitem").filter({ hasText: "Current" });
  await expect(current).toBeInViewport({ ratio: 0.9 });
  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(pageOverflow).toBe(false);
});

test("totals and intervals show the new grades without a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const email = await register(page);
  const { freshIds } = await seedWork(email);
  await page.goto("/cultivation");
  const main = page.getByRole("main");
  const total = (label: string) => main.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd");
  await expect(total("Learned")).toHaveText("1");
  await expect(total("Unlearned")).toHaveText("1");
  await expect(total("Total")).toHaveText("2");
  await expect(main.getByRole("table", { name: /Term → Definition records by interval/ })).toBeAttached();

  // Grade the fresh Card, then come back through the app (no page reload).
  await learnedToday(freshIds);
  await page.getByRole("link", { name: "Classes", exact: true }).first().click();
  await expect(page).toHaveURL(/\/classes/);
  await page.getByRole("link", { name: "Cultivation" }).first().click();
  await expect(total("Learned")).toHaveText("2");
  await expect(total("Unlearned")).toHaveText("0");
});

test("a new user sees zeros, a flat chart summary and an empty intervals line", async ({ page }) => {
  await register(page);
  await page.goto("/cultivation");
  const main = page.getByRole("main");
  await expect(main.getByText("Add cards to see your intervals.")).toBeVisible();
  await expect(main.getByText("0 XP on", { exact: false }).first()).toBeVisible();
  await expect(main.locator("dt", { hasText: "Total" }).locator("xpath=following-sibling::dd")).toHaveText("0");
});

test("a failed stats load keeps the realm and quests, with Try again", async ({ page }) => {
  await register(page);
  let fail = true;
  await page.route("**/api/stats", (route) =>
    fail
      ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "x" } }) })
      : route.continue()
  );
  await page.goto("/cultivation");
  const main = page.getByRole("main");
  await expect(main.getByText("Could not load your stats.")).toBeVisible();
  await expect(main.getByRole("heading", { name: "Today's quests" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Realm Ladder" })).toBeVisible();
  fail = false;
  await main.getByRole("button", { name: "Try again" }).click();
  await expect(main.getByRole("heading", { name: "Cards" })).toBeVisible();
});

for (const theme of ["dark", "light"] as const) {
  for (const width of [1280, 390]) {
    for (const [name, xp] of [["low", 25], ["high", 20_000]] as const) {
      test(`stats screenshots (${name} realm, ${theme}, ${width}px)`, async ({ page }) => {
        mkdirSync("test-results/screenshots", { recursive: true });
        await page.setViewportSize({ width, height: 900 });
        const email = await register(page);
        const { freshIds } = await seedWork(email);
        await learnedToday(freshIds);
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        const event = (daysAgo: number, delta: number, reason: "CLAIM" | "PENALTY") => ({
          userId: user.id,
          localDay: new Date(Date.now() - daysAgo * 86_400_000),
          questKind: "CLEAR_REVIEW" as const,
          delta,
          reason,
          createdAt: new Date(Date.now() - daysAgo * 86_400_000),
        });
        await prisma.xpEvent.createMany({
          data: [
            event(26, xp / 2, "CLAIM"), event(20, xp / 4, "CLAIM"), event(14, -xp / 5, "PENALTY"),
            event(8, xp / 4, "CLAIM"), event(2, xp / 5, "CLAIM"),
          ].map((e) => ({ ...e, delta: Math.round(e.delta) })),
        });
        await prisma.user.update({ where: { email }, data: { cultivationXp: xp } });
        await page.goto("/cultivation");
        await expect(page.getByRole("heading", { name: "Intervals" })).toBeVisible();
        // The frame ends the page: nothing (such as an sr-only table) may
        // lengthen the document below it.
        const below = await page.evaluate(
          () =>
            document.documentElement.scrollHeight -
            (document.querySelector("main")!.getBoundingClientRect().bottom + window.scrollY)
        );
        expect(below).toBeLessThan(24);
        await page.evaluate((t) => {
          if (t === "light") document.documentElement.dataset.theme = "light";
          else delete document.documentElement.dataset.theme;
        }, theme);
        await page.screenshot({
          path: `test-results/screenshots/cultivation-stats-${name}-${theme}-${width}.png`,
          animations: "disabled",
          fullPage: true,
        });
      });
    }
  }
}
