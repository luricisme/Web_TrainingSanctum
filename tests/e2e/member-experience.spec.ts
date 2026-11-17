import { test, expect, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

const PASSWORD = "correct-horse-battery";

async function register(page: Page, name: string): Promise<string> {
  const email = `e2e-member-${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/review");
  return email;
}

async function second(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = await register(page, name);
  return { page, email, context };
}

interface Shared {
  classId: string;
  folderId: string;
  flashcardId: string;
}

/** The Owner builds Class > Folder > Flashcard (2 Cards) and the Member accepts an invitation. */
async function shareClass(owner: Page, member: Page, memberEmail: string, className: string) {
  const created = await owner.request.post("/api/classes", { data: { name: className } });
  const classId = (await created.json()).data.id as string;
  const folder = await owner.request.post(`/api/classes/${classId}/folders`, {
    data: { name: "Speaking" },
  });
  const folderId = (await folder.json()).data.id as string;
  const fc = await owner.request.post(`/api/folders/${folderId}/flashcards`, {
    data: { name: "Weather idioms" },
  });
  const flashcardId = (await fc.json()).data.id as string;
  await owner.request.post("/api/cards/batch", {
    data: {
      flashcardId,
      cards: [
        { term: "under the weather", definition: "slightly ill" },
        { term: "a storm in a teacup", definition: "much fuss about little" },
      ],
    },
  });
  const invite = await owner.request.post(`/api/classes/${classId}/invitations`, {
    data: { email: memberEmail },
  });
  expect(invite.status()).toBe(201);
  const pending = await (await member.request.get("/api/invitations")).json();
  const invitationId = (pending.data as { id: string }[])[0].id;
  const accepted = await member.request.post(`/api/invitations/${invitationId}/accept`);
  expect(accepted.ok()).toBeTruthy();
  return { classId, folderId, flashcardId } satisfies Shared;
}

test("a Member sees the Shared Class, browses it read-only, studies it and leaves", async ({
  page,
  browser,
}) => {
  await register(page, "Luric Owner");
  const friend = await second(browser, "Friend Member");
  const mine = await friend.page.request.post("/api/classes", { data: { name: "My own" } });
  expect(mine.status()).toBe(201);
  const s = await shareClass(page, friend.page, friend.email, "IELTS");
  const fp = friend.page;

  // Grid: both tiles; the shared one is labelled, with Leave only.
  await fp.goto("/classes");
  const shared = fp.locator("li", { has: fp.getByRole("link", { name: "IELTS" }) });
  await expect(shared).toContainText("Luric Owner's");
  await expect(fp.locator("li", { has: fp.getByRole("link", { name: "My own" }) })).not.toContainText(
    "'s"
  );
  await fp.getByRole("button", { name: "Options for IELTS" }).click();
  await expect(fp.getByRole("menuitem")).toHaveText(["Leave"]);
  await fp.keyboard.press("Escape");
  await fp.getByRole("button", { name: "Options for My own" }).click();
  await expect(fp.getByRole("menuitem", { name: "Share" })).toBeVisible();
  await fp.keyboard.press("Escape");

  // Class detail: header, no write controls, Review present.
  await fp.goto(`/classes/${s.classId}`);
  await expect(fp.getByText("Luric Owner's class")).toBeVisible();
  await expect(fp.getByRole("link", { name: "Review this class" })).toBeVisible();
  await expect(fp.getByRole("button", { name: "Create folder" })).toHaveCount(0);
  await expect(fp.getByRole("button", { name: /^Options for/ })).toHaveCount(0);

  // Folder detail.
  await fp.goto(`/folders/${s.folderId}`);
  await expect(fp.getByText("Luric Owner's class")).toBeVisible();
  await expect(fp.getByRole("link", { name: "Review this folder" })).toBeVisible();
  await expect(fp.getByRole("button", { name: "Create flashcard" })).toHaveCount(0);
  await expect(fp.getByRole("button", { name: /^Options for/ })).toHaveCount(0);

  // Flashcard detail: viewer and Learn only; Learn counts the Owner's Cards.
  await fp.goto(`/flashcards/${s.flashcardId}`);
  await expect(fp.getByText("Luric Owner's class")).toBeVisible();
  await expect(fp.getByRole("link", { name: /^Learn/ })).toBeVisible();
  await expect(fp.getByRole("link", { name: /^Learn/ })).toContainText("2 new");
  await expect(fp.getByRole("button", { name: "Add cards" })).toHaveCount(0);
  await expect(fp.getByRole("button", { name: /^(Edit|Delete) card/ })).toHaveCount(0);

  // The Owner adds a Card: the Member's Learn count rises by one Card.
  await page.request.post("/api/cards/batch", {
    data: { flashcardId: s.flashcardId, cards: [{ term: "raining cats", definition: "heavy rain" }] },
  });
  await fp.reload();
  await expect(fp.getByRole("link", { name: /^Learn/ })).toContainText("3 new");

  // A Member's write attempt is still forbidden.
  const write = await fp.request.patch(`/api/folders/${s.folderId}`, { data: { name: "Nope" } });
  expect(write.status()).toBe(403);

  // Leave: confirm text, tile disappears, access gone.
  await fp.goto("/classes");
  await fp.getByRole("button", { name: "Options for IELTS" }).click();
  await fp.getByRole("menuitem", { name: "Leave" }).click();
  const dialog = fp.getByRole("dialog", { name: "Leave IELTS" });
  await expect(dialog).toContainText("Leave IELTS? Your progress in it will be deleted.");
  await dialog.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(fp.getByRole("link", { name: "IELTS" })).toHaveCount(0);
  expect((await fp.request.get(`/api/classes/${s.classId}/folders`)).status()).toBe(404);
  await friend.context.close();
});

test("the Owner's delete and move confirmations carry the member-count line only when N > 0", async ({
  page,
  browser,
}) => {
  await register(page, "Owner Counts");
  const a = await second(browser, "Ann Member");
  const b = await second(browser, "Bo Member");
  const s = await shareClass(page, a.page, a.email, "Counted");
  const inviteB = await page.request.post(`/api/classes/${s.classId}/invitations`, {
    data: { email: b.email },
  });
  expect(inviteB.status()).toBe(201);
  const pendingB = await (await b.page.request.get("/api/invitations")).json();
  await b.page.request.post(`/api/invitations/${(pendingB.data as { id: string }[])[0].id}/accept`);
  const solo = await page.request.post("/api/classes", { data: { name: "Solo" } });
  expect(solo.status()).toBe(201);

  // Class delete.
  await page.goto("/classes");
  await page.getByRole("button", { name: "Options for Counted" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toContainText("2 members are studying this.");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Options for Solo" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).not.toContainText("studying this");
  await page.keyboard.press("Escape");

  // Folder delete and Card delete.
  await page.goto(`/classes/${s.classId}`);
  await page.getByRole("button", { name: "Options for Speaking" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toContainText("2 members are studying this.");
  await page.keyboard.press("Escape");
  await page.goto(`/flashcards/${s.flashcardId}`);
  await page.getByRole("button", { name: /^Delete card 1:/ }).click();
  await expect(page.getByRole("dialog")).toContainText("2 members are studying this.");
  await page.keyboard.press("Escape");

  // Flashcard delete and cross-Class move.
  await page.goto(`/folders/${s.folderId}`);
  await page.getByRole("button", { name: "Options for Weather idioms" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toContainText("2 members are studying this.");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Options for Weather idioms" }).click();
  await page.getByRole("menuitem", { name: "Move to…" }).click();
  const move = page.getByRole("dialog", { name: "Move flashcard" });
  await expect(move).not.toContainText("will lose it");
  await move.getByLabel("Class").selectOption({ label: "Solo" });
  await expect(move).toContainText("2 members will lose it.");
  await page.keyboard.press("Escape");

  await a.context.close();
  await b.context.close();
});

// Visual check: screenshots land in test-results/screenshots for comparison
// against DESIGN.md.
for (const theme of ["dark", "light"] as const) {
  test(`member screens screenshots (${theme})`, async ({ page, browser }) => {
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await register(page, "Luric Owner");
    const friend = await second(browser, "Mai Tran");
    await friend.page.setViewportSize({ width: 1280, height: 800 });
    await friend.page.request.post("/api/classes", { data: { name: "My own deck" } });
    const s = await shareClass(page, friend.page, friend.email, "IELTS Academic");
    const fp = friend.page;
    const shot = async (p: Page, name: string) => {
      await p.evaluate((t) => {
        if (t === "light") document.documentElement.dataset.theme = "light";
        else delete document.documentElement.dataset.theme;
      }, theme);
      await p.screenshot({
        path: `test-results/screenshots/member-${name}-${theme}.png`,
        animations: "disabled",
      });
    };

    await fp.goto("/classes");
    await expect(fp.getByText("Luric Owner's")).toBeVisible();
    await shot(fp, "grid");
    await fp.getByRole("button", { name: "Options for IELTS Academic" }).click();
    await shot(fp, "grid-menu");
    await fp.getByRole("menuitem", { name: "Leave" }).click();
    await shot(fp, "leave-confirm");
    await fp.keyboard.press("Escape");
    await fp.goto(`/classes/${s.classId}`);
    await expect(fp.getByText("Luric Owner's class")).toBeVisible();
    await shot(fp, "class");
    await fp.goto(`/folders/${s.folderId}`);
    await expect(fp.getByText("Luric Owner's class")).toBeVisible();
    await shot(fp, "folder");
    await fp.goto(`/flashcards/${s.flashcardId}`);
    await expect(fp.getByText("Luric Owner's class")).toBeVisible();
    await shot(fp, "flashcard");

    await page.goto(`/folders/${s.folderId}`);
    await page.getByRole("button", { name: "Options for Weather idioms" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByRole("dialog")).toContainText("1 member is studying this.");
    await shot(page, "owner-delete-flashcard");
    await friend.context.close();
  });
}
