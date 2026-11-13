/**
 * spec-4-8: the Learn queue for one Flashcard, server-side. Both the Learn
 * route and the Flashcard detail counts read through here, so the button's
 * "N new · M due" always matches the session it opens. "Learned" comes only
 * from the AD-14 builders in `@training-sanctum/domain`.
 */
import { prisma, type Prisma } from "@training-sanctum/db";
import {
  type LearnCounts,
  type LearnQueueResponse,
  type ReviewQueueEntry,
  learnedCardWhere,
  unlearnedCardWhere,
} from "@training-sanctum/domain";

/** The ungraded records of the Flashcard's Unlearned Cards. */
function unlearnedRecordWhere(userId: string, flashcardId: string) {
  return {
    firstGradedAt: null,
    card: { userId, flashcardId, ...unlearnedCardWhere() },
  } satisfies Prisma.SchedulingRecordWhereInput;
}

/** The due records of the Flashcard's learned Cards ("due" as the grade route checks it). */
function dueLearnedRecordWhere(userId: string, flashcardId: string, now: Date) {
  return {
    nextReviewDate: { lte: now },
    card: { userId, flashcardId, ...learnedCardWhere() },
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
  now: Date
): Promise<LearnCounts> {
  const [newCards, due] = await Promise.all([
    prisma.card.count({ where: { userId, flashcardId, ...unlearnedCardWhere() } }),
    prisma.schedulingRecord.count({ where: dueLearnedRecordWhere(userId, flashcardId, now) }),
  ]);
  return { newCards, due };
}

/**
 * The Learn session for an owned Flashcard, or null when the user has no
 * such Flashcard. Unlearned Cards come first, oldest-created first, each
 * Card's two directions together (Postgres orders the direction enum by
 * declaration, so Term → Definition sorts first); then due learned records,
 * oldest-due-first.
 */
export async function buildLearnQueue(
  userId: string,
  flashcardId: string,
  now: Date
): Promise<LearnQueueResponse | null> {
  const flashcard = await prisma.flashcard.findFirst({
    where: { id: flashcardId, userId },
    select: { id: true, name: true },
  });
  if (!flashcard) return null;

  const [unlearned, due] = await Promise.all([
    prisma.schedulingRecord.findMany({
      where: unlearnedRecordWhere(userId, flashcardId),
      orderBy: [
        { card: { createdAt: "asc" } },
        { cardId: "asc" },
        { direction: "asc" },
      ],
      select: entrySelect,
    }),
    prisma.schedulingRecord.findMany({
      where: dueLearnedRecordWhere(userId, flashcardId, now),
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
