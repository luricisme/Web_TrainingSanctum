import type { BackupExport } from "./backup";

type Payload = Pick<BackupExport, "classes" | "folders" | "flashcards" | "cards">;
type BackupCard = BackupExport["cards"][number];
type BackupFlashcard = BackupExport["flashcards"][number];
type BackupFolder = BackupExport["folders"][number];
type BackupClass = BackupExport["classes"][number];

export type BackupFlashcardNode = BackupFlashcard & { cards: BackupCard[] };
export type BackupFolderNode = BackupFolder & { flashcards: BackupFlashcardNode[] };
export type BackupClassNode = BackupClass & { folders: BackupFolderNode[] };

function groupBy<T, K extends string>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const list = map.get(key(item));
    if (list) list.push(item);
    else map.set(key(item), [item]);
  }
  return map;
}

type Planner = BackupExport["planner"];
export type BackupTaskNode = Planner["tasks"][number] & { sessions: Planner["sessions"] };
export type BackupCategoryNode = Planner["categories"][number] & { tasks: BackupTaskNode[] };

/** Spec 9-4: groups the Planner section into category -> Task -> session, keeping payload order. Pure. */
export function buildBackupPlannerTree(planner: Planner): BackupCategoryNode[] {
  const sessionsByTask = groupBy(planner.sessions, (s) => s.taskId);
  const tasksByCategory = groupBy(planner.tasks, (t) => t.categoryId);
  return planner.categories.map((category) => ({
    ...category,
    tasks: (tasksByCategory.get(category.id) ?? []).map((task) => ({
      ...task,
      sessions: sessionsByTask.get(task.id) ?? [],
    })),
  }));
}

/**
 * Story 7.3: groups the flat backup payload into Class -> Folder -> Flashcard -> Card,
 * keeping payload order at every level. Pure; rows whose parent is missing are dropped.
 */
export function buildBackupTree(payload: Payload): BackupClassNode[] {
  const cardsByFlashcard = groupBy(payload.cards, (c) => c.flashcardId);
  const flashcardsByFolder = groupBy(payload.flashcards, (f) => f.folderId);
  const foldersByClass = groupBy(payload.folders, (f) => f.classId);
  return payload.classes.map((klass) => ({
    ...klass,
    folders: (foldersByClass.get(klass.id) ?? []).map((folder) => ({
      ...folder,
      flashcards: (flashcardsByFolder.get(folder.id) ?? []).map((flashcard) => ({
        ...flashcard,
        cards: cardsByFlashcard.get(flashcard.id) ?? [],
      })),
    })),
  }));
}
