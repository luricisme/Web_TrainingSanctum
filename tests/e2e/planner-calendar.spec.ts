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

// spec-10-2: drag and keyboard rescheduling.
const dayOf = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// The other day is the next day, or the day before on a Sunday, so both sit in one Monday-to-Sunday week.
const OTHER = new Date().getDay() === 0 ? -1 : 1;

/** Scrolls the grid so `minute` is mid-view, then returns the viewport point of (day, minute). */
async function slotPoint(page: Page, day: string, minute: number, grabY = 0) {
  await page.getByTestId("calendar-scroller").evaluate((el, m) => {
    const body = el.querySelector<HTMLElement>("[data-grid-body]")!;
    el.scrollTop = (body.offsetHeight / 1440) * m - el.clientHeight / 2;
    el.scrollIntoView({ block: "center" });
  }, minute);
  const box = (await page.locator(`[data-day-column="${day}"]`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + (box.height * minute) / 1440 + grabY };
}

async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

async function centre(locator: ReturnType<Page["locator"]>) {
  const b = (await locator.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + 6 };
}

test("calendar drag: block to a new time and day, chip to grid, block to tray, rollback", async ({ page }) => {
  await register(page);
  await page.goto("/planner");
  await addTasks(page, [
    { title: "Read", estimateMinutes: 25, startTime: "19:00" },
    { title: "Plan", estimateMinutes: 25 },
    { title: "Finished", estimateMinutes: 25, startTime: "08:00", done: true },
  ]);
  await page.goto("/planner/calendar");
  const today = dayOf(0);
  const other = dayOf(OTHER);
  const patches: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH") patches.push(r.postData() ?? "");
  });

  // Block to the other day at 20:07 -> 20:00, optimistic and persistent.
  const read = page.getByRole("group", { name: /^Read, / });
  const to = await slotPoint(page, other, 20 * 60 + 7, 6);
  const from = await centre(read);
  await dragTo(page, from, to);
  await expect(page.getByRole("group", { name: /^Read, .*20:00 to 20:25/ })).toBeVisible();
  await expect.poll(() => patches.length).toBe(1);
  expect(JSON.parse(patches[0]!)).toEqual({ localDay: other, startTime: "20:00" });
  await page.reload();
  await expect(page.getByRole("group", { name: /^Read, .*20:00 to 20:25/ })).toBeVisible();

  // Same place and a drop outside: no PATCH.
  await slotPoint(page, other, 20 * 60);
  const placed = page.getByRole("group", { name: /^Read, / });
  const here = await centre(placed);
  await dragTo(page, here, { x: here.x, y: here.y + 1 });
  await dragTo(page, here, { x: 2, y: 2 });
  await page.waitForTimeout(200);
  expect(patches).toHaveLength(1);

  // A done block never moves.
  const doneTo = await slotPoint(page, today, 12 * 60);
  const done = page.getByRole("group", { name: /^Finished, .*done$/ });
  const doneAt = await centre(done);
  await dragTo(page, doneAt, doneTo);
  await expect(page.getByRole("group", { name: /^Finished, .*08:00 to/ })).toBeVisible();
  expect(patches).toHaveLength(1);

  // Tray chip to the grid at 09:20 -> 09:15.
  const chip = page.getByRole("group", { name: /^Plan, .*no start time/ });
  const chipTo = await slotPoint(page, other, 9 * 60 + 20);
  const chipFrom = await chip.boundingBox();
  await dragTo(page, { x: chipFrom!.x + 10, y: chipFrom!.y + 6 }, chipTo);
  await expect(page.getByRole("group", { name: /^Plan, .*09:15 to 09:40/ })).toBeVisible();
  await expect.poll(() => patches.length).toBe(2);
  expect(JSON.parse(patches[1]!)).toEqual({ localDay: other, startTime: "09:15" });

  // Block to the tray clears the start.
  await slotPoint(page, other, 9 * 60 + 15);
  const plan = page.getByRole("group", { name: /^Plan, .*09:15/ });
  const planAt = await centre(plan);
  const tray = (await page.locator(`[data-tray="${today}"]`).boundingBox())!;
  await dragTo(page, planAt, { x: tray.x + tray.width / 2, y: tray.y + tray.height / 2 });
  await expect(page.getByRole("group", { name: /^Plan, .*no start time/ })).toBeVisible();
  expect(JSON.parse(patches[2]!)).toEqual({ localDay: today, startTime: null });

  // A failed save puts the block back and shows an alert.
  await page.route("**/api/planner/tasks/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "X", message: "no" } }) })
      : route.continue()
  );
  const againTo = await slotPoint(page, other, 21 * 60);
  const again = page.getByRole("group", { name: /^Read, .*20:00 to/ });
  const src = await centre(again);
  await page.mouse.move(src.x, src.y);
  await page.mouse.down();
  await page.mouse.move(src.x + 8, src.y + 8, { steps: 3 });
  await page.mouse.move(againTo.x, againTo.y, { steps: 10 });
  await expect(page.getByTestId("move-ghost")).toContainText("21:00");
  await shoot(page, "planner-calendar-dragging");
  await page.mouse.up();
  await expect(page.getByRole("alert").filter({ hasText: "Could not move" })).toContainText(/Could not move Read\. Try again\./);
  await expect(page.getByRole("group", { name: /^Read, .*20:00 to 20:25/ })).toBeVisible();
  await shoot(page, "planner-calendar-drag");
});

