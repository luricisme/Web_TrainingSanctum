import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const BASE = "http://localhost:3100";

interface Session {
  request: APIRequestContext;
  userId: string;
}

type Pw = { request: { newContext: () => Promise<APIRequestContext> } };

async function newUser(playwright: Pw): Promise<Session> {
  const request = await playwright.request.newContext();
  const email = `access-${randomUUID()}@example.test`;
  const response = await request.post(`${BASE}/api/auth/sign-up/email`, {
    headers: { Origin: BASE },
    data: { email, password: PASSWORD, name: "Access Test", timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id };
}

/** An Owner with a Class (+ Unsorted), a Flashcard with one Card, a Member and a stranger. */
async function setup(playwright: Pw) {
  const owner = await newUser(playwright);
  const member = await newUser(playwright);
  const stranger = await newUser(playwright);

  const created = await owner.request.post(`${BASE}/api/classes`, { data: { name: "Shared" } });
  expect(created.status()).toBe(201);
  const classId = (await created.json()).data.id as string;
  const folder = await prisma.folder.findFirstOrThrow({ where: { classId, isUnsorted: true } });
  const flashcard = await owner.request.post(`${BASE}/api/folders/${folder.id}/flashcards`, {
    data: { name: "Deck" },
  });
  expect(flashcard.status()).toBe(201);
  const flashcardId = (await flashcard.json()).data.id as string;
  const cardRes = await owner.request.post(`${BASE}/api/cards/batch`, {
    data: { flashcardId, cards: [{ term: "a", definition: "b" }] },
  });
  expect(cardRes.status()).toBe(201);
  const card = await prisma.card.findFirstOrThrow({ where: { flashcardId } });

  await prisma.classMember.create({ data: { classId, userId: member.userId } });
  // Seed the Member's records as the app will when invitations land (12.3).
  await prisma.schedulingRecord.createMany({
    data: (["TERM_TO_DEFINITION", "DEFINITION_TO_TERM"] as const).map((direction) => ({
      cardId: card.id,
      userId: member.userId,
      direction,
      nextReviewDate: new Date(),
    })),
  });
  return { owner, member, stranger, classId, folderId: folder.id, flashcardId, cardId: card.id };
}

const recordCount = (cardId: string, userId?: string) =>
  prisma.schedulingRecord.count({ where: { cardId, ...(userId ? { userId } : {}) } });

test.describe("class access guards (spec-12-2)", () => {
  test("a Member's writes are 403 and a stranger's are 404, changing nothing", async ({
    playwright,
  }) => {
    const s = await setup(playwright);
    const writes: Array<[string, (r: APIRequestContext) => Promise<{ status(): number; json(): Promise<unknown> }>]> = [
      ["class", (r) => r.patch(`${BASE}/api/classes/${s.classId}`, { data: { name: "Hacked" } })],
      ["colour", (r) => r.patch(`${BASE}/api/classes/${s.classId}`, { data: { color: "ROSE" } })],
      [
        "class delete",
        (r) =>
          r.delete(`${BASE}/api/classes/${s.classId}`, {
            data: { mode: "delete", confirmName: "Shared" },
          }),
      ],
      ["folder", (r) => r.patch(`${BASE}/api/folders/${s.folderId}`, { data: { name: "X" } })],
      [
        "new folder",
        (r) => r.post(`${BASE}/api/classes/${s.classId}/folders`, { data: { name: "F2" } }),
      ],
      [
        "flashcard",
        (r) => r.patch(`${BASE}/api/flashcards/${s.flashcardId}`, { data: { name: "X" } }),
      ],
      [
        "new flashcard",
        (r) => r.post(`${BASE}/api/folders/${s.folderId}/flashcards`, { data: { name: "D2" } }),
      ],
      [
        "move",
        (r) =>
          r.post(`${BASE}/api/flashcards/${s.flashcardId}/move`, {
            data: { folderId: s.folderId },
          }),
      ],
      ["flashcard delete", (r) => r.delete(`${BASE}/api/flashcards/${s.flashcardId}`)],
      [
        "card",
        (r) =>
          r.patch(`${BASE}/api/cards/${s.cardId}`, { data: { term: "z", definition: "z" } }),
      ],
      ["card delete", (r) => r.delete(`${BASE}/api/cards/${s.cardId}`)],
      [
        "card batch",
        (r) =>
          r.post(`${BASE}/api/cards/batch`, {
            data: { flashcardId: s.flashcardId, cards: [{ term: "n", definition: "n" }] },
          }),
      ],
      [
        "import commit",
        (r) =>
          r.post(`${BASE}/api/cards/batch`, {
            data: {
              flashcardId: s.flashcardId,
              source: "import",
              cards: [{ line: 1, term: "n", definition: "n" }],
            },
          }),
      ],
      [
        "import parse",
        (r) =>
          r.post(`${BASE}/api/import/parse`, {
            data: {
              flashcardId: s.flashcardId,
              termSeparator: { kind: "tab" },
              cardSeparator: { kind: "newline" },
              text: "a\tb",
            },
          }),
      ],
    ];
    for (const [label, call] of writes) {
      const forbidden = await call(s.member.request);
      expect(forbidden.status(), `member ${label}`).toBe(403);
      if (label === "class") {
        expect((await (forbidden as { json(): Promise<unknown> }).json() as { error: { code: string } }).error.code).toBe("FORBIDDEN");
      }
      expect((await call(s.stranger.request)).status(), `stranger ${label}`).toBe(404);
    }
    const cls = await prisma.class.findUniqueOrThrow({ where: { id: s.classId } });
    expect(cls.name).toBe("Shared");
    expect(await prisma.card.count({ where: { flashcardId: s.flashcardId } })).toBe(1);
  });

  test("a Member reads and studies; a stranger gets 404", async ({ playwright }) => {
    const s = await setup(playwright);
    for (const path of [
      `/api/classes/${s.classId}/folders`,
      `/api/folders/${s.folderId}/flashcards`,
      `/api/flashcards/${s.flashcardId}`,
      `/api/review/queue?classId=${s.classId}`,
      `/api/review/unlearned?classId=${s.classId}`,
      `/api/review/learn?flashcardId=${s.flashcardId}`,
    ]) {
      expect((await s.member.request.get(`${BASE}${path}`)).status(), `member ${path}`).toBe(200);
      expect((await s.stranger.request.get(`${BASE}${path}`)).status(), `stranger ${path}`).toBe(
        404
      );
    }
    const detail = await (
      await s.member.request.get(`${BASE}/api/flashcards/${s.flashcardId}`)
    ).json();
    expect(detail.data.cards).toHaveLength(1);
    expect(detail.data.learn.newCards).toBe(1);

    // The Member learns on their own records only.
    const learn = await (
      await s.member.request.get(`${BASE}/api/review/learn?flashcardId=${s.flashcardId}`)
    ).json();
    expect(learn.data.entries).toHaveLength(2);
    const own = learn.data.entries[0].schedulingRecordId as string;
    const graded = await s.member.request.post(`${BASE}/api/review/grade`, {
      data: { schedulingRecordId: own, grade: "good" },
    });
    expect(graded.status()).toBe(200);

    const ownerRecord = await prisma.schedulingRecord.findFirstOrThrow({
      where: { cardId: s.cardId, userId: s.owner.userId },
    });
    expect(ownerRecord.firstGradedAt).toBeNull();
    const cross = await s.member.request.post(`${BASE}/api/review/grade`, {
      data: { schedulingRecordId: ownerRecord.id, grade: "good" },
    });
    expect(cross.status()).toBe(404);
  });

  test("the Owner's cards fan out to every learner", async ({ playwright }) => {
    const s = await setup(playwright);
    const second = await newUser(playwright);
    await prisma.classMember.create({ data: { classId: s.classId, userId: second.userId } });
    const res = await s.owner.request.post(`${BASE}/api/cards/batch`, {
      data: {
        flashcardId: s.flashcardId,
        cards: [
          { term: "x1", definition: "d" },
          { term: "x2", definition: "d" },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const cards = await prisma.card.findMany({
      where: { flashcardId: s.flashcardId, term: { in: ["x1", "x2"] } },
    });
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.userId).toBe(s.owner.userId);
      expect(await recordCount(card.id)).toBe(6);
      for (const id of [s.owner.userId, s.member.userId, second.userId]) {
        expect(await recordCount(card.id, id)).toBe(2);
      }
    }
    const imp = await s.owner.request.post(`${BASE}/api/cards/batch`, {
      data: {
        flashcardId: s.flashcardId,
        source: "import",
        cards: [{ line: 1, term: "i1", definition: "d" }],
      },
    });
    expect(imp.status()).toBe(200);
    const imported = await prisma.card.findFirstOrThrow({
      where: { term: "i1", flashcardId: s.flashcardId },
    });
    expect(await recordCount(imported.id)).toBe(6);
  });

  test("moving a Flashcard to another Class re-seeds learners in one step", async ({
    playwright,
  }) => {
    const s = await setup(playwright);
    const other = await s.owner.request.post(`${BASE}/api/classes`, { data: { name: "Solo" } });
    const otherClassId = (await other.json()).data.id as string;
    const otherFolder = await prisma.folder.findFirstOrThrow({
      where: { classId: otherClassId, isUnsorted: true },
    });
    expect(await recordCount(s.cardId)).toBe(4);

    const out = await s.owner.request.post(`${BASE}/api/flashcards/${s.flashcardId}/move`, {
      data: { folderId: otherFolder.id },
    });
    expect(out.status()).toBe(200);
    expect(await recordCount(s.cardId, s.member.userId)).toBe(0);
    expect(await recordCount(s.cardId, s.owner.userId)).toBe(2);

    // Back into the shared Class: the Member gets default records again.
    const back = await s.owner.request.post(`${BASE}/api/flashcards/${s.flashcardId}/move`, {
      data: { folderId: s.folderId },
    });
    expect(back.status()).toBe(200);
    expect(await recordCount(s.cardId, s.member.userId)).toBe(2);
    expect(await recordCount(s.cardId, s.owner.userId)).toBe(2);

    // The Owner cannot move into a Class they do not own.
    const foreign = await s.stranger.request.post(`${BASE}/api/classes`, {
      data: { name: "Theirs" },
    });
    const foreignFolder = await prisma.folder.findFirstOrThrow({
      where: { classId: (await foreign.json()).data.id, isUnsorted: true },
    });
    const bad = await s.owner.request.post(`${BASE}/api/flashcards/${s.flashcardId}/move`, {
      data: { folderId: foreignFolder.id },
    });
    expect(bad.status()).toBe(404);
  });

  test("deleting a Class removes every learner's records and memberships", async ({
    playwright,
  }) => {
    const s = await setup(playwright);
    expect(await recordCount(s.cardId)).toBe(4);
    const res = await s.owner.request.delete(`${BASE}/api/classes/${s.classId}`, {
      data: { mode: "delete", confirmName: "Shared" },
    });
    expect(res.status()).toBe(200);
    expect(await recordCount(s.cardId)).toBe(0);
    expect(await prisma.classMember.count({ where: { classId: s.classId } })).toBe(0);
  });

  test("memberCount counts Members, excluding the Owner", async ({ playwright }) => {
    const s = await setup(playwright);
    const list = await (await s.owner.request.get(`${BASE}/api/classes`)).json();
    expect(list.data.find((c: { id: string }) => c.id === s.classId).memberCount).toBe(1);
    const patched = await s.owner.request.patch(`${BASE}/api/classes/${s.classId}`, {
      data: { color: "SKY" },
    });
    expect((await patched.json()).data.memberCount).toBe(1);
    const fresh = await s.owner.request.post(`${BASE}/api/classes`, { data: { name: "Fresh" } });
    expect((await fresh.json()).data.memberCount).toBe(0);
  });

  test("deleting a shared Class in move mode re-seeds the moved Cards", async ({ playwright }) => {
    const s = await setup(playwright);
    // A second Flashcard with a Card in a custom Folder.
    const folderRes = await s.owner.request.post(`${BASE}/api/classes/${s.classId}/folders`, {
      data: { name: "Custom" },
    });
    const customFolderId = (await folderRes.json()).data.id as string;
    const fc = await s.owner.request.post(`${BASE}/api/folders/${customFolderId}/flashcards`, {
      data: { name: "Deck2" },
    });
    const flashcard2Id = (await fc.json()).data.id as string;
    await s.owner.request.post(`${BASE}/api/cards/batch`, {
      data: { flashcardId: flashcard2Id, cards: [{ term: "c2", definition: "d" }] },
    });
    const card2 = await prisma.card.findFirstOrThrow({ where: { flashcardId: flashcard2Id } });
    expect(await recordCount(card2.id, s.member.userId)).toBe(2);

    // Into a Solo Class: the Member's records are gone, the Owner keeps 2 each.
    const solo = await s.owner.request.post(`${BASE}/api/classes`, { data: { name: "Solo" } });
    const soloId = (await solo.json()).data.id as string;
    const soloUnsorted = await prisma.folder.findFirstOrThrow({
      where: { classId: soloId, isUnsorted: true },
    });
    const del = await s.owner.request.delete(`${BASE}/api/classes/${s.classId}`, {
      data: { mode: "move", targetClassId: soloId },
    });
    expect(del.status()).toBe(200);
    for (const cardId of [s.cardId, card2.id]) {
      expect(await recordCount(cardId, s.member.userId)).toBe(0);
      expect(await recordCount(cardId, s.owner.userId)).toBe(2);
    }
    const merged = await prisma.flashcard.findUniqueOrThrow({ where: { id: s.flashcardId } });
    expect(merged.folderId).toBe(soloUnsorted.id);

    // Into a target with a different Member: that Member gets defaults.
    const s2 = await setup(playwright);
    const other = await newUser(playwright);
    const target = await s2.owner.request.post(`${BASE}/api/classes`, { data: { name: "Target" } });
    const targetId = (await target.json()).data.id as string;
    await prisma.classMember.create({ data: { classId: targetId, userId: other.userId } });
    const del2 = await s2.owner.request.delete(`${BASE}/api/classes/${s2.classId}`, {
      data: { mode: "move", targetClassId: targetId },
    });
    expect(del2.status()).toBe(200);
    expect(await recordCount(s2.cardId, other.userId)).toBe(2);
    expect(await recordCount(s2.cardId, s2.member.userId)).toBe(0);
    expect(await recordCount(s2.cardId, s2.owner.userId)).toBe(2);
  });

  test("a Member's scoped unlearned list and queue reflect their own records", async ({
    playwright,
  }) => {
    const s = await setup(playwright);
    const unlearned = await (
      await s.member.request.get(`${BASE}/api/review/unlearned?classId=${s.classId}`)
    ).json();
    expect(unlearned.data.flashcards).toEqual([
      { id: s.flashcardId, name: "Deck", newCards: 1 },
    ]);

    const record = await prisma.schedulingRecord.findFirstOrThrow({
      where: { cardId: s.cardId, userId: s.member.userId, direction: "TERM_TO_DEFINITION" },
    });
    const graded = await s.member.request.post(`${BASE}/api/review/grade`, {
      data: { schedulingRecordId: record.id, grade: "good" },
    });
    expect(graded.status()).toBe(200);
    await prisma.schedulingRecord.update({
      where: { id: record.id },
      data: { nextReviewDate: new Date(Date.now() - 60_000) },
    });
    const queue = await (
      await s.member.request.get(`${BASE}/api/review/queue?classId=${s.classId}`)
    ).json();
    expect(
      queue.data.entries.map((e: { schedulingRecordId: string }) => e.schedulingRecordId)
    ).toEqual([record.id]);
  });

  test("an Owner who is only a Member of the target Class cannot move into it", async ({
    playwright,
  }) => {
    const s = await setup(playwright);
    const theirs = await s.stranger.request.post(`${BASE}/api/classes`, {
      data: { name: "Theirs" },
    });
    const theirsId = (await theirs.json()).data.id as string;
    const theirFolder = await prisma.folder.findFirstOrThrow({
      where: { classId: theirsId, isUnsorted: true },
    });
    await prisma.classMember.create({ data: { classId: theirsId, userId: s.owner.userId } });
    const res = await s.owner.request.post(`${BASE}/api/flashcards/${s.flashcardId}/move`, {
      data: { folderId: theirFolder.id },
    });
    expect(res.status()).toBe(403);
    expect(await recordCount(s.cardId)).toBe(4);
    const fc = await prisma.flashcard.findUniqueOrThrow({ where: { id: s.flashcardId } });
    expect(fc.folderId).toBe(s.folderId);
  });
});
