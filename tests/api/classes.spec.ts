import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@training-sanctum/db";

const PASSWORD = "correct-horse-battery";

interface Session {
  request: APIRequestContext;
  userId: string;
}

async function newUser(
  playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  base: string
): Promise<Session> {
  const request = await playwright.request.newContext();
  const email = `classes-${randomUUID()}@example.test`;
  const response = await request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { email, password: PASSWORD, name: "Classes Test", timezone: "UTC" },
  });
  expect(response.ok()).toBeTruthy();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { request, userId: user.id };
}

async function createClass(s: Session, base: string, name: string) {
  const res = await s.request.post(`${base}/api/classes`, { data: { name } });
  expect(res.status()).toBe(201);
  return (await res.json()).data as {
    id: string;
    name: string;
    folderCount: number;
    flashcardCount: number;
    cardCount: number;
  };
}

async function seedFolder(
  s: Session,
  classId: string,
  name: string,
  cardCount: number,
  withRecords = false
) {
  const folder = await prisma.folder.create({
    data: { name, classId, userId: s.userId },
  });
  await seedCards(s, folder.id, cardCount, withRecords);
  return folder;
}

/** One Flashcard with `count` Cards (none is created when `count` is 0). */
async function seedFlashcard(
  s: Session,
  folderId: string,
  name: string,
  count: number,
  withRecords = false
) {
  const flashcard = await prisma.flashcard.create({
    data: { name, folderId, userId: s.userId },
  });
  for (let i = 0; i < count; i += 1) {
    const card = await prisma.card.create({
      data: {
        term: `t${i}`,
        definition: `d${i}`,
        flashcardId: flashcard.id,
        userId: s.userId,
      },
    });
    if (withRecords) {
      await prisma.schedulingRecord.createMany({
        data: (["TERM_TO_DEFINITION", "DEFINITION_TO_TERM"] as const).map(
          (direction) => ({
            cardId: card.id,
            direction,
            nextReviewDate: new Date(),
          })
        ),
      });
    }
  }
  return flashcard;
}

/** A uniquely named Flashcard in the Folder holding `count` Cards; skipped for 0. */
async function seedCards(
  s: Session,
  folderId: string,
  count: number,
  withRecords = false
) {
  if (count === 0) return;
  await seedFlashcard(s, folderId, `seed-${randomUUID()}`, count, withRecords);
}

async function unsortedOf(classId: string) {
  return prisma.folder.findFirstOrThrow({ where: { classId, isUnsorted: true } });
}

