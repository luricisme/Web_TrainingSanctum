import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";

async function register(page: Page): Promise<string> {
  const email = `e2e-review-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Review E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  return email;
}

/**
 * Seeds one learned Card (both directions due now and already graded once,
 * spec-4-6) in IELTS / Speaking / Weather idioms, plus `extra` more learned
 * Cards in the same Flashcard.
 */
async function seedCard(email: string, extra = 0) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const cls = await prisma.class.create({
    data: {
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
  const flashcard = await prisma.flashcard.create({
    data: { name: "Weather idioms", folderId: folder.id, userId: user.id },
  });
  const due = new Date(Date.now() - 60_000);
  const firstGradedAt = new Date(Date.now() - 7 * 86_400_000);
  const card = await prisma.card.create({
    data: {
      term: "drizzle",
      definition: "light rain",
      example: "It drizzled all morning.",
      flashcardId: flashcard.id,
      userId: user.id,
      schedulingRecords: {
        create: [
          { direction: "TERM_TO_DEFINITION", nextReviewDate: due, firstGradedAt },
          { direction: "DEFINITION_TO_TERM", nextReviewDate: due, firstGradedAt },
        ],
      },
    },
  });
  for (let i = 0; i < extra; i++) {
    await prisma.card.create({
      data: {
        term: `term ${i}`,
        definition: `definition ${i}`,
        flashcardId: flashcard.id,
        userId: user.id,
        schedulingRecords: {
          create: [
            { direction: "TERM_TO_DEFINITION", nextReviewDate: due, firstGradedAt },
            { direction: "DEFINITION_TO_TERM", nextReviewDate: due, firstGradedAt },
          ],
        },
      },
    });
  }
  return { cls, folder, flashcard, card };
}

/** Records the grade of every POST to the grade route, then lets it through. */
async function recordGrades(page: Page): Promise<string[]> {
  const grades: string[] = [];
  await page.route("**/api/review/grade", async (route) => {
    grades.push(route.request().postDataJSON().grade);
    await route.continue();
  });
  return grades;
}

const doneLine = "You're all caught up — nothing is due for review right now.";

test("keyboard loop: Space reveals, 3 and k grade both directions", async ({ page }) => {
  const email = await register(page);
  const { card } = await seedCard(email);
  await page.goto("/review");

  // Prompt first: Term → Definition sorts before Definition → Term.
  await expect(page.getByText("Weather idioms · Term → Definition").first()).toBeVisible();
  await expect(page.getByText("drizzle", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Click the card, or press Space, to reveal")).toBeVisible();
  await expect(page.getByText("1 / 2")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Good/ })).toHaveCount(0);

  // Grade keys do nothing until the answer is revealed.
  await page.keyboard.press("3");
  await expect(page.getByText("1 / 2")).toBeVisible();

  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /^Good/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Again/ })).toBeVisible();
  await expect(page.getByText("It drizzled all morning.").first()).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.keyboard.press("3");
  await expect(page.getByText("Weather idioms · Definition → Term").first()).toBeVisible();
  await expect(page.getByText("2 / 2")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Good/ })).toHaveCount(0);

  await page.keyboard.press("Space");
  await page.keyboard.press("k");
  await expect(page.getByText(doneLine)).toBeVisible();

  await expect
    .poll(async () =>
      (await prisma.schedulingRecord.findMany({ where: { cardId: card.id } })).map(
        (r) => r.repetitions
      )
    )
    .toEqual([1, 1]);
});

test("the card flips back and forth; grading stays available once the answer was seen", async ({
  page,
}) => {
  const email = await register(page);
  await seedCard(email);
  const grades = await recordGrades(page);
  await page.goto("/review");
  await expect(page.getByText("1 / 2")).toBeVisible();

  const card = page.locator("button").filter({ hasText: "Weather idioms ·" });
  const prompt = card.getByText("drizzle", { exact: true });
  const answer = card.getByText("light rain", { exact: true });

  await page.keyboard.press("Space");
  await expect(answer.locator("..")).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByRole("button", { name: /^Good/ })).toBeVisible();

  // Space flips back to the prompt; the grade buttons stay.
  await page.keyboard.press("Space");
  await expect(prompt.locator("..")).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByRole("button", { name: /^Good/ })).toBeVisible();

  // A click flips it again, either way.
  await card.click();
  await expect(answer.locator("..")).toHaveAttribute("aria-hidden", "false");
  await card.click();
  await expect(prompt.locator("..")).toHaveAttribute("aria-hidden", "false");
  await expect(page.getByText("1 / 2")).toBeVisible();

  // Grading from the prompt face works once the answer was seen.
  await page.keyboard.press("3");
  await expect(page.getByText("2 / 2")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Good/ })).toHaveCount(0);
  await expect.poll(() => grades).toEqual(["good"]);
});

test("a failed grade brings the entry back with an alert", async ({ page }) => {
  const email = await register(page);
  await seedCard(email);
  await page.route("**/api/review/grade", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "boom" } }),
    })
  );
  await page.goto("/review");
  await expect(page.getByText("1 / 2")).toBeVisible();

  await page.keyboard.press("Space");
  await page.getByRole("button", { name: /^Good/ }).click();

  await expect(page.getByRole("alert").filter({ hasText: "grade" })).toHaveText(
    "Your grade wasn't saved. Grade this card again."
  );
  await expect(page.getByText("Weather idioms · Term → Definition").first()).toBeVisible();
  await expect(page.getByText("1 / 2")).toBeVisible();
  // Back unflipped: the hint shows and the grade buttons do not.
  await expect(page.getByText("Click the card, or press Space, to reveal")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Good/ })).toHaveCount(0);
});

test("a 409 NOT_DUE grade counts as already applied: no rollback, no alert", async ({ page }) => {
  const email = await register(page);
  await seedCard(email);
  await page.route("**/api/review/grade", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "NOT_DUE", message: "This card is not due yet." },
      }),
    })
  );
  await page.goto("/review");
  await expect(page.getByText("1 / 2")).toBeVisible();

  const graded = page.waitForResponse("**/api/review/grade");
  await page.keyboard.press("Space");
  await page.keyboard.press("3");
  await graded;

  await expect(page.getByText("Weather idioms · Definition → Term").first()).toBeVisible();
  await expect(page.getByText("2 / 2")).toBeVisible();
  await expect(page.getByText("Your grade wasn't saved. Grade this card again.")).toHaveCount(0);
});

test("the Flashcard page has no Review link; a stale flashcard review link is invalid", async ({
  page,
}) => {
  const email = await register(page);
  const { flashcard } = await seedCard(email);
  await page.goto(`/flashcards/${flashcard.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Weather idioms" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add cards" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review this flashcard" })).toHaveCount(0);

  await page.goto(`/review?flashcardId=${flashcard.id}`);
  await expect(page.getByText("This review link isn't valid.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Review all cards" })).toHaveAttribute(
    "href",
    "/review"
  );
});

