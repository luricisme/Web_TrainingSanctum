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
  // Run it 3 minutes first so it logs real focus time (a 0-minute session is a different path).
  await age(taskId!, 3);
  const running = await prisma.pomodoroSession.findFirstOrThrow({ where: { taskId, endedAt: null } });
  await page.request.post(`/api/planner/sessions/${running.id}/end`);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  // Wait for the refetched plan (a break follows a focus) so the next Start is deterministic.
  await expect(page.getByText(/^Break · /)).toBeVisible({ timeout: 10_000 });

  // Expiry: the break passes its planned end while the page stays open.
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await age(taskId!, 26);
  await page.clock.fastForward(26 * 60_000);
  await page.clock.resume();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible({ timeout: 10_000 });
  // After a break the plan moves on to the next focus session.
  await expect(page.getByText(/^Focus · /)).toBeVisible({ timeout: 10_000 });
});

// ---- Story 11.3: music player ----

const TRACKS = [
  { id: "1204", title: "Slow Rain", artist: "Marlow", licence: "CC BY-NC-SA 3.0", licenceUrl: "https://creativecommons.org/licenses/by-nc-sa/3.0/", shareUrl: "https://example.test/t/1204", streamUrl: "https://example.test/1204.mp3", duration: 180 },
  { id: "1205", title: "Paper Lanterns", artist: "Ode", licence: "CC BY 3.0", licenceUrl: "https://creativecommons.org/licenses/by/3.0/", shareUrl: "https://example.test/t/1205", streamUrl: "https://example.test/1205.mp3", duration: 200 },
];

/** Two seconds of silent 8 kHz mono PCM: the smallest thing an <audio> element will really play. */
function silentWav(): Buffer {
  const samples = 16000;
  const buf = Buffer.alloc(44 + samples);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(8000, 24);
  buf.writeUInt32LE(8000, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples, 40);
  buf.fill(128, 44);
  return buf;
}

async function stubMusic(page: Page, state: { down: boolean } = { down: false }) {
  await page.route("**/*.mp3", (route) =>
    route.fulfill({ body: silentWav(), contentType: "audio/wav" })
  );
  await page.route("**/api/planner/music/**", async (route) => {
    const url = new URL(route.request().url());
    if (state.down) {
      await route.fulfill({ status: 502, json: { error: { code: "MUSIC_UNAVAILABLE", message: "Music is unavailable right now." } } });
    } else if (url.pathname.endsWith("/search")) {
      await route.fulfill({ json: { data: TRACKS } });
    } else {
      const track = TRACKS.find((t) => url.pathname.endsWith(`/${t.id}`));
      await route.fulfill(track ? { json: { data: track } } : { status: 404, json: { error: { code: "NOT_FOUND", message: "x" } } });
    }
  });
}

const audioState = (page: Page) =>
  page.evaluate(() => {
    const a = document.querySelector("audio");
    return a ? { paused: a.paused, src: a.getAttribute("src"), volume: a.volume } : null;
  });

