import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";

async function register(page: Page) {
  const email = `e2e-pomodoro-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Pomodoro User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  return email;
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

/** Adds today's Tasks through the page's own API (the cookies carry the session). */
async function addTasks(page: Page, tasks: Array<{ title: string; estimateMinutes: number }>) {
  return page.evaluate(async (list) => {
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const cat = await (
      await fetch("/api/planner/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Study" }),
      })
    ).json();
    const ids: string[] = [];
    for (const t of list) {
      const res = await fetch("/api/planner/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...t, categoryId: cat.data.id, localDay: day }),
      });
      ids.push((await res.json()).data.id as string);
    }
    return ids;
  }, tasks);
}

/** Moves the running session start into the past, keeping earlier sessions before it. */
async function age(taskId: string, minutes: number) {
  const earlier = await prisma.pomodoroSession.findMany({ where: { taskId, endedAt: { not: null } } });
  for (const e of earlier) {
    await prisma.pomodoroSession.update({
      where: { id: e.id },
      data: { startedAt: new Date(e.startedAt.getTime() - 3_600_000) },
    });
  }
  const s = await prisma.pomodoroSession.findFirstOrThrow({ where: { taskId, endedAt: null } });
  await prisma.pomodoroSession.update({
    where: { id: s.id },
    data: { startedAt: new Date(Date.now() - minutes * 60_000) },
  });
}

test("start, stop early, run out, Done: the plan follows the server", async ({ page }) => {
  const email = await register(page);
  const [taskId] = await addTasks(page, [{ title: "Read chapter 3", estimateMinutes: 40 }]);

  // The Tasks row menu links to the screen.
  await page.goto("/planner");
  await page.getByRole("button", { name: "Options for Read chapter 3" }).click();
  await page.getByRole("menuitem", { name: "Start pomodoro" }).click();
  await page.waitForURL(`**/planner/pomodoro?task=${taskId}`);
  await expect(page.getByRole("list", { name: "Plan" }).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("timer")).toHaveText("25:00");
  await shoot(page, "pomodoro-idle");

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await shoot(page, "pomodoro-running");

  // Ten minutes in, Space stops it: minutes are logged and a break is next.
  await age(taskId!, 10);
  await page.reload();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByText("Break · 5:00")).toBeVisible();

  // The break and the remainder (30 min left) run out on the server.
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await age(taskId!, 6);
  await page.reload();
  await expect(page.getByText("Focus · 25:00")).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await age(taskId!, 26);
  await page.reload();

  // 10 + 25 = 35 logged of 40: a 5-minute remainder is still planned.
  await expect(page.getByText("Break · 5:00")).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await age(taskId!, 6);
  await page.reload();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await age(taskId!, 6);
  await page.reload();

  const heading = page.getByRole("heading", { name: "Done?" });
  await expect(heading).toBeVisible();
  await shoot(page, "pomodoro-done-card");
  await page.keyboard.press("Escape");
  await expect(heading).toBeHidden();
  await page.getByRole("button", { name: "Is this Task done?" }).click();

  await page.getByRole("button", { name: "Not yet" }).click();
  await expect(page.getByRole("button", { name: "+1 session (2 of 2 left)" })).toBeVisible();
  await shoot(page, "pomodoro-not-yet");
  await page.getByRole("button", { name: "+1 session (2 of 2 left)" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await shoot(page, "pomodoro-overrun");
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(heading).toBeVisible();

  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("This Task is done.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeDisabled();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  expect(user.cultivationXp).toBeGreaterThan(0);
  await shoot(page, "pomodoro-task-done");
});

test("a session running on another Task disables Start; a bad task shows the picker", async ({ page }) => {
  await register(page);
  const [a] = await addTasks(page, [
    { title: "Task A", estimateMinutes: 50 },
    { title: "Task B", estimateMinutes: 30 },
  ]);
  await page.goto(`/planner/pomodoro?task=${a}`);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

  await page.goto("/planner/pomodoro");
  await page.getByRole("link", { name: /Task B/ }).click();
  await expect(page.getByText(/A session is running on Task A/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeDisabled();
  await shoot(page, "pomodoro-elsewhere");

  await page.goto("/planner/pomodoro?task=does-not-exist");
  await expect(page.getByText("Choose another.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Task A/ })).toBeVisible();
  await shoot(page, "pomodoro-picker");
});

test("a session ended elsewhere shows on focus; an expired one moves on without a reload", async ({ page }) => {
  await register(page);
  const [taskId] = await addTasks(page, [{ title: "Resync", estimateMinutes: 60 }]);
  await page.clock.install();
  await page.goto(`/planner/pomodoro?task=${taskId}`);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

  // Ended from another client: the page catches up on focus.
  const running = await prisma.pomodoroSession.findFirstOrThrow({ where: { taskId, endedAt: null } });
  await page.request.post(`/api/planner/sessions/${running.id}/end`);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();

  // Expiry: the session passes its planned end while the page stays open.
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await age(taskId!, 26);
  await page.clock.fastForward(26 * 60_000);
  await page.clock.resume();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible({ timeout: 10_000 });
  // The Start button can reappear a beat before the refetched plan swaps the caption to Break.
  await expect(page.getByText(/^Break · /)).toBeVisible({ timeout: 10_000 });
});