test("a Card added through the UI does not appear on /review until learned", async ({ page }) => {
  const email = await register(page);
  const { flashcard } = await seedCard(email);
  await page.goto(`/flashcards/${flashcard.id}`);
  await page.getByRole("button", { name: "Add cards" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Term, row 1").fill("squall");
  await dialog.getByLabel("Definition, row 1").fill("sudden gust");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("squall")).toBeVisible();
  const added = await prisma.card.findFirstOrThrow({
    where: { flashcardId: flashcard.id, term: "squall" },
    include: { schedulingRecords: true },
  });
  expect(added.schedulingRecords.map((r) => r.firstGradedAt)).toEqual([null, null]);

  // Only the seeded learned Card's two directions are queued.
  await page.goto("/review");
  await expect(page.getByText("1 / 2")).toBeVisible();
  for (const key of ["Space", "3", "Space", "3"]) await page.keyboard.press(key);
  await expect(page.getByText(doneLine)).toBeVisible();
});

test("rapid key presses grade every entry with no waits in between", async ({ page }) => {
  const email = await register(page);
  const { card } = await seedCard(email);
  await page.goto("/review");
  await expect(page.getByText("1 / 2")).toBeVisible();

  for (const key of ["Space", "l", "Space", "4"]) await page.keyboard.press(key);
  await expect(page.getByText(doneLine)).toBeVisible();
  await expect
    .poll(async () =>
      (await prisma.schedulingRecord.findMany({ where: { cardId: card.id } })).map(
        (r) => r.repetitions
      )
    )
    .toEqual([1, 1]);
});

test("every grade key posts its grade: 1 2 3 4 j k l ;", async ({ page }) => {
  const email = await register(page);
  await seedCard(email, 3);
  const grades = await recordGrades(page);
  await page.goto("/review");
  await expect(page.getByText("1 / 8")).toBeVisible();

  const keys = ["1", "2", "3", "4", "j", "k", "l", ";"];
  for (const [i, key] of keys.entries()) {
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: /^Good/ })).toBeVisible();
    await page.keyboard.press(key);
    if (i < keys.length - 1) await expect(page.getByText(`${i + 2} / 8`)).toBeVisible();
  }
  await expect(page.getByText(doneLine)).toBeVisible();
  await expect
    .poll(() => grades)
    .toEqual(["again", "hard", "good", "easy", "again", "hard", "good", "easy"]);
});

