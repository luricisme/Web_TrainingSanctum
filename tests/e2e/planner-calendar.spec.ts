import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

async function register(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Planner Calendar");
  await page.getByLabel("Email").fill(`e2e-planner-cal-${randomUUID()}@example.test`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
}

async function shoot(page: Page, name: string) {
  mkdirSync("test-results/screenshots", { recursive: true });
  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((t) => {
      if (t === "light") document.documentElement.dataset.theme = "light";
      else delete document.documentElement.dataset.theme;
    }, theme);
    await page.screenshot({
      path: `test-results/screenshots/${name}-${theme}.png`,
      animations: "disabled",
    });
  }
}

type Seed = { title: string; estimateMinutes: number; startTime?: string; offset?: number; done?: boolean };

/** Adds Tasks on the browser's today (plus an optional day offset) through the page's own API. */
async function addTasks(page: Page, tasks: Seed[]) {
  await page.evaluate(async (list) => {
    const post = async (url: string, body: unknown) =>
      (await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })).json();
    const cats = ["Study", "Work", "Rest"];
    const ids: string[] = [];
    for (const name of cats) ids.push((await post("/api/planner/categories", { name })).data.id);
    let i = 0;
    for (const t of list) {
      const d = new Date();
      d.setDate(d.getDate() + (t.offset ?? 0));
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const created = await post("/api/planner/tasks", {
        title: t.title,
        estimateMinutes: t.estimateMinutes,
        startTime: t.startTime,
        categoryId: ids[i % ids.length],
        localDay: day,
      });
      if (t.done) await post(`/api/planner/tasks/${created.data.id}/done`, {});
      i += 1;
    }
  }, tasks);
}

test("calendar: blocks of plan length, conflicts, tray, keyboard and mobile day", async ({ page }) => {
  await register(page);
  await page.goto("/planner");
  await addTasks(page, [
    { title: "Read chapter 3", estimateMinutes: 90, startTime: "19:00" },
    { title: "Mock test", estimateMinutes: 60, startTime: "20:00" },
    { title: "Walk", estimateMinutes: 25, startTime: "07:00" },
    { title: "Plan the week", estimateMinutes: 30 },
    { title: "Done block", estimateMinutes: 25, startTime: "08:00", done: true },
    { title: "Done chip", estimateMinutes: 25, done: true },
    // Past midnight; on a Sunday move it a day back so the next day is still in this week.
    { title: "Late work", estimateMinutes: 90, startTime: "23:00", offset: new Date().getDay() === 0 ? -1 : 0 },
  ]);

  await page.getByRole("radio", { name: "Calendar" }).click();
  await page.waitForURL("/planner/calendar");

  const read = page.getByRole("group", { name: /^Read chapter 3, [A-Za-z]+ \d+ [A-Za-z]+, 19:00 to 20:45, 105 minutes, Study/ });
  await expect(read).toBeVisible();
  await expect(read).toContainText("105 min");
  await expect(read).toContainText("Conflict");
  await expect(read).toHaveAttribute("data-conflict", "true");
  const mock = page.getByRole("group", { name: /^Mock test, [A-Za-z]+ \d+ [A-Za-z]+, 20:00 to 21:10, 70 minutes, Work, conflict/ });
  await expect(mock).toContainText("Conflict");
  const walk = page.getByRole("group", { name: /^Walk, [A-Za-z]+ \d+ [A-Za-z]+, 07:00 to 07:25/ });
  await expect(walk).not.toContainText("Conflict");

  // The conflict border is a 2px error line, not the tint border (cascade check).
  await expect(read).toHaveCSS("border-top-width", "2px");
  const conflictColor = await read.evaluate((el) => getComputedStyle(el).borderTopColor);
  const plainColor = await walk.evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(conflictColor).not.toBe(plainColor);

  // Side by side: equal widths, no horizontal overlap.
  const a = (await read.boundingBox())!;
  const b = (await mock.boundingBox())!;
  expect(Math.abs(a.width - b.width)).toBeLessThan(2);
  expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1);

  // Length and position follow the plan: 105 vs 70 minutes, 60 minutes apart.
  expect(a.height / b.height).toBeGreaterThan(1.4);
  expect(a.height / b.height).toBeLessThan(1.6);
  expect((b.y - a.y) / a.height).toBeGreaterThan(0.5);
  expect((b.y - a.y) / a.height).toBeLessThan(0.65);

  // Done: half opacity and "done" in the label, block and chip alike.
  const doneBlock = page.getByRole("group", { name: /^Done block, .*, done$/ });
  await expect(doneBlock).toHaveCSS("opacity", "0.5");
  const doneChip = page.getByRole("group", { name: /^Done chip, .*, no start time, .*, done$/ });
  await expect(doneChip).toHaveCSS("opacity", "0.5");

  // Past midnight: the block continues into the next day column.
  const late = page.getByRole("group", { name: /^Late work, .*23:00 to 24:00/ });
  await expect(late).toHaveCount(1);
  const cont = page.getByRole("group", { name: /^Late work, .*continued from the day before until 00:45/ });
  await expect(cont).toHaveCount(1);
  await expect(cont).toContainText("continues, 45 min");

  // The tray holds the timeless Task, no block.
  const chip = page.getByRole("group", { name: /^Plan the week, [A-Za-z]+ \d+ [A-Za-z]+, no start time/ });
  await expect(chip).toBeVisible();
  await expect(page.getByTestId("calendar-block")).toHaveCount(6);
  await expect(page.getByTestId("now-line")).toHaveCount(1);

  // Keyboard: Tab reaches the tray chip and the blocks.
  await chip.focus();
  await expect(chip).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(doneChip).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("calendar-block").first()).toBeFocused();

  await page.getByTestId("calendar-scroller").evaluate((el) => {
    el.scrollTop = (el.querySelector<HTMLElement>("[data-grid-body]")!.offsetHeight / 24) * 17.5;
  });
  await page.getByTestId("calendar-scroller").evaluate((el) => el.scrollIntoView({ block: "end" }));
  await shoot(page, "planner-calendar-week");

  // Week navigation and the empty week.
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByText("Nothing planned this week.")).toBeVisible();
  await expect(page.getByTestId("calendar-block")).toHaveCount(0);
  await page.getByRole("button", { name: "Today" }).click();
  await expect(read).toBeVisible();
});

test("calendar below 640px: one day with arrows and a chip row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page);
  await page.goto("/planner");
  await addTasks(page, [
    { title: "Read chapter 3", estimateMinutes: 90, startTime: "19:00" },
    { title: "Plan the week", estimateMinutes: 30 },
    { title: "Tomorrow task", estimateMinutes: 25, startTime: "10:00", offset: 1 },
  ]);
  await page.goto("/planner/calendar");

  await expect(page.getByRole("group", { name: /^Read chapter 3/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /^Plan the week/ })).toBeVisible();
  await expect(page.locator("[data-day-column]:visible")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Next week" })).toBeHidden();
  await shoot(page, "planner-calendar-mobile");

  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByRole("group", { name: /^Tomorrow task/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /^Read chapter 3/ })).toBeHidden();
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page.getByRole("group", { name: /^Read chapter 3/ })).toBeVisible();
});