async function setCategoryTrack(page: Page, trackId: string) {
  await page.evaluate(async (id) => {
    const cats = (await (await fetch("/api/planner/categories")).json()).data as Array<{ id: string }>;
    await fetch(`/api/planner/categories/${cats[0]!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ musicTrack: { source: "jamendo", trackId: id } }),
    });
  }, trackId);
}

test("music player: plays on Start, pauses, Change saves the Task override only, None falls back", async ({ page }) => {
  await stubMusic(page);
  await register(page);
  const [taskId] = await addTasks(page, [{ title: "Read with music", estimateMinutes: 50 }]);
  await setCategoryTrack(page, "1204");

  await page.goto(`/planner/pomodoro?task=${taskId}`);
  const strip = page.getByRole("region", { name: "Music" });
  await expect(strip.getByText("Slow Rain")).toBeVisible();
  await expect(strip.getByRole("link", { name: "CC BY-NC-SA 3.0" })).toBeVisible();
  // Idle: nothing plays.
  expect((await audioState(page))?.paused).toBe(true);

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect.poll(async () => (await audioState(page))?.paused).toBe(false);
  await expect.poll(async () => (await audioState(page))?.volume ?? 0).toBeGreaterThan(0.3);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shoot(page, "pomodoro-music-playing");

  await strip.getByRole("button", { name: "Pause" }).click();
  await expect.poll(async () => (await audioState(page))?.paused).toBe(true);
  await strip.getByRole("button", { name: "Play" }).click();
  await expect.poll(async () => (await audioState(page))?.paused).toBe(false);

  // Volume is remembered.
  await strip.getByLabel("Volume").fill("0.25");
  expect(await page.evaluate(() => window.localStorage.getItem("planner.music.volume"))).toBe("0.25");

  // Change mid-focus: saved on the Task, the Category keeps its track, the new track plays.
  await strip.getByRole("button", { name: "Change" }).click();
  await strip.getByLabel("Search tracks").fill("lanterns");
  await strip.getByLabel("Search tracks").press("Enter");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shoot(page, "pomodoro-music-change");
  await strip.getByRole("button", { name: /Paper Lanterns/ }).click();
  await expect(strip.getByText("Paper Lanterns")).toBeVisible();
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId! }, include: { category: true } });
  expect(task.musicTrack).toEqual({ source: "jamendo", trackId: "1205" });
  expect(task.category.musicTrack).toEqual({ source: "jamendo", trackId: "1204" });
  await expect.poll(async () => (await audioState(page))?.src).toBe("https://example.test/1205.mp3");
  await expect.poll(async () => (await audioState(page))?.paused).toBe(false);

  // Stop fades out, then pauses.
  await page.getByRole("button", { name: "Stop" }).click();
  await expect.poll(async () => (await audioState(page))?.paused, { timeout: 8_000 }).toBe(true);

  // None clears the override; the Category's track shows again.
  await strip.getByRole("button", { name: "Change" }).click();
  await strip.getByRole("button", { name: "None" }).click();
  await expect(strip.getByText("Slow Rain")).toBeVisible();
  const cleared = await prisma.task.findUniqueOrThrow({ where: { id: taskId! } });
  expect(cleared.musicTrack).toBeNull();
});

test("music player: no track anywhere reads No music; Jamendo down shows one line and the timer runs", async ({ page }) => {
  const state = { down: false };
  await stubMusic(page, state);
  await register(page);
  const [taskId] = await addTasks(page, [{ title: "Quiet task", estimateMinutes: 50 }]);

  await page.goto(`/planner/pomodoro?task=${taskId}`);
  const strip = page.getByRole("region", { name: "Music" });
  await expect(strip.getByText("No music")).toBeVisible();
  await expect(strip.getByRole("button", { name: "Choose a track" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shoot(page, "pomodoro-music-none");

  await setCategoryTrack(page, "1204");
  state.down = true;
  await page.reload();
  await expect(strip.getByText("Music unavailable — the timer continues.")).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText(/^2[45]:\d\d$/);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shoot(page, "pomodoro-music-unavailable");
});

test("music player: fades in (not instant), is silent in a break, and pauses when the session ends", async ({ page }) => {
  await stubMusic(page);
  await register(page);
  const [taskId] = await addTasks(page, [{ title: "Fade task", estimateMinutes: 50 }]);
  await setCategoryTrack(page, "1204");
  await page.goto(`/planner/pomodoro?task=${taskId}`);
  await expect(page.getByRole("region", { name: "Music" }).getByText("Slow Rain")).toBeVisible();

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  // Fade-in over 3 s: the first sample after Start is well below full volume.
  const early = await audioState(page);
  expect(early?.volume ?? 1).toBeLessThan(0.5);

  // Session end: 6 s left, the audio is paused once it runs out.
  await age(taskId!, 24.9);
  await page.reload();
  await expect.poll(async () => (await audioState(page))?.paused, { timeout: 15_000 }).toBe(true);
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible({ timeout: 15_000 });

  // Break: silent. The plan moves on to a break after the focus session.
  await expect(page.getByText(/^Break · /)).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect.poll(async () => (await audioState(page))?.paused, { timeout: 8_000 }).toBe(true);
  await page.waitForTimeout(1000);
  expect((await audioState(page))?.paused).toBe(true);
});

test("music player: a stream error shows the one line and the timer keeps running", async ({ page }) => {
  await stubMusic(page);
  await page.route("**/*.mp3", (route) => route.abort());
  await register(page);
  const [taskId] = await addTasks(page, [{ title: "Bad stream", estimateMinutes: 50 }]);
  await setCategoryTrack(page, "1204");
  await page.goto(`/planner/pomodoro?task=${taskId}`);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(page.getByText("Music unavailable — the timer continues.")).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText(/^2[45]:\d\d$/);
});

test("music player: a failed save keeps the old music playing and shows the one line", async ({ page }) => {
  await stubMusic(page);
  await register(page);
  const [taskId] = await addTasks(page, [{ title: "Save fails", estimateMinutes: 50 }]);
  await setCategoryTrack(page, "1204");
  await page.goto(`/planner/pomodoro?task=${taskId}`);
  const strip = page.getByRole("region", { name: "Music" });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect.poll(async () => (await audioState(page))?.paused).toBe(false);

  await page.route(`**/api/planner/tasks/${taskId}`, (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, json: { error: { code: "INTERNAL", message: "x" } } })
      : route.continue()
  );
  await strip.getByRole("button", { name: "Change" }).click();
  await strip.getByLabel("Search tracks").fill("lanterns");
  await strip.getByLabel("Search tracks").press("Enter");
  await strip.getByRole("button", { name: /Paper Lanterns/ }).click();
  await expect(strip.getByText("Music unavailable — the timer continues.")).toBeVisible();
  const after = await audioState(page);
  expect(after?.src).toBe("https://example.test/1204.mp3");
  expect(after?.paused).toBe(false);
});
