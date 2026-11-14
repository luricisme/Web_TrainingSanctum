import { z } from "zod";

/** Story 5.2: one shared shape for the backup file (export now, restore in 5.3, view in 7.3). */
export const BACKUP_VERSION = 1;

const isoTimestamp = z.iso.datetime();
const localDay = z.iso.date();
const id = z.string().min(1);

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
const json: z.ZodType<Json> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(json), z.record(z.string(), json)])
);

export const backupSchedulingRecordSchema = z.object({
  id,
  direction: z.enum(["TERM_TO_DEFINITION", "DEFINITION_TO_TERM"]),
  interval: z.number().int(),
  repetitions: z.number().int(),
  easeFactor: z.number(),
  nextReviewDate: isoTimestamp,
  firstGradedAt: isoTimestamp.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const backupCardSchema = z.object({
  id,
  flashcardId: id,
  term: z.string(),
  definition: z.string(),
  example: z.string().nullable(),
  context: z.string().nullable(),
  partOfSpeech: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  schedulingRecords: z.array(backupSchedulingRecordSchema),
});

export const backupExportSchema = z.object({
  version: z.literal(BACKUP_VERSION),
  exportedAt: isoTimestamp,
  user: z.object({
    id,
    email: z.string(),
    studyDirections: z.enum(["BOTH", "TERM_TO_DEFINITION", "DEFINITION_TO_TERM"]),
    timezone: z.string(),
  }),
  classes: z.array(
    z.object({
      id,
      name: z.string(),
      color: z.enum(["LAVENDER", "SKY", "MINT", "BUTTER", "ROSE"]),
      createdAt: isoTimestamp,
      updatedAt: isoTimestamp,
    })
  ),
  folders: z.array(
    z.object({
      id,
      classId: id,
      name: z.string(),
      isUnsorted: z.boolean(),
      createdAt: isoTimestamp,
      updatedAt: isoTimestamp,
    })
  ),
  flashcards: z.array(
    z.object({
      id,
      folderId: id,
      name: z.string(),
      createdAt: isoTimestamp,
      updatedAt: isoTimestamp,
    })
  ),
  cards: z.array(backupCardSchema),
  cultivation: z.object({
    xp: z.number().int(),
    settledThrough: localDay.nullable(),
    days: z.array(
      z.object({
        id,
        localDay,
        quests: json,
        createdAt: isoTimestamp,
        updatedAt: isoTimestamp,
      })
    ),
    xpEvents: z.array(
      z.object({
        id,
        localDay,
        questKind: z.enum(["LEARN_FLASHCARDS", "CLEAR_REVIEW"]),
        delta: z.number().int(),
        reason: z.enum(["CLAIM", "PENALTY"]),
        createdAt: isoTimestamp,
      })
    ),
  }),
});

export type BackupExport = z.infer<typeof backupExportSchema>;
