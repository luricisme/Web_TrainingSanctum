import { describe, expect, it } from "vitest";
import { buildBackupTree } from "@training-sanctum/domain";

const ts = "2026-11-14T10:00:00.000Z";
const base = { createdAt: ts, updatedAt: ts };
const klass = (id: string) => ({ id, name: id, color: "SKY" as const, members: ["m@example.test"], ...base });
const folder = (id: string, classId: string, isUnsorted = false) => ({ id, classId, name: id, isUnsorted, ...base });
const flashcard = (id: string, folderId: string) => ({ id, folderId, name: id, ...base });
const card = (id: string, flashcardId: string) => ({
  id, flashcardId, term: id, definition: "d", example: null, context: null, partOfSpeech: null, ...base,
  schedulingRecords: [],
});

describe("buildBackupTree", () => {
  it("returns an empty tree for an empty payload", () => {
    expect(buildBackupTree({ classes: [], folders: [], flashcards: [], cards: [] })).toEqual([]);
  });

  it("groups each level under its parent and keeps payload order", () => {
    const tree = buildBackupTree({
      classes: [klass("c2"), klass("c1")],
      folders: [folder("f1", "c1"), folder("f2", "c2"), folder("f3", "c1")],
      flashcards: [flashcard("s2", "f1"), flashcard("s1", "f1"), flashcard("s3", "f2")],
      cards: [card("k3", "s1"), card("k1", "s2"), card("k2", "s2")],
    });
    expect(tree.map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(tree[0]!.members).toEqual(["m@example.test"]);
    const c1 = tree[1]!;
    expect(c1.folders.map((f) => f.id)).toEqual(["f1", "f3"]);
    expect(c1.folders[0]!.flashcards.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(c1.folders[0]!.flashcards[0]!.cards.map((k) => k.id)).toEqual(["k1", "k2"]);
    expect(c1.folders[0]!.flashcards[1]!.cards.map((k) => k.id)).toEqual(["k3"]);
    expect(tree[0]!.folders[0]!.flashcards[0]!.cards).toEqual([]);
    expect(c1.folders[1]!.flashcards).toEqual([]);
  });

  it("keeps the Unsorted flag on its Folder", () => {
    const tree = buildBackupTree({
      classes: [klass("c1")],
      folders: [folder("f1", "c1", true)],
      flashcards: [],
      cards: [],
    });
    expect(tree[0]!.folders[0]!.isUnsorted).toBe(true);
  });
});