test("Review this class and Review this folder open scoped sessions", async ({ page }) => {
  const email = await register(page);
  const { cls, folder } = await seedCard(email);

  await page.goto(`/classes/${cls.id}`);
  await page.getByRole("link", { name: "Review this class" }).click();
  await expect(page).toHaveURL(`/review?classId=${cls.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Reviewing class IELTS");
  await expect(page.getByText("1 / 2")).toBeVisible();

  await page.goto(`/folders/${folder.id}`);
  await page.getByRole("link", { name: "Review this folder" }).click();
  await expect(page).toHaveURL(`/review?folderId=${folder.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Reviewing folder Speaking"
  );
  await expect(page.getByText("1 / 2")).toBeVisible();
});

test("touch swipes grade a revealed card; short touches and mouse drags do not", async ({
  page,
}) => {
  const email = await register(page);
  await seedCard(email, 1);
  const grades = await recordGrades(page);
  await page.goto("/review");
  await expect(page.getByText("1 / 4")).toBeVisible();

  const card = page.locator("button").filter({ hasText: "Weather idioms ·" });
  async function swipe(pointerType: string, dx: number, dy: number) {
    const base = { bubbles: true, pointerId: 1, isPrimary: true, pointerType };
    await card.dispatchEvent("pointerdown", { ...base, clientX: 200, clientY: 200 });
    await card.dispatchEvent("pointerup", { ...base, clientX: 200 + dx, clientY: 200 + dy });
  }

  // Before the answer has been seen, a full swipe does not grade.
  await swipe("touch", 60, 0);
  await expect(page.getByText("1 / 4")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Good/ })).toHaveCount(0);
  expect(grades).toEqual([]);

  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /^Good/ })).toBeVisible();

  // Under the 48px threshold, and a mouse drag: neither grades.
  await swipe("touch", 40, 0);
  await swipe("mouse", -200, 0);
  await expect(page.getByText("1 / 4")).toBeVisible();

  const expected: [number, number, string][] = [
    [-60, 0, "again"],
    [0, 60, "hard"],
    [60, 0, "good"],
    [0, -60, "easy"],
  ];
  for (const [i, [dx, dy]] of expected.entries()) {
    if (i > 0) {
      await expect(page.getByText(`${i + 1} / 4`)).toBeVisible();
      await page.keyboard.press("Space");
      await expect(page.getByRole("button", { name: /^Good/ })).toBeVisible();
    }
    await swipe("touch", dx, dy);
  }
  await expect(page.getByText(doneLine)).toBeVisible();
  await expect.poll(() => grades).toEqual(expected.map(([, , g]) => g));
});

test("unknown and invalid scopes offer Review all cards instead of a retry", async ({ page }) => {
  await register(page);

  await page.goto("/review?classId=does-not-exist");
  await expect(page.getByText("This class or folder does not exist.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Review all cards" })).toHaveAttribute(
    "href",
    "/review"
  );
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);

  await page.goto("/review?classId=a&folderId=b");
  await expect(page.getByText("This review link isn't valid.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Review all cards" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});

// spec-4-5: focus mode and the Empty due-queue state.
const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

/** Moves every Scheduling Record of the user's Cards to tomorrow, so nothing is due. */
async function nothingDue(email: string) {
  await prisma.schedulingRecord.updateMany({
    where: { card: { user: { email } } },
    data: { nextReviewDate: new Date(Date.now() + 86_400_000) },
  });
}

/** Adds `count` unlearned Cards to a Flashcard, each newer than the last. */
async function addNewCards(email: string, flashcardId: string, count: number, offset = 0) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  for (let i = 0; i < count; i++) {
    await prisma.card.create({
      data: {
        term: `new ${offset + i}`,
        definition: `new definition ${offset + i}`,
        flashcardId,
        userId: user.id,
        schedulingRecords: {
          create: [
            { direction: "TERM_TO_DEFINITION", nextReviewDate: new Date() },
            { direction: "DEFINITION_TO_TERM", nextReviewDate: new Date() },
          ],
        },
      },
    });
  }
}

