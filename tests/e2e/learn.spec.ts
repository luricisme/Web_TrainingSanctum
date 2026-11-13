import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";

async function register(page: Page): Promise<string> {
  const email = `e2e-learn-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Learn E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  return email;
}

interface SeedCard {
  term: string;
  definition: string;
  /** Both records graded once (spec-4-6). */
  learned?: boolean;
  /** Learned only: when each direction is due, relative to now in days. */
  dueIn?: [number, number];
  example?: string;
  partOfSpeech?: string;
}

/**
 * Seeds IELTS / Speaking / Weather idioms with `cards`, created in array order
 * (the first is the oldest). New Cards are due today, as the creation path makes them.
 */
async function seed(email: string, cards: SeedCard[]) {
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
  const now = Date.now();
  const created = [];
  for (const [i, c] of cards.entries()) {
    const firstGradedAt = c.learned ? new Date(now - 7 * 86_400_000) : null;
    const [t2d, d2t] = c.learned ? (c.dueIn ?? [-1, -1]) : [0, 0];
    const at = (days: number) => new Date(now + days * 86_400_000 - 60_000);
    created.push(
      await prisma.card.create({
        data: {
          term: c.term,
          definition: c.definition,
          example: c.example ?? null,
          partOfSpeech: c.partOfSpeech ?? null,
          createdAt: new Date(now - (cards.length - i) * 60_000),
          flashcardId: flashcard.id,
          userId: user.id,
          schedulingRecords: {
            create: [
              { direction: "TERM_TO_DEFINITION", nextReviewDate: at(t2d), firstGradedAt },
              { direction: "DEFINITION_TO_TERM", nextReviewDate: at(d2t), firstGradedAt },
            ],
          },
        },
        include: { schedulingRecords: true },
      })
    );
  }
  return { flashcard, cards: created };
}

/** Records every POST to the grade route as `recordId:grade`, then lets it through. */
async function recordGrades(page: Page): Promise<string[]> {
  const posts: string[] = [];
  await page.route("**/api/review/grade", async (route) => {
    const body = route.request().postDataJSON();
    posts.push(`${body.schedulingRecordId}:${body.grade}`);
    await route.continue();
  });
  return posts;
}

const hint = "Click the card, or press Space, to reveal";
const doneLine = "Nothing left to learn in Weather idioms right now.";
const practiceDoneLine = "You've gone through every card in Weather idioms.";

const NEW_A = { term: "drizzle", definition: "light rain" };
const NEW_B = { term: "squall", definition: "sudden gust" };
const LEARNED_DUE: SeedCard = {
  term: "gale",
  definition: "very strong wind",
  learned: true,
  dueIn: [-1, 1],
};

test("the Learn button names what is waiting and is the page's only accent element", async ({
  page,
}) => {
  const email = await register(page);
  const { flashcard } = await seed(email, [NEW_A, NEW_B, LEARNED_DUE]);
  await page.goto(`/flashcards/${flashcard.id}`);

  const learn = page.getByRole("link", { name: "Learn · 2 new · 1 due" });
  await expect(learn).toHaveAttribute("href", `/flashcards/${flashcard.id}/learn`);
  // Directly under the viewer's nav row.
  const nav = await page.getByRole("button", { name: "Next card" }).boundingBox();
  const box = await learn.boundingBox();
  expect(box!.y).toBeGreaterThan(nav!.y + nav!.height);
  expect(box!.y - (nav!.y + nav!.height)).toBeLessThan(48);

  // Add cards is secondary while the viewer shows; Learn is the one accent fill.
  await expect(page.getByRole("button", { name: "Add cards" })).not.toHaveClass(/bg-accent/);
  // (The section-header bullet is the sanctioned non-actionable accent motif.)
  const accentActions = page.locator("main :is(a, button).bg-accent");
  await expect(accentActions).toHaveCount(1);
  await expect(accentActions).toHaveText("Learn · 2 new · 1 due");
});

test("zero parts are left out; an idle Flashcard reads just Learn; an empty one has none", async ({
  page,
}) => {
  const email = await register(page);
  const idle = await seed(email, [{ ...LEARNED_DUE, dueIn: [1, 1] }]);
  await page.goto(`/flashcards/${idle.flashcard.id}`);
  await expect(page.getByRole("link", { name: "Learn", exact: true })).toBeVisible();

  const dueOnly = await seed(email, [LEARNED_DUE]);
  await page.goto(`/flashcards/${dueOnly.flashcard.id}`);
  await expect(page.getByRole("link", { name: "Learn · 1 due", exact: true })).toBeVisible();

  const empty = await seed(email, []);
  await page.goto(`/flashcards/${empty.flashcard.id}`);
  await expect(page.getByText("Add cards to start studying this flashcard.")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Learn/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add cards" })).toHaveClass(/bg-accent/);
});

test("a full session by keyboard: new Cards in order, Again repeats at the end, one save per record", async ({
  page,
}) => {
  const email = await register(page);
  const {
    flashcard,
    cards: [a, , g],
  } = await seed(email, [NEW_A, { ...NEW_B }, LEARNED_DUE]);
  // Keep the session short: B is already learned and not due.
  await prisma.schedulingRecord.updateMany({
    where: { card: { flashcardId: flashcard.id, term: NEW_B.term } },
    data: { firstGradedAt: new Date(), nextReviewDate: new Date(Date.now() + 86_400_000) },
  });
  const posts = await recordGrades(page);

  await page.goto(`/flashcards/${flashcard.id}`);
  await page.getByRole("link", { name: "Learn · 1 new · 1 due" }).click();
  await expect(page).toHaveURL(`/flashcards/${flashcard.id}/learn`);
  const header = page.getByRole("heading", { level: 1 });
  await expect(header).toHaveText("Learning Weather idioms");
  await expect(header.getByRole("link", { name: "Weather idioms" })).toHaveAttribute(
    "href",
    `/flashcards/${flashcard.id}`
  );

  // A Term → Definition first; grade keys do nothing before the answer shows.
  await expect(page.getByText("Weather idioms · Term → Definition").first()).toBeVisible();
  await expect(page.getByText("drizzle", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1 / 3")).toBeVisible();
  await page.keyboard.press("3");
  await expect(page.getByText("1 / 3")).toBeVisible();

  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole("button", { name: /^Again/ })).toBeVisible();
  // Again (1): the entry is queued again at the end, so N grows.
  await page.keyboard.press("1");
  await expect(page.getByText("2 / 4")).toBeVisible();
  await expect(page.getByText("Weather idioms · Definition → Term").first()).toBeVisible();

  await page.keyboard.press("Space");
  await page.keyboard.press("l");
  // Then the due learned record.
  await expect(page.getByText("3 / 4")).toBeVisible();
  await expect(page.getByText("gale", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Space");
  await page.keyboard.press(";");

  // The repeat of A Term → Definition mounts unflipped.
  await expect(page.getByText("4 / 4")).toBeVisible();
  await expect(page.getByText("drizzle", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(hint)).toBeVisible();
  await page.keyboard.press("Space");
  // Again on a repeat queues one more practice copy, and saves nothing.
  await page.keyboard.press("j");
  await expect(page.getByText("5 / 5")).toBeVisible();
  await expect(page.getByText(hint)).toBeVisible();
  await page.keyboard.press("Space");
  await page.keyboard.press("k");

  await expect(page.getByText(doneLine)).toBeVisible();
  const [aForward, aBackward] = [
    a.schedulingRecords.find((r) => r.direction === "TERM_TO_DEFINITION")!,
    a.schedulingRecords.find((r) => r.direction === "DEFINITION_TO_TERM")!,
  ];
  const gForward = g.schedulingRecords.find((r) => r.direction === "TERM_TO_DEFINITION")!;
  await expect
    .poll(() => posts)
    .toEqual([`${aForward.id}:again`, `${aBackward.id}:good`, `${gForward.id}:easy`]);

  // Only the first grade of A Term → Definition (Again) set its schedule; A is now learned.
  await expect
    .poll(async () => {
      const records = await prisma.schedulingRecord.findMany({
        where: { cardId: a.id },
        orderBy: { direction: "asc" },
      });
      return records.map((r) => [r.direction, r.repetitions, r.firstGradedAt !== null]);
    })
    .toEqual([
      ["TERM_TO_DEFINITION", 0, true],
      ["DEFINITION_TO_TERM", 1, true],
    ]);

  // Back on the Flashcard, the counts are current.
  const back = page.getByRole("link", { name: "Back to Weather idioms" });
  await expect(back).toHaveAttribute("href", `/flashcards/${flashcard.id}`);
  await back.click();
  await expect(page).toHaveURL(`/flashcards/${flashcard.id}`);
  await expect(page.getByRole("link", { name: "Learn", exact: true })).toBeVisible();
});

// spec-4-5: focus mode in Learn and the practice run.
test("Learn runs in focus mode; the sidebar returns on completion; Exit and Esc lead to the Flashcard", async ({
  page,
}) => {
  const email = await register(page);
  const { flashcard } = await seed(email, [NEW_A]);
  const mainNav = page.getByRole("navigation", { name: "Main" });
  const exit = page.getByRole("link", { name: "Exit" });

  await page.goto(`/flashcards/${flashcard.id}/learn`);
  await expect(page.getByText("1 / 2")).toBeVisible();
  await expect(mainNav).toHaveCount(0);
  await expect(exit).toHaveAttribute("href", `/flashcards/${flashcard.id}`);
  await expect(exit).toHaveAttribute("aria-keyshortcuts", "Escape");

  for (const key of ["Space", "3", "Space", "3"]) await page.keyboard.press(key);
  await expect(page.getByText(doneLine)).toBeVisible();
  await expect(mainNav).toBeVisible();
  await expect(exit).toHaveCount(0);

  // The practice run is in focus mode too; Esc leaves it for the Flashcard.
  await page.getByRole("button", { name: "Study all cards again" }).click();
  await expect(page.getByText("1 / 2")).toBeVisible();
  await expect(mainNav).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(`/flashcards/${flashcard.id}`);
  await expect(mainNav).toBeVisible();

  // Exit mid-session.
  await page.goto(`/flashcards/${flashcard.id}/learn`);
  await page.getByRole("button", { name: "Study all cards again" }).click();
  await expect(page.getByText("1 / 2")).toBeVisible();
  await exit.click();
  await expect(page).toHaveURL(`/flashcards/${flashcard.id}`);
  await expect(mainNav).toBeVisible();
});

test("an unknown Flashcard's Learn page keeps the sidebar", async ({ page }) => {
  await register(page);
  await page.goto("/flashcards/does-not-exist/learn");
  await expect(page.getByText("This flashcard does not exist.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});

test("a Learn session with nothing waiting shows Learn complete", async ({ page }) => {
  const email = await register(page);
  const { flashcard } = await seed(email, [{ ...LEARNED_DUE, dueIn: [1, 1] }]);
  await page.goto(`/flashcards/${flashcard.id}/learn`);
  await expect(page.getByText(doneLine)).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Weather idioms" })).toHaveAttribute(
    "href",
    `/flashcards/${flashcard.id}`
  );
  // spec-4-8b: the usual way in — a practice run straight from an idle Flashcard.
  await page.getByRole("button", { name: "Study all cards again" }).click();
  await expect(page.getByText("1 / 2")).toBeVisible();
  await expect(page.getByText("gale", { exact: true }).first()).toBeVisible();
});

test("a failed first Again rolls back and removes its practice copy", async ({ page }) => {
  const email = await register(page);
  const { flashcard } = await seed(email, [NEW_A]);
  await page.route("**/api/review/grade", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "boom" } }),
    })
  );
  await page.goto(`/flashcards/${flashcard.id}/learn`);
  await expect(page.getByText("1 / 2")).toBeVisible();

  await page.keyboard.press("Space");
  await page.getByRole("button", { name: /^Again/ }).click();

  await expect(page.getByRole("alert").filter({ hasText: "grade" })).toHaveText(
    "Your grade wasn't saved. Grade this card again."
  );
  await expect(page.getByText("Weather idioms · Term → Definition").first()).toBeVisible();
  await expect(page.getByText("1 / 2")).toBeVisible();
  await expect(page.getByText(hint)).toBeVisible();
});

test("a late failure of a first Again, after its practice copy was graded, restores only the entry", async ({
  page,
}) => {
  const email = await register(page);
  const {
    cards: [a],
    flashcard,
  } = await seed(email, [NEW_A]);
  const forward = a.schedulingRecords.find((r) => r.direction === "TERM_TO_DEFINITION")!;
  const posts: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/review/grade", async (route) => {
    const body = route.request().postDataJSON();
    posts.push(`${body.schedulingRecordId}:${body.grade}`);
    if (posts.length === 1) {
      // Hold the first POST (Again on Term → Definition) while the user moves on.
      await held;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "boom" } }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto(`/flashcards/${flashcard.id}/learn`);
  await expect(page.getByText("1 / 2")).toBeVisible();
  await page.keyboard.press("Space");
  await page.keyboard.press("1"); // Again: POST held, practice copy queued.
  await expect(page.getByText("2 / 3")).toBeVisible();
  await page.keyboard.press("Space");
  await page.keyboard.press("3"); // Definition → Term: Good, saved.
  await expect(page.getByText("3 / 3")).toBeVisible();
  await page.keyboard.press("Space");
  await page.keyboard.press("3"); // The practice copy: Good, never POSTed.
  await expect(page.getByText(doneLine)).toBeVisible();
  await expect.poll(() => posts.length).toBe(2);

  release();

  // Term → Definition is back as the current card, unflipped; the graded
  // practice copy is gone, so the session holds exactly the two records.
  await expect(page.getByRole("alert").filter({ hasText: "grade" })).toHaveText(
    "Your grade wasn't saved. Grade this card again."
  );
  await expect(page.getByText("Weather idioms · Term → Definition").first()).toBeVisible();
  await expect(page.getByText("2 / 2")).toBeVisible();
  await expect(page.getByText(hint)).toBeVisible();

  await page.keyboard.press("Space");
  await page.keyboard.press("3");
  await expect(page.getByText(doneLine)).toBeVisible();
  await expect.poll(() => posts.filter((p) => p.startsWith(`${forward.id}:`))).toEqual([
    `${forward.id}:again`,
    `${forward.id}:good`,
  ]);
});

test("Study all cards again runs every Card as practice: Again repeats, nothing is saved", async ({
  page,
}) => {
  const email = await register(page);
  // A new Card (older) and a learned one that is not due.
  const { flashcard } = await seed(email, [NEW_A, { ...LEARNED_DUE, dueIn: [3, 3] }]);
  const posts = await recordGrades(page);

  // Learn the new Card first, so the session ends in its complete state.
  await page.goto(`/flashcards/${flashcard.id}/learn`);
  await expect(page.getByText("1 / 2")).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press("Space");
    await page.keyboard.press("3");
  }
  await expect(page.getByText(doneLine)).toBeVisible();
  await expect.poll(() => posts.length).toBe(2);
  const snapshot = () =>
    prisma.schedulingRecord
      .findMany({ where: { card: { flashcardId: flashcard.id } }, orderBy: { id: "asc" } })
      .then((rows) =>
        rows.map((r) => [
          r.id,
          r.interval,
          r.repetitions,
          r.easeFactor,
          r.nextReviewDate.toISOString(),
          r.firstGradedAt?.toISOString() ?? null,
        ])
      );
  await expect.poll(async () => (await snapshot()).every((row) => row[5] !== null)).toBe(true);
  const before = await snapshot();

  // The restart is secondary, never the accent.
  const again = page.getByRole("button", { name: "Study all cards again" });
  await expect(again).not.toHaveClass(/bg-accent/);
  await again.click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Practicing Weather idioms · grades aren't saved"
  );
  // Every Card, oldest first, both directions together.
  await expect(page.getByText("1 / 4")).toBeVisible();
  await expect(page.getByText("Weather idioms · Term → Definition").first()).toBeVisible();
  await expect(page.getByText("drizzle", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Space");
  await page.keyboard.press("1"); // Again: repeated at the end.
  // Then drizzle Definition → Term, then the learned Card in both directions.
  const order: [string, string, string][] = [
    ["2 / 5", "Definition → Term", "light rain"],
    ["3 / 5", "Term → Definition", "gale"],
    ["4 / 5", "Definition → Term", "very strong wind"],
  ];
  for (const [counter, direction, prompt] of order) {
    await expect(page.getByText(counter)).toBeVisible();
    await expect(page.getByText(`Weather idioms · ${direction}`).first()).toBeVisible();
    await expect(page.getByText(prompt, { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Space");
    await page.keyboard.press("3");
  }
  // The repeat of drizzle Term → Definition, unflipped.
  await expect(page.getByText("5 / 5")).toBeVisible();
  await expect(page.getByText(hint)).toBeVisible();
  await page.keyboard.press("Space");
  await page.keyboard.press("4");

  await expect(page.getByText(practiceDoneLine)).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Weather idioms" })).toHaveAttribute(
    "href",
    `/flashcards/${flashcard.id}`
  );
  // Nothing was POSTed and no Scheduling Record changed. Grades POST in the
  // background, so give a stray one time to land before asserting.
  await page.waitForTimeout(500);
  expect(posts).toHaveLength(2);
  expect(await snapshot()).toEqual(before);

  // Another run starts from the first Card.
  await page.getByRole("button", { name: "Study all cards again" }).click();
  await expect(page.getByText("1 / 4")).toBeVisible();
  await expect(page.getByText(hint)).toBeVisible();
});

// spec-4-9: the practice run asks only the studied directions (FR-18).
test("Definition → Term only: Learn and the practice run ask Definition first, one direction per Card", async ({
  page,
}) => {
  const email = await register(page);
  const { flashcard } = await seed(email, [NEW_A, NEW_B]);
  await prisma.user.update({ where: { email }, data: { studyDirections: "DEFINITION_TO_TERM" } });
  const posts = await recordGrades(page);

  await page.goto(`/flashcards/${flashcard.id}/learn`);
  // Learn: one Definition → Term entry per Card.
  for (const [counter, prompt] of [["1 / 2", "light rain"], ["2 / 2", "sudden gust"]]) {
    await expect(page.getByText(counter)).toBeVisible();
    await expect(page.getByText("Weather idioms · Definition → Term").first()).toBeVisible();
    await expect(page.getByText(prompt, { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Space");
    await page.keyboard.press("3");
  }
  await expect(page.getByText(doneLine)).toBeVisible();
  await expect.poll(() => posts.length).toBe(2);

  await page.getByRole("button", { name: "Study all cards again" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Practicing Weather idioms · grades aren't saved"
  );
  for (const [counter, prompt] of [["1 / 2", "light rain"], ["2 / 2", "sudden gust"]]) {
    await expect(page.getByText(counter)).toBeVisible();
    await expect(page.getByText("Weather idioms · Definition → Term").first()).toBeVisible();
    await expect(page.getByText(prompt, { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Space");
    await page.keyboard.press("3");
  }
  await expect(page.getByText(practiceDoneLine)).toBeVisible();
  await expect(page.getByText("Term → Definition")).toHaveCount(0);
  expect(posts).toHaveLength(2);
});

test("an unknown Flashcard's Learn link offers a way back", async ({ page }) => {
  await register(page);
  await page.goto("/flashcards/does-not-exist/learn");
  await expect(page.getByText("This flashcard does not exist.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Classes" })).toHaveAttribute(
    "href",
    "/classes"
  );
});

// Visual check: screenshots land in test-results/screenshots for comparison
// against DESIGN.md and mockups/key-screens.html.
for (const theme of ["dark", "light"] as const) {
  for (const width of [1280, 390]) {
    test(`learn screenshots (${theme}, ${width}px)`, async ({ page }) => {
      mkdirSync("test-results/screenshots", { recursive: true });
      await page.setViewportSize({ width, height: 900 });
      const email = await register(page);
      const { flashcard } = await seed(email, [
        {
          term: "under the weather",
          definition: "slightly unwell",
          partOfSpeech: "idiom",
          example: "I'm feeling a bit under the weather today.",
        },
        NEW_B,
        LEARNED_DUE,
      ]);
      const setTheme = () =>
        page.evaluate((t) => {
          if (t === "light") document.documentElement.dataset.theme = "light";
          else delete document.documentElement.dataset.theme;
        }, theme);
      const shot = (name: string, fullPage = false) =>
        page.screenshot({
          path: `test-results/screenshots/learn-${name}-${theme}-${width}.png`,
          animations: "disabled",
          fullPage,
        });

      await page.goto(`/flashcards/${flashcard.id}`);
      await expect(page.getByRole("link", { name: "Learn · 2 new · 1 due" })).toBeVisible();
      await setTheme();
      await shot("detail", true);

      await page.goto(`/flashcards/${flashcard.id}/learn`);
      await expect(page.getByText("1 / 5")).toBeVisible();
      await setTheme();
      await shot("card");
      await page.keyboard.press("Space");
      await expect(page.getByRole("button", { name: /^Again/ })).toBeVisible();
      await shot("graded");
      for (let i = 0; i < 5; i++) {
        if (i > 0) await page.keyboard.press("Space");
        await page.keyboard.press("3");
      }
      await expect(page.getByText(doneLine)).toBeVisible();
      await shot("complete");

      // spec-4-8b: the unsaved practice run and its end state.
      await page.getByRole("button", { name: "Study all cards again" }).click();
      await expect(page.getByText("1 / 6")).toBeVisible();
      await shot("practice");
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Space");
        await page.keyboard.press("3");
      }
      await expect(page.getByText(practiceDoneLine)).toBeVisible();
      await shot("practice-complete");
    });
  }
}
