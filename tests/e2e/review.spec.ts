import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
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
 * Seeds one Card (both directions due now) in IELTS / Speaking / Weather
 * idioms, plus `extra` more Cards in the same Flashcard.
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
  const card = await prisma.card.create({
    data: {
      term: "drizzle",
      definition: "light rain",
      example: "It drizzled all morning.",
      flashcardId: flashcard.id,
      userId: user.id,
      schedulingRecords: {
        create: [
          { direction: "TERM_TO_DEFINITION", nextReviewDate: due },
          { direction: "DEFINITION_TO_TERM", nextReviewDate: due },
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
            { direction: "TERM_TO_DEFINITION", nextReviewDate: due },
            { direction: "DEFINITION_TO_TERM", nextReviewDate: due },
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

test("Review this flashcard opens a scoped session that names the scope", async ({ page }) => {
  const email = await register(page);
  const { flashcard } = await seedCard(email);
  await page.goto(`/flashcards/${flashcard.id}`);
  await page.getByRole("link", { name: "Review this flashcard" }).click();
  await expect(page).toHaveURL(`/review?flashcardId=${flashcard.id}`);

  const header = page.getByRole("heading", { level: 1 });
  await expect(header).toContainText("Reviewing flashcard Weather idioms");
  await expect(header.getByRole("link", { name: "Weather idioms" })).toHaveAttribute(
    "href",
    `/flashcards/${flashcard.id}`
  );
  await expect(page.getByText("1 / 2")).toBeVisible();
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

  await page.goto("/review?flashcardId=does-not-exist");
  await expect(page.getByText("This class, folder or flashcard does not exist.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Review all cards" })).toHaveAttribute(
    "href",
    "/review"
  );
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);

  await page.goto("/review?classId=a&folderId=b");
  await expect(page.getByText("This review link isn't valid.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Review all cards" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
});
