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

async function newUser(playwright: Pw, name = "Member Test"): Promise<Session> {
  const request = await playwright.request.newContext();
  const email = `member-xp-${randomUUID()}@example.test`;
  const response = await request.post(`${BASE}/api/auth/sign-up/email`, {
    headers: { Origin: BASE },
    data: { email, password: PASSWORD, name, timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id };
}

/** An Owner with a shared Class (2 Cards, 1 Flashcard), a Member with default records, a stranger. */
async function setup(playwright: Pw) {
  const owner = await newUser(playwright, "Olivia Owner");
  const member = await newUser(playwright, "Marco Member");
  const stranger = await newUser(playwright, "Sam Stranger");
  const created = await owner.request.post(`${BASE}/api/classes`, { data: { name: "Shared" } });
  const classId = (await created.json()).data.id as string;
  const folder = await prisma.folder.findFirstOrThrow({ where: { classId, isUnsorted: true } });
  const fc = await owner.request.post(`${BASE}/api/folders/${folder.id}/flashcards`, {
    data: { name: "Deck" },
  });
  const flashcardId = (await fc.json()).data.id as string;
  await owner.request.post(`${BASE}/api/cards/batch`, {
    data: {
      flashcardId,
      cards: [
        { term: "a", definition: "b" },
        { term: "c", definition: "d" },
      ],
    },
  });
  const cards = await prisma.card.findMany({ where: { flashcardId } });
  await prisma.classMember.create({ data: { classId, userId: member.userId } });
  await prisma.schedulingRecord.createMany({
    data: cards.flatMap((card) =>
      (["TERM_TO_DEFINITION", "DEFINITION_TO_TERM"] as const).map((direction) => ({
        cardId: card.id,
        userId: member.userId,
        direction,
        nextReviewDate: new Date(),
      }))
    ),
  });
  return { owner, member, stranger, classId, folderId: folder.id, flashcardId, cards };
}

async function gradeAll(who: Session, flashcardId: string) {
  const learn = await (
    await who.request.get(`${BASE}/api/review/learn?flashcardId=${flashcardId}`)
  ).json();
  for (const entry of learn.data.entries as { schedulingRecordId: string }[]) {
    const res = await who.request.post(`${BASE}/api/review/grade`, {
      data: { schedulingRecordId: entry.schedulingRecordId, grade: "good" },
    });
    expect(res.status()).toBe(200);
  }
}

const statsOf = async (who: Session) =>
  (await (await who.request.get(`${BASE}/api/stats`)).json()).data as {
    cards: { total: number; learned: number; unlearned: number };
  };

test.describe("member experience (spec-12-4)", () => {
  test("a Shared Class lists for the Member with owner fields and the Owner's counts", async ({
    playwright,
  }) => {
    const s = await setup(playwright);
    const own = await s.member.request.post(`${BASE}/api/classes`, { data: { name: "Mine" } });
    const ownId = (await own.json()).data.id as string;

    const list = (await (await s.member.request.get(`${BASE}/api/classes`)).json()).data as {
      id: string;
    }[];
    const shared = list.find((c) => c.id === s.classId);
    expect(shared).toMatchObject({
      ownerName: "Olivia Owner",
      isOwner: false,
      cardCount: 2,
      flashcardCount: 1,
      folderCount: 1,
      memberCount: 1,
    });
    expect(list.find((c) => c.id === ownId)).toMatchObject({
      isOwner: true,
      ownerName: "Marco Member",
    });
    const ownerList = (await (await s.owner.request.get(`${BASE}/api/classes`)).json()).data;
    expect(ownerList.find((c: { id: string }) => c.id === s.classId).isOwner).toBe(true);
    const strangerList = (await (await s.stranger.request.get(`${BASE}/api/classes`)).json())
      .data;
    expect(strangerList.some((c: { id: string }) => c.id === s.classId)).toBe(false);
  });

  test("folder, flashcard and class payloads carry isOwner, ownerName and memberCount", async ({
    playwright,
  }) => {
    const s = await setup(playwright);
    const paths = [
      `/api/classes/${s.classId}/folders`,
      `/api/folders/${s.folderId}`,
      `/api/folders/${s.folderId}/flashcards`,
      `/api/flashcards/${s.flashcardId}`,
    ];
    for (const path of paths) {
      const asMember = (await (await s.member.request.get(`${BASE}${path}`)).json()).data;
      expect(asMember, path).toMatchObject({
        isOwner: false,
        ownerName: "Olivia Owner",
        memberCount: 1,
      });
      const asOwner = (await (await s.owner.request.get(`${BASE}${path}`)).json()).data;
      expect(asOwner, path).toMatchObject({ isOwner: true, memberCount: 1 });
    }
  });

  test("Leave removes the membership and own records only; Owner 403, repeat 404, stranger 404", async ({
    playwright,
  }) => {
    const s = await setup(playwright);
    expect(
      (await s.owner.request.post(`${BASE}/api/classes/${s.classId}/members/leave`)).status()
    ).toBe(403);
    expect(
      (await s.stranger.request.post(`${BASE}/api/classes/${s.classId}/members/leave`)).status()
    ).toBe(404);

    const res = await s.member.request.post(`${BASE}/api/classes/${s.classId}/members/leave`);
    expect(res.status()).toBe(200);
    expect(await prisma.classMember.count({ where: { classId: s.classId } })).toBe(0);
    expect(await prisma.schedulingRecord.count({ where: { userId: s.member.userId } })).toBe(0);
    expect(await prisma.schedulingRecord.count({ where: { userId: s.owner.userId } })).toBe(4);

    expect(
      (await s.member.request.post(`${BASE}/api/classes/${s.classId}/members/leave`)).status()
    ).toBe(404);
    const list = (await (await s.member.request.get(`${BASE}/api/classes`)).json()).data;
    expect(list.some((c: { id: string }) => c.id === s.classId)).toBe(false);
    expect(
      (await s.member.request.get(`${BASE}/api/classes/${s.classId}/folders`)).status()
    ).toBe(404);
  });

  test("two learners grading the same Cards change only their own records", async ({
    playwright,
  }) => {
    const s = await setup(playwright);
    await gradeAll(s.member, s.flashcardId);
    const graded = (userId: string) =>
      prisma.schedulingRecord.count({ where: { userId, firstGradedAt: { not: null } } });
    expect(await graded(s.member.userId)).toBe(4);
    expect(await graded(s.owner.userId)).toBe(0);
    await gradeAll(s.owner, s.flashcardId);
    expect(await graded(s.owner.userId)).toBe(4);
    expect(await graded(s.member.userId)).toBe(4);
  });

  test("shared Cards count in the Member's stats and Learn count, including new Cards", async ({
    playwright,
  }) => {
    const s = await setup(playwright);
    expect(await statsOf(s.member)).toMatchObject({
      cards: { total: 2, learned: 0, unlearned: 2 },
    });
    await gradeAll(s.member, s.flashcardId);
    expect(await statsOf(s.member)).toMatchObject({
      cards: { total: 2, learned: 2, unlearned: 0 },
    });
    expect(await statsOf(s.owner)).toMatchObject({ cards: { total: 2, learned: 0 } });

    const add = await s.owner.request.post(`${BASE}/api/cards/batch`, {
      data: { flashcardId: s.flashcardId, cards: [{ term: "n", definition: "n" }] },
    });
    expect(add.status()).toBe(201);
    const detail = (
      await (await s.member.request.get(`${BASE}/api/flashcards/${s.flashcardId}`)).json()
    ).data;
    expect(detail.learn.newCards).toBe(1);
    expect(await statsOf(s.member)).toMatchObject({
      cards: { total: 3, learned: 2, unlearned: 1 },
    });
  });

  test("the Learn Flashcards quest counts a Member's shared Flashcard", async ({ playwright }) => {
    const s = await setup(playwright);
    type Quest = { kind: string; status: string; target: number | null; progress: number };
    const learnQuest = async (): Promise<Quest> => {
      const res = await s.member.request.get(`${BASE}/api/cultivation`);
      expect(res.status()).toBe(200);
      const quests = (await res.json()).data.quests as Quest[];
      return quests.find((q) => q.kind === "LEARN_FLASHCARDS")!;
    };
    // Day start: the shared Flashcard has unlearned records, so the quest is not skipped.
    const before = await learnQuest();
    expect(before.status).not.toBe("skipped");
    expect(before.target).toBe(1);
    expect(before.progress).toBe(0);
    await gradeAll(s.member, s.flashcardId);
    const after = await learnQuest();
    expect(after.progress).toBe(1);
    expect(after.status).toBe("ready");
  });

  test("the unscoped unlearned list includes a Member's shared Flashcards", async ({
    playwright,
  }) => {
    const s = await setup(playwright);
    const list = (await (await s.member.request.get(`${BASE}/api/review/unlearned`)).json()).data;
    expect(list.flashcards).toEqual([{ id: s.flashcardId, name: "Deck", newCards: 2 }]);
  });
});
