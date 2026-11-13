import { test, expect, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { prisma } from "@training-sanctum/db";

async function register(page: Page): Promise<string> {
  const email = `e2e-viewer-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Viewer E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  return email;
}

const TERMS = ["alpha", "bravo", "charlie"];

/**
 * Seeds IELTS / Speaking / Weather idioms with `count` Cards. The list is
 * newest first, so creation times run backwards: the list (and the viewer)
 * reads alpha, bravo, charlie. Card 1 is learned, the rest are new.
 */
async function seedCards(email: string, count = 3) {
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
  const due = new Date(now - 60_000);
  for (let i = 0; i < count; i++) {
    const firstGradedAt = i === 0 ? new Date(now - 7 * 86_400_000) : null;
    await prisma.card.create({
      data: {
        term: TERMS[i] ?? `term ${i}`,
        definition: `definition of ${TERMS[i] ?? i}`,
        example: i === 0 ? "An alpha example." : null,
        partOfSpeech: i === 0 ? "noun" : null,
        createdAt: new Date(now - i * 60_000),
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
  return { flashcard };
}

function viewerOf(page: Page) {
  const viewer = page.getByRole("region", { name: "Card viewer" });
  return {
    viewer,
    card: viewer.getByRole("button").first(),
    prev: viewer.getByRole("button", { name: "Previous card" }),
    next: viewer.getByRole("button", { name: "Next card" }),
    counter: (text: string) => viewer.getByText(text, { exact: true }),
  };
}

/** The face holding `text` is the one showing. */
async function expectShowing(card: Locator, text: string) {
  await expect(card.getByText(text, { exact: true }).locator("..")).toHaveAttribute(
    "aria-hidden",
    "false"
  );
}

test("opens on Card 1, Term side; Space flips both ways without scrolling; arrows move with no wrap", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  const email = await register(page);
  const { flashcard } = await seedCards(email);
  await page.goto(`/flashcards/${flashcard.id}`);
  const { card, prev, next, counter } = viewerOf(page);

  await expect(counter("1 / 3")).toBeVisible();
  await expectShowing(card, "alpha");
  await expect(card.getByText("Term", { exact: true })).toBeVisible();
  await expect(prev).toBeDisabled();
  await expect(next).toBeEnabled();

  // ← on Card 1 does nothing.
  await page.keyboard.press("ArrowLeft");
  await expect(counter("1 / 3")).toBeVisible();

  await page.keyboard.press("Space");
  await expectShowing(card, "definition of alpha");
  await expect(card.getByText("noun", { exact: true })).toBeVisible();
  await expect(card.getByText("An alpha example.", { exact: true })).toBeVisible();
  await page.keyboard.press("Space");
  await expectShowing(card, "alpha");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  // Flip, then move: the next Card shows Term side up.
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await expect(counter("2 / 3")).toBeVisible();
  await expectShowing(card, "bravo");
  await expect(prev).toBeEnabled();

  await page.keyboard.press("ArrowRight");
  await expect(counter("3 / 3")).toBeVisible();
  await expectShowing(card, "charlie");
  await expect(next).toBeDisabled();

  // → on the last Card does nothing: no wrap-around.
  await page.keyboard.press("ArrowRight");
  await expect(counter("3 / 3")).toBeVisible();
  await expectShowing(card, "charlie");

  await page.keyboard.press("ArrowLeft");
  await expect(counter("2 / 3")).toBeVisible();
  // Modified arrows belong to the browser, not the viewer.
  await page.keyboard.press("Alt+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(counter("2 / 3")).toBeVisible();
});

test("click flips; the arrow buttons move; focus rings show on every control", async ({
  page,
}) => {
  const email = await register(page);
  const { flashcard } = await seedCards(email);
  await page.goto(`/flashcards/${flashcard.id}`);
  const { card, prev, next, counter } = viewerOf(page);
  await expect(counter("1 / 3")).toBeVisible();

  await card.click();
  await expectShowing(card, "definition of alpha");
  await card.click();
  await expectShowing(card, "alpha");

  await next.click();
  await expect(counter("2 / 3")).toBeVisible();
  await expectShowing(card, "bravo");
  await next.click();
  await expect(counter("3 / 3")).toBeVisible();
  await expect(next).toBeDisabled();
  await prev.click();
  await expect(counter("2 / 3")).toBeVisible();

  // Keyboard focus: every control draws the shared focus ring.
  for (const control of [card, prev, next]) {
    await control.focus();
    await page.keyboard.press("Shift");
    await expect(control).toHaveCSS("outline-style", "solid");
    await expect(control).toHaveCSS("outline-width", "2px");
  }
});

test("keys are ignored while the Add cards panel is open", async ({ page }) => {
  const email = await register(page);
  const { flashcard } = await seedCards(email);
  await page.goto(`/flashcards/${flashcard.id}`);
  const { card, counter } = viewerOf(page);
  await expect(counter("1 / 3")).toBeVisible();

  await page.getByRole("button", { name: "Add cards" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Term, row 1")).toBeFocused();

  // Typing in a field.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  // Nothing focused, panel still open.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(dialog).toBeVisible();

  await expect(counter("1 / 3")).toBeVisible();
  await expectShowing(card, "alpha");
});

test("deleting the last Card while viewing it clamps to the new last; edits show at once", async ({
  page,
}) => {
  const email = await register(page);
  const { flashcard } = await seedCards(email);
  await page.goto(`/flashcards/${flashcard.id}`);
  const { card, counter } = viewerOf(page);
  await expect(counter("1 / 3")).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(counter("3 / 3")).toBeVisible();

  await page.getByRole("button", { name: "Delete card 3: charlie" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete card" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(counter("2 / 2")).toBeVisible();
  await expectShowing(card, "bravo");

  await page.getByRole("button", { name: "Edit card 2: bravo" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Term", { exact: true }).fill("bravissimo");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expectShowing(card, "bravissimo");
  await expect(counter("2 / 2")).toBeVisible();
});

test("arrows keep keyboard focus in the row when one disables", async ({ page }) => {
  const email = await register(page);
  const { flashcard } = await seedCards(email);
  await page.goto(`/flashcards/${flashcard.id}`);
  const { prev, next, counter } = viewerOf(page);
  await expect(counter("1 / 3")).toBeVisible();

  // By click.
  await next.click();
  await next.click();
  await expect(counter("3 / 3")).toBeVisible();
  await expect(prev).toBeFocused();
  await prev.click();
  await prev.click();
  await expect(counter("1 / 3")).toBeVisible();
  await expect(next).toBeFocused();

  // By arrow keys with a nav button focused.
  await next.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(counter("3 / 3")).toBeVisible();
  await expect(prev).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(counter("1 / 3")).toBeVisible();
  await expect(next).toBeFocused();
});

test("Space on another control presses it instead of flipping the viewer", async ({ page }) => {
  const email = await register(page);
  const { flashcard } = await seedCards(email);
  await page.goto(`/flashcards/${flashcard.id}`);
  const { card, counter } = viewerOf(page);
  await expect(counter("1 / 3")).toBeVisible();

  await page.getByRole("button", { name: "Edit card 1: alpha" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Edit card" })).toBeVisible();
  await expectShowing(card, "alpha");

  // Space on the flip card itself still flips it.
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await card.focus();
  await page.keyboard.press("Space");
  await expectShowing(card, "definition of alpha");
});

test("keys are ignored while the Delete and Edit modals are open", async ({ page }) => {
  const email = await register(page);
  const { flashcard } = await seedCards(email);
  await page.goto(`/flashcards/${flashcard.id}`);
  const { card, counter } = viewerOf(page);
  await expect(counter("1 / 3")).toBeVisible();
  const dialog = page.getByRole("dialog");

  for (const open of ["Delete card 1: alpha", "Edit card 1: alpha"]) {
    await page.getByRole("button", { name: open }).click();
    await expect(dialog).toBeVisible();
    // A non-text control in the modal has focus.
    await dialog.getByRole("button", { name: "Cancel" }).focus();
    await page.keyboard.press("ArrowRight");
    // Nothing focused, modal still open.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await expect(dialog).toBeVisible();
    await expect(counter("1 / 3")).toBeVisible();
    await expectShowing(card, "alpha");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  }
});

test("adding a Card keeps the viewer on the Card it shows", async ({ page }) => {
  const email = await register(page);
  const { flashcard } = await seedCards(email);
  await page.goto(`/flashcards/${flashcard.id}`);
  const { card, counter } = viewerOf(page);
  await expect(counter("1 / 3")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(counter("2 / 3")).toBeVisible();

  await page.getByRole("button", { name: "Add cards" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Term, row 1").fill("delta");
  await dialog.getByLabel("Definition, row 1").fill("definition of delta");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await expect(counter("3 / 4")).toBeVisible();
  await expectShowing(card, "bravo");
});

test("an empty Flashcard has no viewer, only its empty state", async ({ page }) => {
  const email = await register(page);
  const { flashcard } = await seedCards(email, 0);
  await page.goto(`/flashcards/${flashcard.id}`);
  await expect(page.getByText("Add cards to start studying this flashcard.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Card viewer" })).toHaveCount(0);
});

test("touch swipes move between Cards; short swipes and mouse drags do not", async ({
  page,
}) => {
  const email = await register(page);
  const { flashcard } = await seedCards(email);
  await page.goto(`/flashcards/${flashcard.id}`);
  const { card, counter } = viewerOf(page);
  await expect(counter("1 / 3")).toBeVisible();

  async function swipe(pointerType: string, dx: number, dy: number) {
    const base = { bubbles: true, pointerId: 1, isPrimary: true, pointerType };
    await card.dispatchEvent("pointerdown", { ...base, clientX: 200, clientY: 200 });
    await card.dispatchEvent("pointerup", { ...base, clientX: 200 + dx, clientY: 200 + dy });
  }

  await swipe("touch", -40, 0);
  await swipe("mouse", -200, 0);
  await swipe("touch", -10, -80);
  await expect(counter("1 / 3")).toBeVisible();

  await swipe("touch", -60, 10);
  await expect(counter("2 / 3")).toBeVisible();
  await swipe("pen", -60, 0);
  await expect(counter("3 / 3")).toBeVisible();
  // A swipe past the last Card does nothing and does not swallow the next flip.
  await swipe("touch", -60, 0);
  await expect(counter("3 / 3")).toBeVisible();
  await card.click();
  await expectShowing(card, "definition of charlie");
  await swipe("touch", 60, 0);
  await expect(counter("2 / 3")).toBeVisible();
  await expectShowing(card, "bravo");

  // A tap (a touch that barely moves, then its click) still flips.
  await swipe("touch", 2, 0);
  await card.click();
  await expectShowing(card, "definition of bravo");
});

test("viewing never changes a Scheduling Record", async ({ page }) => {
  const email = await register(page);
  const { flashcard } = await seedCards(email);
  const snapshot = async () =>
    (
      await prisma.schedulingRecord.findMany({
        where: { card: { flashcardId: flashcard.id } },
        orderBy: { id: "asc" },
      })
    ).map(({ id, interval, repetitions, easeFactor, nextReviewDate, firstGradedAt, updatedAt }) => ({
      id,
      interval,
      repetitions,
      easeFactor,
      nextReviewDate: nextReviewDate.toISOString(),
      firstGradedAt: firstGradedAt?.toISOString() ?? null,
      updatedAt: updatedAt.toISOString(),
    }));
  const before = await snapshot();
  const graded: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/review/")) graded.push(request.url());
  });

  await page.goto(`/flashcards/${flashcard.id}`);
  const { card, next, counter } = viewerOf(page);
  await expect(counter("1 / 3")).toBeVisible();
  for (const key of ["Space", "Space", "ArrowRight", "Space", "ArrowRight", "Space", "ArrowLeft"]) {
    await page.keyboard.press(key);
  }
  await expect(counter("2 / 3")).toBeVisible();
  await card.click();
  await next.click();
  await expect(counter("3 / 3")).toBeVisible();

  expect(graded).toEqual([]);
  expect(await snapshot()).toEqual(before);
});

// Visual check: screenshots land in test-results/screenshots.
for (const theme of ["dark", "light"] as const) {
  for (const width of [1280, 390]) {
    test(`card viewer screenshots (${theme}, ${width}px)`, async ({ page }) => {
      mkdirSync("test-results/screenshots", { recursive: true });
      await page.setViewportSize({ width, height: 900 });
      const email = await register(page);
      const { flashcard } = await seedCards(email);
      const first = await prisma.card.findFirstOrThrow({
        where: { flashcardId: flashcard.id, term: "alpha" },
      });
      await prisma.card.update({
        where: { id: first.id },
        data: {
          term: "under the weather",
          definition: "slightly ill",
          partOfSpeech: "idiom",
          example: "I'm feeling a bit under the weather today.",
        },
      });
      await page.goto(`/flashcards/${flashcard.id}`);
      const { counter } = viewerOf(page);
      await expect(counter("1 / 3")).toBeVisible();
      await page.evaluate((t) => {
        if (t === "light") document.documentElement.dataset.theme = "light";
        else delete document.documentElement.dataset.theme;
      }, theme);
      const shot = (name: string) =>
        page.screenshot({
          path: `test-results/screenshots/viewer-${name}-${theme}-${width}.png`,
          animations: "disabled",
        });

      await shot("front");
      await page.keyboard.press("Space");
      await shot("back");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await expect(counter("3 / 3")).toBeVisible();
      await page.getByRole("button", { name: "Previous card" }).focus();
      await page.keyboard.press("Shift");
      await shot("last");
    });
  }
}