test("the server-rendered session hides the sidebar before any script runs", async ({
  page,
  browser,
}) => {
  const email = await register(page);
  await seedCard(email);
  const noJs = await browser.newContext({
    storageState: await page.context().storageState(),
    javaScriptEnabled: false,
  });
  const raw = await noJs.newPage();
  await raw.goto("/review");
  await expect(raw.locator("[data-focus-session]")).toHaveCount(1);
  await expect(raw.locator("aside[data-sidebar]")).toHaveCount(1);
  await expect(raw.getByRole("navigation", { name: "Main" })).toBeHidden();
  await noJs.close();
});

test("focus mode hides the sidebar during the session and brings it back after the last grade", async ({
  page,
}) => {
  const email = await register(page);
  await seedCard(email);
  await page.goto("/classes");
  await expect(mainNav(page)).toBeVisible();

  await page.goto("/review");
  await expect(page.getByText("1 / 2")).toBeVisible();
  await expect(mainNav(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Exit" })).toHaveAttribute("href", "/classes");

  for (const key of ["Space", "3", "Space", "3"]) await page.keyboard.press(key);
  await expect(page.getByText(doneLine)).toBeVisible();
  await expect(mainNav(page)).toBeVisible();
  await expect(page.getByRole("link", { name: "Exit" })).toHaveCount(0);
});

test("leaving mid-session brings the sidebar back: Exit, Esc, Back and an in-app link", async ({
  page,
}) => {
  const email = await register(page);
  const { cls, folder } = await seedCard(email);

  // Exit (unscoped) goes to Classes.
  await page.goto("/review");
  await expect(page.getByText("1 / 2")).toBeVisible();
  await page.getByRole("link", { name: "Exit" }).click();
  await expect(page).toHaveURL("/classes");
  await expect(mainNav(page)).toBeVisible();

  // Esc in a class-scoped session goes to the Class.
  await page.goto(`/review?classId=${cls.id}`);
  await expect(page.getByText("1 / 2")).toBeVisible();
  await expect(mainNav(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(`/classes/${cls.id}`);
  await expect(mainNav(page)).toBeVisible();

  // Esc with a modifier is ignored; plain Esc in a folder scope goes to the Folder.
  await page.goto(`/review?folderId=${folder.id}`);
  await expect(page.getByText("1 / 2")).toBeVisible();
  await expect(page.getByRole("link", { name: "Exit" })).toHaveAttribute(
    "href",
    `/folders/${folder.id}`
  );
  await page.keyboard.press("Shift+Escape");
  await expect(page.getByText("1 / 2")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(`/folders/${folder.id}`);
  await expect(mainNav(page)).toBeVisible();

  // Browser Back from a session.
  await page.goto("/review");
  await expect(page.getByText("1 / 2")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(`/folders/${folder.id}`);
  await expect(mainNav(page)).toBeVisible();

  // An in-app link (the scope name in the header).
  await page.goto(`/review?classId=${cls.id}`);
  await expect(page.getByText("1 / 2")).toBeVisible();
  await page.getByRole("heading", { level: 1 }).getByRole("link", { name: "IELTS" }).click();
  await expect(page).toHaveURL(`/classes/${cls.id}`);
  await expect(mainNav(page)).toBeVisible();
});

test("nothing due: the Empty due-queue state lists up to 3 Flashcards with new Cards", async ({
  page,
}) => {
  const email = await register(page);
  const { folder, flashcard } = await seedCard(email);
  await nothingDue(email);
  await addNewCards(email, flashcard.id, 2);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const more = [];
  for (const name of ["Phrasal verbs", "Academic verbs", "Linking words"]) {
    const f = await prisma.flashcard.create({
      data: { name, folderId: folder.id, userId: user.id },
    });
    await addNewCards(email, f.id, 1, more.length * 10 + 10);
    more.push(f);
  }

  await page.goto("/review");
  await expect(page.getByText(doneLine)).toBeVisible();
  await expect(mainNav(page)).toBeVisible();
  await expect(page.getByRole("link", { name: "Exit" })).toHaveCount(0);

  const rows = page.getByRole("region", { name: "Ready to learn" }).getByRole("link");
  await expect(rows).toHaveText([
    "Linking words · 1 new",
    "Academic verbs · 1 new",
    "Phrasal verbs · 1 new",
  ]);
  await expect(rows.first()).toHaveAttribute("href", `/flashcards/${more[2].id}`);
  // No accent action on the list variant.
  await expect(page.locator("main :is(a, button).bg-accent")).toHaveCount(0);

  await rows.first().click();
  await expect(page).toHaveURL(`/flashcards/${more[2].id}`);
});

test("nothing due and nothing new: + Add card opens Add cards on the newest Card's Flashcard", async ({
  page,
}) => {
  const email = await register(page);
  const { flashcard } = await seedCard(email);
  await nothingDue(email);

  await page.goto("/review");
  await expect(page.getByText(doneLine)).toBeVisible();
  const add = page.getByRole("link", { name: "+ Add card" });
  await expect(add).toHaveAttribute("href", `/flashcards/${flashcard.id}?add=1`);
  await expect(page.getByText("Adds to Weather idioms")).toBeVisible();
  // "+ Add card" is the screen's one accent action.
  const accent = page.locator("main :is(a, button).bg-accent");
  await expect(accent).toHaveCount(1);
  await expect(accent).toHaveText("+ Add card");

  await add.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Add cards to Weather idioms");
  await expect(dialog.getByLabel("Term, row 1")).toBeVisible();
  await expect(page).toHaveURL(`/flashcards/${flashcard.id}`);
});

test("a failed load of the next step offers Try again", async ({ page }) => {
  const email = await register(page);
  await seedCard(email);
  await nothingDue(email);
  let failing = true;
  await page.route("**/api/review/unlearned*", (route) =>
    failing
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "boom" } }),
        })
      : route.continue()
  );

  await page.goto("/review");
  await expect(page.getByText(doneLine)).toBeVisible();
  const failed = page.getByRole("alert").filter({ hasText: "Could not load what to study next." });
  await expect(failed).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: "+ Add card" })).toBeVisible();
  await expect(failed).toHaveCount(0);
});

