/**
 * spec-4-8: the Learn queue for one Flashcard, server-side. Both the Learn
 * route and the Flashcard detail counts read through here, so the button's
 * "N new · M due" always matches the session it opens. "Learned" comes only
 * from the AD-14 builders in `@training-sanctum/domain`, filtered to the
 * user's studied directions (spec-4-9); unstudied records are never read.
 */
import { prisma, type Prisma } from "@training-sanctum/db";
import {
  type LearnCounts,
  type LearnQueueResponse,
  type RecallDirection,
  type ReviewQueueEntry,
  learnedRecordWhere,
  unlearnedCardWhere,
  unlearnedRecordWhere,
} from "@training-sanctum/domain";

/** The Flashcard's ungraded records in the studied directions. */
function flashcardUnlearnedWhere(userId: string, flashcardId: string, dirs: RecallDirection[]) {
  return {
    ...unlearnedRecordWhere(dirs),
    card: { userId, flashcardId },
  } satisfies Prisma.SchedulingRecordWhereInput;
}

/** The Flashcard's learned, due records in the studied directions ("due" as the grade route checks it). */
function flashcardDueWhere(
  userId: string,
  flashcardId: string,
  dirs: RecallDirection[],
  now: Date
) {
  return {
    nextReviewDate: { lte: now },
    ...learnedRecordWhere(dirs),
    card: { userId, flashcardId },
  } satisfies Prisma.SchedulingRecordWhereInput;
}

// The same select and entry mapping as GET /api/review/queue.
const entrySelect = {
  id: true,
  cardId: true,
  direction: true,
  nextReviewDate: true,
  card: {
    select: {
      term: true,
      definition: true,
      example: true,
      context: true,
      partOfSpeech: true,
      flashcard: { select: { name: true } },
    },
  },
} satisfies Prisma.SchedulingRecordSelect;

type EntryRow = Prisma.SchedulingRecordGetPayload<{ select: typeof entrySelect }>;

function toEntry(row: EntryRow): ReviewQueueEntry {
  return {
    schedulingRecordId: row.id,
    cardId: row.cardId,
    direction: row.direction,
    nextReviewDate: row.nextReviewDate.toISOString(),
    flashcardName: row.card.flashcard.name,
    term: row.card.term,
    definition: row.card.definition,
    example: row.card.example,
    context: row.card.context,
    partOfSpeech: row.card.partOfSpeech,
  };
}

/** What a Flashcard's Learn session holds now. The caller has checked ownership. */
export async function countLearn(
  userId: string,
  flashcardId: string,
  dirs: RecallDirection[],
  now: Date
): Promise<LearnCounts> {
  const [newCards, due] = await Promise.all([
    prisma.card.count({ where: { userId, flashcardId, ...unlearnedCardWhere(dirs) } }),
    prisma.schedulingRecord.count({ where: flashcardDueWhere(userId, flashcardId, dirs, now) }),
  ]);
  return { newCards, due };
}

/**
 * The Learn session for an owned Flashcard, or null when the user has no
 * such Flashcard. Unlearned records in the studied directions come first,
 * oldest-created Card first, each Card's directions together (Postgres
 * orders the direction enum by declaration, so Term → Definition sorts
 * first); then learned, due records in the studied directions,
 * oldest-due-first.
 */
export async function buildLearnQueue(
  userId: string,
  flashcardId: string,
  dirs: RecallDirection[],
  now: Date
): Promise<LearnQueueResponse | null> {
  const flashcard = await prisma.flashcard.findFirst({
    where: { id: flashcardId, userId },
    select: { id: true, name: true },
  });
  if (!flashcard) return null;

  const [unlearned, due] = await Promise.all([
    prisma.schedulingRecord.findMany({
      where: flashcardUnlearnedWhere(userId, flashcardId, dirs),
      orderBy: [
        { card: { createdAt: "asc" } },
        { cardId: "asc" },
        { direction: "asc" },
      ],
      select: entrySelect,
    }),
    prisma.schedulingRecord.findMany({
      where: flashcardDueWhere(userId, flashcardId, dirs, now),
      orderBy: [{ nextReviewDate: "asc" }, { cardId: "asc" }, { direction: "asc" }],
      select: entrySelect,
    }),
  ]);

  return {
    flashcard,
    // Derived from the rows themselves, so the counts and the session agree.
    counts: { newCards: new Set(unlearned.map((r) => r.cardId)).size, due: due.length },
    entries: [...unlearned, ...due].map(toEntry),
  };
}