// spec-2-1: Class CRUD. Every handler is session-guarded, validated, and
// scoped to the session user; both delete modes are atomic.
test.describe("/api/classes", () => {
  test("unauthenticated requests return the 401 envelope", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const ctx = await playwright.request.newContext();
    for (const res of [
      await ctx.get(`${base}/api/classes`),
      await ctx.post(`${base}/api/classes`, { data: { name: "x" } }),
      await ctx.patch(`${base}/api/classes/abc`, { data: { name: "x" } }),
      await ctx.delete(`${base}/api/classes/abc`, {
        data: { mode: "delete", confirmName: "x" },
      }),
    ]) {
      expect(res.status()).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
    }
  });

  test("empty list, then create returns 201 with exactly one Unsorted folder", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);

    const empty = await s.request.get(`${base}/api/classes`);
    expect(empty.status()).toBe(200);
    expect((await empty.json()).data).toEqual([]);

    const created = await createClass(s, base, "  IELTS  ");
    expect(created).toMatchObject({
      name: "IELTS",
      folderCount: 1,
      flashcardCount: 0,
      cardCount: 0,
    });

    const folders = await prisma.folder.findMany({ where: { classId: created.id } });
    expect(folders).toHaveLength(1);
    expect(folders[0]).toMatchObject({
      name: "Unsorted",
      isUnsorted: true,
      userId: s.userId,
    });

    const list = (await (await s.request.get(`${base}/api/classes`)).json()).data;
    expect(list).toEqual([created]);
  });

  test("create validates the name and reports fields.name", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    for (const name of ["", "   ", "a".repeat(81)]) {
      const res = await s.request.post(`${base}/api/classes`, { data: { name } });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(typeof body.error.fields.name).toBe("string");
      expect(body.error.details).toBeUndefined();
    }
    expect(await prisma.class.count({ where: { userId: s.userId } })).toBe(0);
  });

  test("list is ordered by name with folder, flashcard and card counts", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const b = await createClass(s, base, "Business");
    await createClass(s, base, "Academic");
    await seedCards(s, (await unsortedOf(b.id)).id, 2);
    await seedFolder(s, b.id, "Meetings", 3);

    const list = (await (await s.request.get(`${base}/api/classes`)).json()).data;
    expect(list.map((c: { name: string }) => c.name)).toEqual(["Academic", "Business"]);
    expect(list[1]).toMatchObject({ folderCount: 2, flashcardCount: 2, cardCount: 5 });
    expect(list[0]).toMatchObject({ folderCount: 1, flashcardCount: 0, cardCount: 0 });
  });

  test("rename updates the name; unknown and foreign ids are 404", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    const a = await newUser(playwright, base);
    const b = await newUser(playwright, base);
    const mine = await createClass(a, base, "Old");
    await seedCards(a, (await unsortedOf(mine.id)).id, 2);
    await seedFolder(a, mine.id, "Extra", 3);

    const renamed = await a.request.patch(`${base}/api/classes/${mine.id}`, {
      data: { name: " New " },
    });
    expect(renamed.status()).toBe(200);
    expect((await renamed.json()).data).toMatchObject({
      id: mine.id,
      name: "New",
      folderCount: 2,
      flashcardCount: 2,
      cardCount: 5,
    });

    const bad = await a.request.patch(`${base}/api/classes/${mine.id}`, {
      data: { name: "" },
    });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error.fields.name).toBeTruthy();

    const unknown = await a.request.patch(`${base}/api/classes/nope`, {
      data: { name: "X" },
    });
    expect(unknown.status()).toBe(404);

    const foreign = await b.request.patch(`${base}/api/classes/${mine.id}`, {
      data: { name: "Hijacked" },
    });
    expect(foreign.status()).toBe(404);
    expect((await prisma.class.findUniqueOrThrow({ where: { id: mine.id } })).name).toBe("New");
  });

  test("another user's classes never appear in the list", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const a = await newUser(playwright, base);
    const b = await newUser(playwright, base);
    await createClass(a, base, "Private");
    const list = (await (await b.request.get(`${base}/api/classes`)).json()).data;
    expect(list).toEqual([]);
  });

  test("delete, move: merges Unsorted flashcards, moves folders with flashcards, suffixes clashes", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const source = await createClass(s, base, "Source");
    const target = await createClass(s, base, "Target");

    // Both Unsorted Folders hold an "Idioms" Flashcard: the merged one is suffixed.
    const mergedFlashcard = await seedFlashcard(
      s,
      (await unsortedOf(source.id)).id,
      "Idioms",
      2
    );
    await seedFlashcard(s, (await unsortedOf(target.id)).id, "idioms", 1);
    const weather = await seedFolder(s, source.id, "Weather", 3, true);
    const travel = await seedFolder(s, source.id, "Travel", 1);
    await seedFolder(s, target.id, "Weather", 0);
    await seedFolder(s, target.id, "Weather (2)", 0);

    const res = await s.request.delete(`${base}/api/classes/${source.id}`, {
      data: { mode: "move", targetClassId: target.id },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toMatchObject({
      mode: "move",
      foldersMoved: 2,
      flashcardsMoved: 2,
      cardsMoved: 4,
      flashcardsMerged: 1,
      cardsMerged: 2,
    });

    expect(await prisma.class.findUnique({ where: { id: source.id } })).toBeNull();

    const folders = await prisma.folder.findMany({
      where: { classId: target.id },
      include: { flashcards: { include: { _count: { select: { cards: true } } } } },
    });
    const cardsIn = (f: (typeof folders)[number]) =>
      f.flashcards.reduce((n, fc) => n + fc._count.cards, 0);
    const byName = Object.fromEntries(folders.map((f) => [f.name, f]));
    expect(Object.keys(byName).sort()).toEqual(
      ["Travel", "Unsorted", "Weather", "Weather (2)", "Weather (3)"].sort()
    );
    // Unsorted: target's 1 card plus source's 2 merged, the clash renamed.
    expect(cardsIn(byName["Unsorted"])).toBe(3);
    expect(byName["Unsorted"].flashcards.map((f) => f.name).sort()).toEqual([
      "Idioms (2)",
      "idioms",
    ]);
    expect(
      byName["Unsorted"].flashcards.find((f) => f.id === mergedFlashcard.id)?.name
    ).toBe("Idioms (2)");
    expect(folders.filter((f) => f.isUnsorted)).toHaveLength(1);
    // Moved folders keep identity and cards.
    expect(byName["Weather (3)"].id).toBe(weather.id);
    expect(cardsIn(byName["Weather (3)"])).toBe(3);
    expect(byName["Travel"].id).toBe(travel.id);
    // Scheduling records survive a move.
    expect(
      await prisma.schedulingRecord.count({ where: { card: { flashcard: { folderId: weather.id } } } })
    ).toBe(6);
  });

  test("delete, move: bad targets are 400 and nothing changes", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const a = await newUser(playwright, base);
    const b = await newUser(playwright, base);
    const source = await createClass(a, base, "Source");
    const foreign = await createClass(b, base, "Foreign");
    await seedFolder(a, source.id, "Keep", 2);

    for (const targetClassId of [source.id, foreign.id, "missing"]) {
      const res = await a.request.delete(`${base}/api/classes/${source.id}`, {
        data: { mode: "move", targetClassId },
      });
      expect(res.status()).toBe(400);
      expect((await res.json()).error.fields.targetClassId).toBeTruthy();
    }
    expect(await prisma.class.count({ where: { id: source.id } })).toBe(1);
    expect(await prisma.card.count({ where: { flashcard: { folder: { classId: source.id } } } })).toBe(2);
  });

  test("delete, move on the only class is 400", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const only = await createClass(s, base, "Only");
    const missingTarget = await s.request.delete(`${base}/api/classes/${only.id}`, {
      data: { mode: "move" },
    });
    expect(missingTarget.status()).toBe(400);
    const selfTarget = await s.request.delete(`${base}/api/classes/${only.id}`, {
      data: { mode: "move", targetClassId: only.id },
    });
    expect(selfTarget.status()).toBe(400);
    expect(await prisma.class.count({ where: { id: only.id } })).toBe(1);
  });

  test("delete, all: wrong name is 400; exact name removes the whole tree", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const cls = await createClass(s, base, "Doomed");
    const keep = await createClass(s, base, "Keep");
    await seedCards(s, (await unsortedOf(cls.id)).id, 2, true);
    await seedFolder(s, cls.id, "Sub", 2, true);
    await seedCards(s, (await unsortedOf(keep.id)).id, 1, true);

    const wrong = await s.request.delete(`${base}/api/classes/${cls.id}`, {
      data: { mode: "delete", confirmName: "doomed" },
    });
    expect(wrong.status()).toBe(400);
    expect((await wrong.json()).error.fields.confirmName).toBeTruthy();
    expect(await prisma.class.count({ where: { id: cls.id } })).toBe(1);
    expect(await prisma.card.count({ where: { flashcard: { folder: { classId: cls.id } } } })).toBe(4);

    const folderIds = (
      await prisma.folder.findMany({ where: { classId: cls.id }, select: { id: true } })
    ).map((f) => f.id);

    const ok = await s.request.delete(`${base}/api/classes/${cls.id}`, {
      data: { mode: "delete", confirmName: "Doomed" },
    });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).data).toMatchObject({
      mode: "delete",
      folders: 2,
      flashcards: 2,
      cards: 4,
      schedulingRecords: 8,
    });

    expect(await prisma.class.count({ where: { id: cls.id } })).toBe(0);
    expect(await prisma.folder.count({ where: { id: { in: folderIds } } })).toBe(0);
    expect(await prisma.card.count({ where: { flashcard: { folderId: { in: folderIds } } } })).toBe(0);
    expect(
      await prisma.schedulingRecord.count({
        where: { card: { flashcard: { folderId: { in: folderIds } } } },
      })
    ).toBe(0);
    // The other class is untouched.
    expect(await prisma.card.count({ where: { flashcard: { folder: { classId: keep.id } } } })).toBe(1);
  });

  test("delete of a foreign or unknown class is 404", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const a = await newUser(playwright, base);
    const b = await newUser(playwright, base);
    const mine = await createClass(a, base, "Mine");
    const res = await b.request.delete(`${base}/api/classes/${mine.id}`, {
      data: { mode: "delete", confirmName: "Mine" },
    });
    expect(res.status()).toBe(404);
    const unknown = await b.request.delete(`${base}/api/classes/nope`, {
      data: { mode: "delete", confirmName: "x" },
    });
    expect(unknown.status()).toBe(404);
    expect(await prisma.class.count({ where: { id: mine.id } })).toBe(1);
  });

  test("delete validates the request body", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const cls = await createClass(s, base, "X");
    const res = await s.request.delete(`${base}/api/classes/${cls.id}`, {
      data: { mode: "nuke" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  test("a failure mid-move rolls everything back", async ({ playwright, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const source = await createClass(s, base, "Source");
    const target = await createClass(s, base, "Target");
    const marker = `Boom-${randomUUID()}`;
    const sourceUnsorted = await unsortedOf(source.id);
    await seedCards(s, sourceUnsorted.id, 2);
    const good = await seedFolder(s, source.id, "Moves first", 1);
    const bad = await seedFolder(s, source.id, marker, 1);

    // A trigger that rejects moving the marker folder, scoped to its unique
    // name so parallel tests are unaffected. Folders move oldest first, so
    // the flashcard merge and the first folder move must be undone.
    const fn = `fail_${randomUUID().replace(/-/g, "")}`;
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN IF NEW.name = '${marker}' THEN RAISE EXCEPTION 'forced failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${fn} BEFORE UPDATE ON folders FOR EACH ROW EXECUTE FUNCTION ${fn}()`
    );
    try {
      // Rename inside the move would not change the marker name, but the
      // UPDATE itself fires the trigger, which is what aborts it.
      const res = await s.request.delete(`${base}/api/classes/${source.id}`, {
        data: { mode: "move", targetClassId: target.id },
      });
      expect(res.status()).toBe(500);
      expect((await res.json()).error.code).toBe("INTERNAL_ERROR");
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER ${fn} ON folders`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION ${fn}()`);
    }

    expect(await prisma.class.count({ where: { id: source.id } })).toBe(1);
    expect(
      await prisma.card.count({ where: { flashcard: { folderId: sourceUnsorted.id } } })
    ).toBe(2);
    expect((await prisma.folder.findUniqueOrThrow({ where: { id: good.id } })).classId).toBe(
      source.id
    );
    expect((await prisma.folder.findUniqueOrThrow({ where: { id: bad.id } })).classId).toBe(
      source.id
    );
    expect(
      await prisma.flashcard.count({
        where: { folderId: (await unsortedOf(target.id)).id },
      })
    ).toBe(0);
  });

  test("the database allows only one Unsorted folder per class", async ({
    playwright,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    const s = await newUser(playwright, base);
    const cls = await createClass(s, base, "One");
    await expect(
      prisma.folder.create({
        data: { name: "Second", isUnsorted: true, classId: cls.id, userId: s.userId },
      })
    ).rejects.toThrow();
  });
});
