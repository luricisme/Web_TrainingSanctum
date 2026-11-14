import { prisma } from "@training-sanctum/db";
import { BACKUP_VERSION, type BackupExport } from "@training-sanctum/domain";

const iso = (d: Date) => d.toISOString();
const day = (d: Date) => d.toISOString().slice(0, 10);
const byCreated = [{ createdAt: "asc" as const }, { id: "asc" as const }];

/**
 * Story 5.2: the full backup payload for one user, or null when the user does
 * not exist. Read-only; one transaction so the file is a consistent snapshot.
 * Every query is scoped by `userId`; no auth, role or disabled data is read.
 */
export async function buildBackupExport(userId: string): Promise<BackupExport | null> {
  const [user, classes, folders, flashcards, cards, days, xpEvents] = await prisma.$transaction([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        studyDirections: true,
        timezone: true,
        cultivationXp: true,
        cultivationSettledThrough: true,
      },
    }),
    prisma.class.findMany({ where: { userId }, orderBy: byCreated }),
    prisma.folder.findMany({ where: { userId }, orderBy: byCreated }),
    prisma.flashcard.findMany({ where: { userId }, orderBy: byCreated }),
    prisma.card.findMany({
      where: { userId },
      orderBy: byCreated,
      include: { schedulingRecords: { orderBy: [{ direction: "asc" }] } },
    }),
    prisma.cultivationDay.findMany({ where: { userId }, orderBy: byCreated }),
    prisma.xpEvent.findMany({ where: { userId }, orderBy: byCreated }),
  ], { isolationLevel: "RepeatableRead" });
  if (!user) return null;

  return {
    version: BACKUP_VERSION,
    exportedAt: iso(new Date()),
    user: {
      id: user.id,
      email: user.email,
      studyDirections: user.studyDirections,
      timezone: user.timezone,
    },
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      createdAt: iso(c.createdAt),
      updatedAt: iso(c.updatedAt),
    })),
    folders: folders.map((f) => ({
      id: f.id,
      classId: f.classId,
      name: f.name,
      isUnsorted: f.isUnsorted,
      createdAt: iso(f.createdAt),
      updatedAt: iso(f.updatedAt),
    })),
    flashcards: flashcards.map((f) => ({
      id: f.id,
      folderId: f.folderId,
      name: f.name,
      createdAt: iso(f.createdAt),
      updatedAt: iso(f.updatedAt),
    })),
    cards: cards.map((c) => ({
      id: c.id,
      flashcardId: c.flashcardId,
      term: c.term,
      definition: c.definition,
      example: c.example,
      context: c.context,
      partOfSpeech: c.partOfSpeech,
      createdAt: iso(c.createdAt),
      updatedAt: iso(c.updatedAt),
      schedulingRecords: c.schedulingRecords.map((r) => ({
        id: r.id,
        direction: r.direction,
        interval: r.interval,
        repetitions: r.repetitions,
        easeFactor: r.easeFactor,
        nextReviewDate: iso(r.nextReviewDate),
        firstGradedAt: r.firstGradedAt ? iso(r.firstGradedAt) : null,
        createdAt: iso(r.createdAt),
        updatedAt: iso(r.updatedAt),
      })),
    })),
    cultivation: {
      xp: user.cultivationXp,
      settledThrough: user.cultivationSettledThrough ? day(user.cultivationSettledThrough) : null,
      days: days.map((d) => ({
        id: d.id,
        localDay: day(d.localDay),
        quests: d.quests as BackupExport["cultivation"]["days"][number]["quests"],
        createdAt: iso(d.createdAt),
        updatedAt: iso(d.updatedAt),
      })),
      xpEvents: xpEvents.map((e) => ({
        id: e.id,
        localDay: day(e.localDay),
        questKind: e.questKind,
        delta: e.delta,
        reason: e.reason,
        createdAt: iso(e.createdAt),
      })),
    },
  };
}