test("calendar keyboard: select, move by 15 minutes and a day, Esc restores", async ({ page }) => {
  await register(page);
  await page.goto("/planner");
  await addTasks(page, [{ title: "Read", estimateMinutes: 25, startTime: "19:00" }]);
  await page.goto("/planner/calendar");
  const other = dayOf(OTHER);
  // ArrowRight, or ArrowLeft on a Sunday when the other day is the day before.
  const step = OTHER === 1 ? "ArrowRight" : "ArrowLeft";
  const patches: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH") patches.push(r.postData() ?? "");
  });

  const block = page.getByRole("group", { name: /^Read, / });
  await block.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press(step);
  const otherName = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(`${other}T00:00:00Z`));
  await expect(page.locator("[aria-live=polite].sr-only")).toContainText(`Moving Read: ${otherName} 19:30`);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: /^Read, .*19:00 to 19:25/ })).toBeVisible();
  expect(patches).toHaveLength(0);

  await block.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press(step);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: /^Read, .*19:30 to 19:55/ })).toBeFocused();
  expect(JSON.parse(patches[0]!)).toEqual({ localDay: other, startTime: "19:30" });
});

test("calendar: no drag under 4px, Esc cancels a drag, continuation blocks stay put", async ({ page }) => {
  await register(page);
  await page.goto("/planner");
  const late = new Date().getDay() === 0 ? -1 : 0;
  await addTasks(page, [
    { title: "Read", estimateMinutes: 25, startTime: "19:00" },
    { title: "Late", estimateMinutes: 90, startTime: "23:30", offset: late },
  ]);
  await page.goto("/planner/calendar");
  const patches: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH") patches.push(r.postData() ?? "");
  });

  // 2px of movement is a click: no lift, no PATCH.
  const to = await slotPoint(page, dayOf(OTHER), 21 * 60);
  const read = page.getByRole("group", { name: /^Read, / });
  const at = await centre(read);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 2, at.y, { steps: 2 });
  await expect(read).toHaveCSS("position", "absolute");
  await page.mouse.up();
  expect(patches).toHaveLength(0);

  // Escape mid-drag, then release: nothing saved, block where it was.
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(read).toHaveCSS("position", "fixed");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(read).toHaveCSS("position", "absolute");
  await expect(page.getByRole("group", { name: /^Read, .*19:00 to 19:25/ })).toBeVisible();
  expect(patches).toHaveLength(0);

  // The next-day continuation of the 23:30 task is neither draggable nor keyable.
  const cont = page.getByRole("group", { name: /^Late, .*continued from the day before/ });
  await slotPoint(page, dayOf(late + 1), 30);
  const c = await centre(cont);
  await dragTo(page, c, to);
  await cont.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("[aria-live=polite].sr-only")).not.toContainText("Moving Late");
  await expect(cont).toBeVisible();
  expect(patches).toHaveLength(0);
});
