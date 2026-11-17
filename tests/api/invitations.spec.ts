import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";
const BASE = "http://localhost:3100";

interface Session {
  request: APIRequestContext;
  userId: string;
  email: string;
}

type Pw = { request: { newContext: () => Promise<APIRequestContext> } };

async function newUser(playwright: Pw, name = "Invite Test"): Promise<Session> {
  const request = await playwright.request.newContext();
  const email = `invite-${randomUUID()}@example.test`;
  const response = await request.post(`${BASE}/api/auth/sign-up/email`, {
    headers: { Origin: BASE },
    data: { email, password: PASSWORD, name, timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id, email };
}

/** An Owner with a Class holding one Flashcard of `cards` Cards. */
async function setupClass(playwright: Pw, cards = 3) {
  const owner = await newUser(playwright, "Owner Test");
  const created = await owner.request.post(`${BASE}/api/classes`, { data: { name: "Shared" } });
  const classId = (await created.json()).data.id as string;
  const folder = await prisma.folder.findFirstOrThrow({ where: { classId, isUnsorted: true } });
  const flashcard = await owner.request.post(`${BASE}/api/folders/${folder.id}/flashcards`, {
    data: { name: "Deck" },
  });
  const flashcardId = (await flashcard.json()).data.id as string;
  if (cards > 0) {
    const res = await owner.request.post(`${BASE}/api/cards/batch`, {
      data: {
        flashcardId,
        cards: Array.from({ length: cards }, (_, i) => ({ term: `t${i}`, definition: `d${i}` })),
      },
    });
    expect(res.status()).toBe(201);
  }
  return { owner, classId, flashcardId };
}

const invite = (owner: Session, classId: string, email: string) =>
  owner.request.post(`${BASE}/api/classes/${classId}/invitations`, { data: { email } });

const recordsOf = (userId: string, classId: string) =>
  prisma.schedulingRecord.count({
    where: { userId, card: { flashcard: { folder: { classId } } } },
  });

test.describe("invitations (spec-12-3)", () => {
  test("invite creates a PENDING row; the invitee sees it with owner, class and card count", async ({
    playwright,
  }) => {
    const { owner, classId } = await setupClass(playwright);
    const friend = await newUser(playwright);
    const res = await invite(owner, classId, `  ${friend.email.toUpperCase()} `);
    expect(res.status()).toBe(201);
    const body = (await res.json()).data;
    expect(body.status).toBe("PENDING");
    expect(body.email).toBe(friend.email);

    const list = await (await friend.request.get(`${BASE}/api/invitations`)).json();
    expect(list.data).toEqual([
      { id: body.id, classId, className: "Shared", ownerName: "Owner Test", cardCount: 3 },
    ]);
    const share = await (
      await owner.request.get(`${BASE}/api/classes/${classId}/invitations`)
    ).json();
    expect(share.data.invitations).toHaveLength(1);
    expect(share.data.members).toHaveLength(0);
  });

  test("bad emails are field-level errors and create nothing", async ({ playwright }) => {
    const { owner, classId } = await setupClass(playwright);
    const friend = await newUser(playwright);
    const member = await newUser(playwright);
    await prisma.classMember.create({ data: { classId, userId: member.userId } });
    expect((await invite(owner, classId, friend.email)).status()).toBe(201);

    const cases: Array<[string, string]> = [
      [`nobody-${randomUUID()}@example.test`, "No account"],
      [owner.email, "own email"],
      [member.email, "member"],
      [friend.email, "invited"],
    ];
    for (const [email, text] of cases) {
      const res = await invite(owner, classId, email);
      expect(res.status(), email).toBe(400);
      const error = (await res.json()).error;
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.fields.email).toContain(text);
    }
    expect(await prisma.classInvitation.count({ where: { classId } })).toBe(1);
  });

  test("accept makes a Member with 2 records per Card and marks ACCEPTED", async ({
    playwright,
  }) => {
    const { owner, classId } = await setupClass(playwright, 3);
    const friend = await newUser(playwright);
    const id = (await (await invite(owner, classId, friend.email)).json()).data.id as string;

    const res = await friend.request.post(`${BASE}/api/invitations/${id}/accept`);
    expect(res.status()).toBe(200);
    expect((await res.json()).data.classId).toBe(classId);

    expect(await prisma.classMember.count({ where: { classId, userId: friend.userId } })).toBe(1);
    expect(await recordsOf(friend.userId, classId)).toBe(6);
    const row = await prisma.classInvitation.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("ACCEPTED");
    expect(row.respondedAt).not.toBeNull();
    expect((await (await friend.request.get(`${BASE}/api/invitations`)).json()).data).toEqual([]);

    // Answering twice changes nothing.
    expect((await friend.request.post(`${BASE}/api/invitations/${id}/accept`)).status()).toBe(409);
    expect((await friend.request.post(`${BASE}/api/invitations/${id}/decline`)).status()).toBe(409);
    expect(await recordsOf(friend.userId, classId)).toBe(6);
  });

  test("a non-invitee gets 404 on accept and decline and nothing changes", async ({
    playwright,
  }) => {
    const { owner, classId } = await setupClass(playwright);
    const friend = await newUser(playwright);
    const stranger = await newUser(playwright);
    const id = (await (await invite(owner, classId, friend.email)).json()).data.id as string;

    for (const who of [stranger, owner]) {
      expect((await who.request.post(`${BASE}/api/invitations/${id}/accept`)).status()).toBe(404);
      expect((await who.request.post(`${BASE}/api/invitations/${id}/decline`)).status()).toBe(404);
    }
    const row = await prisma.classInvitation.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("PENDING");
    expect(await prisma.classMember.count({ where: { classId } })).toBe(0);
  });

  test("decline marks DECLINED; re-inviting reuses the row back to PENDING", async ({
    playwright,
  }) => {
    const { owner, classId } = await setupClass(playwright);
    const friend = await newUser(playwright);
    const id = (await (await invite(owner, classId, friend.email)).json()).data.id as string;

    expect((await friend.request.post(`${BASE}/api/invitations/${id}/decline`)).status()).toBe(200);
    const declined = await prisma.classInvitation.findUniqueOrThrow({ where: { id } });
    expect(declined.status).toBe("DECLINED");
    expect(declined.respondedAt).not.toBeNull();
    expect(await prisma.classMember.count({ where: { classId } })).toBe(0);
    expect(await recordsOf(friend.userId, classId)).toBe(0);

    const again = await invite(owner, classId, friend.email);
    expect(again.status()).toBe(201);
    expect((await again.json()).data.id).toBe(id);
    const row = await prisma.classInvitation.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("PENDING");
    expect(row.respondedAt).toBeNull();
    expect(await prisma.classInvitation.count({ where: { classId } })).toBe(1);
  });

  test("cancel: owner deletes, Member 403, stranger 404", async ({ playwright }) => {
    const { owner, classId } = await setupClass(playwright);
    const friend = await newUser(playwright);
    const member = await newUser(playwright);
    const stranger = await newUser(playwright);
    await prisma.classMember.create({ data: { classId, userId: member.userId } });
    const id = (await (await invite(owner, classId, friend.email)).json()).data.id as string;
    const url = `${BASE}/api/classes/${classId}/invitations/${id}`;

    expect((await member.request.delete(url)).status()).toBe(403);
    expect((await stranger.request.delete(url)).status()).toBe(404);
    expect(await prisma.classInvitation.count({ where: { id } })).toBe(1);

    expect((await owner.request.delete(url)).status()).toBe(200);
    expect(await prisma.classInvitation.count({ where: { id } })).toBe(0);
    expect((await owner.request.delete(url)).status()).toBe(404);
  });

  test("invitation list and invite are owner-only", async ({ playwright }) => {
    const { owner, classId } = await setupClass(playwright);
    const member = await newUser(playwright);
    const stranger = await newUser(playwright);
    await prisma.classMember.create({ data: { classId, userId: member.userId } });
    const url = `${BASE}/api/classes/${classId}/invitations`;
    expect((await member.request.get(url)).status()).toBe(403);
    expect((await stranger.request.get(url)).status()).toBe(404);
    expect((await invite(member, classId, owner.email)).status()).toBe(403);
    expect((await invite(stranger, classId, owner.email)).status()).toBe(404);
  });

  test("remove drops the membership and that user's records only", async ({ playwright }) => {
    const { owner, classId } = await setupClass(playwright, 2);
    const a = await newUser(playwright);
    const b = await newUser(playwright);
    for (const friend of [a, b]) {
      const id = (await (await invite(owner, classId, friend.email)).json()).data.id as string;
      expect((await friend.request.post(`${BASE}/api/invitations/${id}/accept`)).status()).toBe(
        200
      );
    }
    expect(await recordsOf(a.userId, classId)).toBe(4);

    const removeUrl = (userId: string) => `${BASE}/api/classes/${classId}/members/${userId}`;
    expect((await a.request.delete(removeUrl(b.userId))).status()).toBe(403);
    const stranger = await newUser(playwright);
    expect((await stranger.request.delete(removeUrl(a.userId))).status()).toBe(404);

    expect((await owner.request.delete(removeUrl(a.userId))).status()).toBe(200);
    expect(await prisma.classMember.count({ where: { classId, userId: a.userId } })).toBe(0);
    expect(await recordsOf(a.userId, classId)).toBe(0);
    expect(await recordsOf(b.userId, classId)).toBe(4);
    expect(await recordsOf(owner.userId, classId)).toBe(4);
    expect((await owner.request.delete(removeUrl(a.userId))).status()).toBe(404);
  });

  test("cancelling an ACCEPTED invitation is 409 and keeps the row", async ({ playwright }) => {
    const { owner, classId } = await setupClass(playwright, 1);
    const friend = await newUser(playwright);
    const id = (await (await invite(owner, classId, friend.email)).json()).data.id as string;
    expect((await friend.request.post(`${BASE}/api/invitations/${id}/accept`)).status()).toBe(200);
    const res = await owner.request.delete(`${BASE}/api/classes/${classId}/invitations/${id}`);
    expect(res.status()).toBe(409);
    const row = await prisma.classInvitation.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("ACCEPTED");
  });

  test("accept, remove, re-invite reuses the row and a second accept reseeds records", async ({
    playwright,
  }) => {
    const { owner, classId } = await setupClass(playwright, 3);
    const friend = await newUser(playwright);
    const id = (await (await invite(owner, classId, friend.email)).json()).data.id as string;
    expect((await friend.request.post(`${BASE}/api/invitations/${id}/accept`)).status()).toBe(200);
    expect(
      (await owner.request.delete(`${BASE}/api/classes/${classId}/members/${friend.userId}`)).status()
    ).toBe(200);
    expect(await recordsOf(friend.userId, classId)).toBe(0);

    const again = await invite(owner, classId, friend.email);
    expect(again.status()).toBe(201);
    const body = (await again.json()).data;
    expect(body.id).toBe(id);
    expect(body.status).toBe("PENDING");
    expect((await friend.request.post(`${BASE}/api/invitations/${id}/accept`)).status()).toBe(200);
    expect(await recordsOf(friend.userId, classId)).toBe(6);
  });

  test("the database allows one PENDING per (class, invitee) but several settled rows", async ({
    playwright,
  }) => {
    const { owner, classId } = await setupClass(playwright, 0);
    const friend = await newUser(playwright);
    const data = { classId, inviterId: owner.userId, inviteeId: friend.userId };
    await prisma.classInvitation.create({ data });
    await expect(prisma.classInvitation.create({ data })).rejects.toThrow();
    await prisma.classInvitation.create({ data: { ...data, status: "DECLINED" } });
    await prisma.classInvitation.create({ data: { ...data, status: "DECLINED" } });
    const indexes = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'class_invitations'`;
    expect(indexes.some((i) => /WHERE .*status.*PENDING/.test(i.indexdef))).toBe(true);
  });
});
