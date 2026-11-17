import { describe, expect, it } from "vitest";
import { backupRestoreSchema, buildBackupPlannerTree, findBackupIssues } from "@training-sanctum/domain";

const ts = "2026-11-14T10:00:00.000Z";

function valid() {
  return {
    version: 1,
    exportedAt: ts,
    user: { id: "u1", email: "a@example.test", studyDirections: "BOTH", timezone: "UTC" },
    classes: [{ id: "c1", name: "C", color: "MINT", members: [], createdAt: ts, updatedAt: ts }],
    folders: [{ id: "f1", classId: "c1", name: "Unsorted", isUnsorted: true, createdAt: ts, updatedAt: ts }],
    flashcards: [{ id: "s1", folderId: "f1", name: "Set", createdAt: ts, updatedAt: ts }],
    cards: [
      {
        id: "k1",
        flashcardId: "s1",
        term: "t",
        definition: "d",
        example: null,
        context: null,
        partOfSpeech: null,
        createdAt: ts,
        updatedAt: ts,
        schedulingRecords: [
          {
            id: "r1",
            direction: "TERM_TO_DEFINITION",
            interval: 0,
            repetitions: 0,
            easeFactor: 2.5,
            nextReviewDate: ts,
            firstGradedAt: null,
            createdAt: ts,
            updatedAt: ts,
          },
        ],
      },
    ],
    sharedClasses: [],
    cultivation: {
      xp: 10,
      settledThrough: null,
      days: [{ id: "d1", localDay: "2026-11-12", quests: [], createdAt: ts, updatedAt: ts }],
      xpEvents: [],
    },
  };
}

const parse = (value: unknown) => backupRestoreSchema.parse(value);

describe("backupRestoreSchema", () => {
  it("defaults missing members and sharedClasses to empty (older files)", () => {
    const old = valid() as Record<string, unknown>;
    delete old.sharedClasses;
    for (const c of old.classes as Record<string, unknown>[]) delete c.members;
    const parsed = backupRestoreSchema.parse(old);
    expect(parsed.sharedClasses).toEqual([]);
    expect(parsed.classes[0]!.members).toEqual([]);
  });

  it("accepts a valid file with no issues", () => {
    expect(findBackupIssues(parse(valid()))).toEqual([]);
  });

  it("accepts Classes without a colour", () => {
    const file = valid();
    delete (file.classes[0] as { color?: string }).color;
    const parsed = parse(file);
    expect(parsed.classes[0].color).toBeUndefined();
    expect(findBackupIssues(parsed)).toEqual([]);
  });

  it("rejects a wrong version, a bad colour and missing sections", () => {
    expect(backupRestoreSchema.safeParse({ ...valid(), version: 2 }).success).toBe(false);
    const bad = valid();
    (bad.classes[0] as { color: string }).color = "TEAL";
    expect(backupRestoreSchema.safeParse(bad).success).toBe(false);
    expect(backupRestoreSchema.safeParse({ version: 1 }).success).toBe(false);
  });
});

