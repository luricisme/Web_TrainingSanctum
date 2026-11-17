import { z } from "zod";
import { backupExportSchema } from "./backup";
import { classColorSchema } from "./classes";

/**
 * Story 5.3: the restore validation schema. Same shape as the export file, but a
 * Class `color` may be missing (older files); the route then assigns colours by
 * creation order. Pure (AD-1): no Prisma.
 */
export const backupRestoreSchema = backupExportSchema.extend({
  classes: z.array(
    backupExportSchema.shape.classes.element.extend({
      color: classColorSchema.optional(),
      members: z.array(z.string()).default([]),
    })
  ),
  sharedClasses: backupExportSchema.shape.sharedClasses.default([]),
});

export type BackupRestore = z.infer<typeof backupRestoreSchema>;

const MAX_ISSUES = 20;

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

/**
 * Referential and uniqueness problems in a schema-valid backup, as short
 * messages (empty when the file is restorable). Run before any write.
 */
export function findBackupIssues(payload: BackupRestore): string[] {
  const issues: string[] = [];
  const add = (message: string) => {
    if (issues.length < MAX_ISSUES) issues.push(message);
  };

  for (const [label, ids] of [
    ["Class", payload.classes.map((c) => c.id)],
    ["Folder", payload.folders.map((f) => f.id)],
    ["Flashcard", payload.flashcards.map((f) => f.id)],
    ["Card", payload.cards.map((c) => c.id)],
  ] as const) {
    for (const id of duplicates([...ids])) add(`Two ${label}s share the id "${id}".`);
  }

  const classIds = new Set(payload.classes.map((c) => c.id));
  const folderIds = new Set(payload.folders.map((f) => f.id));
  const flashcardIds = new Set(payload.flashcards.map((f) => f.id));

  for (const f of payload.folders) {
    if (!classIds.has(f.classId)) add(`Folder "${f.name}" points to a Class that is not in the file.`);
  }
  const unsortedPerClass = new Map<string, number>();
  for (const f of payload.folders) {
    if (f.isUnsorted) unsortedPerClass.set(f.classId, (unsortedPerClass.get(f.classId) ?? 0) + 1);
  }
  for (const [classId, count] of unsortedPerClass) {
    if (count > 1) {
      const name = payload.classes.find((c) => c.id === classId)?.name ?? classId;
      add(`Class "${name}" has ${count} Unsorted Folders.`);
    }
  }

  for (const f of payload.flashcards) {
    if (!folderIds.has(f.folderId)) add(`Flashcard "${f.name}" points to a Folder that is not in the file.`);
  }
  const names = new Map<string, number>();
  for (const f of payload.flashcards) {
    const key = `${f.folderId}\u0000${f.name.toLowerCase()}`;
    names.set(key, (names.get(key) ?? 0) + 1);
  }
  for (const f of payload.flashcards) {
    const key = `${f.folderId}\u0000${f.name.toLowerCase()}`;
    if ((names.get(key) ?? 0) > 1) {
      add(`Flashcard name "${f.name}" is used twice in one Folder.`);
      names.set(key, 0);
    }
  }

  for (const c of payload.cards) {
    if (!flashcardIds.has(c.flashcardId)) add(`Card "${c.term}" points to a Flashcard that is not in the file.`);
    const directions = c.schedulingRecords.map((r) => r.direction);
    if (new Set(directions).size !== directions.length) {
      add(`Card "${c.term}" has two Scheduling Records for one direction.`);
    }
  }

  for (const day of duplicates(payload.cultivation.days.map((d) => d.localDay))) {
    add(`Cultivation day ${day} appears twice.`);
  }
  if (payload.cultivation.xp < 0) add("Cultivation XP is negative.");

  return issues;
}