test("a new account's + Add card goes to Classes", async ({ page }) => {
  await register(page);
  await expect(page.getByText(doneLine)).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Add card" })).toHaveAttribute("href", "/classes");
});

test("a scoped Review with nothing due names its scope and lists only its Flashcards", async ({
  page,
}) => {
  const email = await register(page);
  const { folder, flashcard } = await seedCard(email);
  await nothingDue(email);
  await addNewCards(email, flashcard.id, 1);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const other = await prisma.class.create({
    data: {
      name: "TOEFL",
      userId: user.id,
      folders: { create: [{ name: "Reading", userId: user.id }] },
    },
    include: { folders: true },
  });
  const outside = await prisma.flashcard.create({
    data: { name: "Academic verbs", folderId: other.folders[0].id, userId: user.id },
  });
  await addNewCards(email, outside.id, 1, 50);

  await page.goto(`/review?folderId=${folder.id}`);
  await expect(
    page.getByText("You're all caught up — nothing in Speaking is due for review right now.")
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Ready to learn" }).getByRole("link")
  ).toHaveText(["Weather idioms · 1 new"]);
});

// Visual check: screenshots land in test-results/screenshots for comparison
// against DESIGN.md and mockups/key-screens.html.
for (const theme of ["dark", "light"] as const) {
  for (const width of [1280, 390]) {
    test(`focus mode and empty-state screenshots (${theme}, ${width}px)`, async ({ page }) => {
      mkdirSync("test-results/screenshots", { recursive: true });
      await page.setViewportSize({ width, height: 900 });
      const email = await register(page);
      const { flashcard } = await seedCard(email);
      const setTheme = () =>
        page.evaluate((t) => {
          if (t === "light") document.documentElement.dataset.theme = "light";
          else delete document.documentElement.dataset.theme;
        }, theme);
      const shot = (name: string) =>
        page.screenshot({
          path: `test-results/screenshots/review-${name}-${theme}-${width}.png`,
          animations: "disabled",
        });

      await page.goto("/review");
      await expect(page.getByText("1 / 2")).toBeVisible();
      await setTheme();
      await shot("session");
      await page.keyboard.press("Space");
      await expect(page.getByRole("button", { name: /^Again/ })).toBeVisible();
      await shot("session-revealed");

      // Cleared queue with nothing new: the + Add card variant.
      for (const key of ["3", "Space", "3"]) await page.keyboard.press(key);
      await expect(page.getByRole("link", { name: "+ Add card" })).toBeVisible();
      await shot("empty-add");

      // The list variant.
      await nothingDue(email);
      await addNewCards(email, flashcard.id, 12);
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const phrasal = await prisma.flashcard.create({
        data: { name: "Phrasal verbs", folderId: flashcard.folderId, userId: user.id },
      });
      await addNewCards(email, phrasal.id, 3, 100);
      await page.goto("/review");
      await expect(page.getByRole("region", { name: "Ready to learn" })).toBeVisible();
      await setTheme();
      await shot("empty-list");
    });
  }
}