describe("findBackupIssues", () => {
  it("flags a Folder with an unknown Class", () => {
    const f = valid();
    f.folders[0].classId = "nope";
    expect(findBackupIssues(parse(f))).toHaveLength(1);
  });

  it("flags a Flashcard with an unknown Folder", () => {
    const f = valid();
    f.flashcards[0].folderId = "nope";
    expect(findBackupIssues(parse(f))).toHaveLength(1);
  });

  it("flags a Card with an unknown Flashcard", () => {
    const f = valid();
    f.cards[0].flashcardId = "nope";
    expect(findBackupIssues(parse(f))[0]).toMatch(/Flashcard that is not in the file/);
  });

  it("flags a second Unsorted Folder in one Class", () => {
    const f = valid();
    f.folders.push({ ...f.folders[0], id: "f2", name: "Other" });
    expect(findBackupIssues(parse(f))[0]).toMatch(/2 Unsorted Folders/);
  });

  it("allows one Unsorted Folder in each of two Classes", () => {
    const f = valid();
    f.classes.push({ ...f.classes[0], id: "c2" });
    f.folders.push({ ...f.folders[0], id: "f2", classId: "c2" });
    expect(findBackupIssues(parse(f))).toEqual([]);
  });

  it("flags Flashcard names that differ only by case in one Folder, but not across Folders", () => {
    const f = valid();
    f.flashcards.push({ ...f.flashcards[0], id: "s2", name: "SET" });
    expect(findBackupIssues(parse(f))[0]).toMatch(/used twice/);

    const g = valid();
    g.folders.push({ ...g.folders[0], id: "f2", isUnsorted: false, name: "Second" });
    g.flashcards.push({ ...g.flashcards[0], id: "s2", folderId: "f2" });
    expect(findBackupIssues(parse(g))).toEqual([]);
  });

  it("flags two records for one direction", () => {
    const f = valid();
    f.cards[0].schedulingRecords.push({ ...f.cards[0].schedulingRecords[0], id: "r2" });
    expect(findBackupIssues(parse(f))[0]).toMatch(/one direction/);
  });

  it("flags a duplicate cultivation day and negative XP", () => {
    const f = valid();
    f.cultivation.days.push({ ...f.cultivation.days[0], id: "d2" });
    f.cultivation.xp = -1;
    const issues = findBackupIssues(parse(f));
    expect(issues).toHaveLength(2);
  });

  it("flags duplicate ids", () => {
    const f = valid();
    f.classes.push({ ...f.classes[0] });
    expect(findBackupIssues(parse(f))[0]).toMatch(/share the id/);
  });
});

const withPlanner = () => ({
  ...valid(),
  planner: {
    settings: { focus: 30, shortBreak: 5, longBreak: 15, longBreakEvery: 4 },
    categories: [{ id: "pc1", name: "Study", color: "SKY", createdAt: ts, updatedAt: ts }],
    tasks: [
      {
        id: "pt1",
        categoryId: "pc1",
        title: "Read",
        localDay: "2026-11-14",
        startAt: null,
        estimateMinutes: 60,
        done: false,
        xpAwardedAt: null,
        loggedMinutes: 25,
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    sessions: [
      { id: "ps1", taskId: "pt1", kind: "FOCUS", plannedMinutes: 25, actualMinutes: 25, startedAt: ts, endedAt: ts, overrun: false },
      { id: "ps2", taskId: "pt1", kind: "BREAK", plannedMinutes: 5, actualMinutes: null, startedAt: ts, endedAt: null, overrun: false },
    ],
  },
});

describe("planner in backups", () => {
  it("accepts a file without planner and a consistent one with one open session", () => {
    expect(findBackupIssues(parse(valid()))).toEqual([]);
    expect(findBackupIssues(parse(withPlanner()))).toEqual([]);
  });

  it("flags duplicate planner ids", () => {
    const f = withPlanner();
    f.planner.categories.push({ ...f.planner.categories[0] });
    f.planner.tasks.push({ ...f.planner.tasks[0] });
    f.planner.sessions.push({ ...f.planner.sessions[0] });
    const issues = findBackupIssues(parse(f));
    expect(issues).toContain('Two Task categories share the id "pc1".');
    expect(issues.filter((i) => /share the id/.test(i))).toHaveLength(3);
  });

  it("flags two categories whose names differ only by case", () => {
    const f = withPlanner();
    f.planner.categories.push({ ...f.planner.categories[0], id: "pc2", name: "STUDY" });
    expect(findBackupIssues(parse(f))).toEqual(['Two Task categories share the name "study".']);
  });

  it("flags a Task with a missing category and a session with a missing Task", () => {
    const f = withPlanner();
    f.planner.tasks[0].categoryId = "nope";
    f.planner.sessions[0].taskId = "nope";
    const issues = findBackupIssues(parse(f));
    expect(issues[0]).toMatch(/category that is not in the file/);
    expect(issues[1]).toMatch(/Task that is not in the file/);
  });

  it("flags two open sessions", () => {
    const f = withPlanner();
    f.planner.sessions[0].endedAt = null;
    expect(findBackupIssues(parse(f))[0]).toMatch(/2 Pomodoro sessions are still open/);
  });

  it("groups category -> Task -> session", () => {
    const tree = buildBackupPlannerTree(parse(withPlanner()).planner!);
    expect(tree).toHaveLength(1);
    expect(tree[0].tasks[0].sessions.map((s) => s.id)).toEqual(["ps1", "ps2"]);
  });
});
