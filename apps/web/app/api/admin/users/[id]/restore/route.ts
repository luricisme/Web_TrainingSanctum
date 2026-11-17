import { randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@training-sanctum/db";
import {
  DAY_MS,
  DEFAULT_POMODORO_SETTINGS,
  backupRestoreSchema,
  createDefaultSchedulingRecords,
  findBackupIssues,
  nextClassColor,
  toLocalDate,
} from "@training-sanctum/domain";
import { z } from "zod";
import { HttpError, fail, ok, readJson, validationFailure } from "@/lib/api-response";
import { requireAdmin } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.string().min(1).max(64);
const bodySchema = z.object({ confirm: z.literal(true), backup: backupRestoreSchema });

const CHUNK = 1000;
const TX_TIMEOUT_MS = 60_000;

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

const at = (iso: string) => new Date(iso);
const onDay = (day: string) => new Date(`${day}T00:00:00.000Z`);

/**
 * Story 5.3 (AD-11): admin-only restore. Replaces the target user's Classes
 * (cascading), CultivationDays and XpEvents with the backup's rows in one
 * transaction; any failure leaves the previous data untouched. Rows get fresh
 * ids. The file's user id, email and timezone are never applied.
 */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const result = await requireAdmin(request);
  if (result.response) return result.response;
  const adminId = result.session.user.id;

  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return validationFailure(parsedId.error);
  const userId = parsedId.data;
  const log = (level: "info" | "error", entry: Record<string, unknown>) =>
    console[level](JSON.stringify({ operation: "admin.restore", adminId, userId, ...entry }));

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, timezone: true },
  });
  if (!target) {
    log("error", { outcome: "rejected:404" });
    return fail(404, "NOT_FOUND", "User not found.");
  }

  const raw = await readJson(request);
  if (raw === null) {
    log("error", { outcome: "rejected:400" });
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    log("error", { outcome: "rejected:400" });
    return validationFailure(parsed.error);
  }
  const backup = parsed.data.backup;

  const issues = findBackupIssues(backup);
  if (issues.length > 0) {
    log("error", { outcome: "rejected:422", issues: issues.length });
    return fail(
      422,
      "BACKUP_INVALID",
      "The backup file is inconsistent. Nothing was changed.",
      undefined,
      issues.map((reason, i) => ({ line: i + 1, reason }))
    );
  }

  // Fresh ids, with relations remapped through these maps.
  const classId = new Map(backup.classes.map((c) => [c.id, randomUUID()]));
  const folderId = new Map(backup.folders.map((f) => [f.id, randomUUID()]));
  const flashcardId = new Map(backup.flashcards.map((f) => [f.id, randomUUID()]));

  const byCreation = [...backup.classes].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  );
  const fallbackColor = new Map(byCreation.map((c, i) => [c.id, nextClassColor(i)]));

  const settledThrough = new Date(toLocalDate(new Date(), target.timezone).getTime() - DAY_MS);

  // Story 12.5: Members re-attach only when their email resolves to another user.
  const wanted = new Set(
    backup.classes.flatMap((c) => c.members).filter((email) => email !== target.email)
  );
  const found = wanted.size
    ? await prisma.user.findMany({
        where: { email: { in: [...wanted] } },
        select: { id: true, email: true, timezone: true },
      })
    : [];
  const resolved = new Map(found.filter((u) => u.id !== userId).map((u) => [u.email, u]));
  const unresolvedEmails = new Set<string>();

  const classRows = backup.classes.map((c) => ({
    id: classId.get(c.id)!,
    userId,
    name: c.name,
    color: c.color ?? fallbackColor.get(c.id)!,
    createdAt: at(c.createdAt),
    updatedAt: at(c.updatedAt),
  }));
  const folderRows = backup.folders.map((f) => ({
    id: folderId.get(f.id)!,
    userId,
    classId: classId.get(f.classId)!,
    name: f.name,
    isUnsorted: f.isUnsorted,
    createdAt: at(f.createdAt),
    updatedAt: at(f.updatedAt),
  }));
  const flashcardRows = backup.flashcards.map((f) => ({
    id: flashcardId.get(f.id)!,
    userId,
    folderId: folderId.get(f.folderId)!,
    name: f.name,
    createdAt: at(f.createdAt),
    updatedAt: at(f.updatedAt),
  }));
  const memberRows: Prisma.ClassMemberCreateManyInput[] = [];
  const membersOfClass = new Map<string, { id: string; timezone: string }[]>();
  for (const c of backup.classes) {
    const seen = new Set<string>();
    const list: { id: string; timezone: string }[] = [];
    for (const email of c.members) {
      const user = resolved.get(email);
      if (!user) {
        if (email !== target.email) unresolvedEmails.add(email);
        continue;
      }
      if (seen.has(email)) continue;
      seen.add(email);
      list.push(user);
      memberRows.push({ classId: classId.get(c.id)!, userId: user.id });
    }
    membersOfClass.set(c.id, list);
  }
  const classOfFlashcard = new Map<string, string>();
  {
    const classOfFolder = new Map(backup.folders.map((f) => [f.id, f.classId]));
    for (const f of backup.flashcards) classOfFlashcard.set(f.id, classOfFolder.get(f.folderId)!);
  }
  const now = new Date();
  const cardRows: Prisma.CardCreateManyInput[] = [];
  const recordRows: Prisma.SchedulingRecordCreateManyInput[] = [];
  for (const c of backup.cards) {
    const id = randomUUID();
    cardRows.push({
      id,
      userId,
      flashcardId: flashcardId.get(c.flashcardId)!,
      term: c.term,
      definition: c.definition,
      example: c.example,
      context: c.context,
      partOfSpeech: c.partOfSpeech,
      createdAt: at(c.createdAt),
      updatedAt: at(c.updatedAt),
    });
    for (const member of membersOfClass.get(classOfFlashcard.get(c.flashcardId)!) ?? []) {
      for (const r of createDefaultSchedulingRecords([member.id], { now, timezone: member.timezone })) {
        recordRows.push({ id: randomUUID(), cardId: id, ...r });
      }
    }
    for (const r of c.schedulingRecords) {
      recordRows.push({
        id: randomUUID(),
        cardId: id,
        userId,
        direction: r.direction,
        interval: r.interval,
        repetitions: r.repetitions,
        easeFactor: r.easeFactor,
        nextReviewDate: at(r.nextReviewDate),
        firstGradedAt: r.firstGradedAt ? at(r.firstGradedAt) : null,
        createdAt: at(r.createdAt),
        updatedAt: at(r.updatedAt),
      });
    }
  }
  const dayRows = backup.cultivation.days.map((d) => ({
    id: randomUUID(),
    userId,
    localDay: onDay(d.localDay),
    quests: d.quests as Prisma.InputJsonValue,
    createdAt: at(d.createdAt),
    updatedAt: at(d.updatedAt),
  }));
  const eventRows = backup.cultivation.xpEvents.map((e) => ({
    id: randomUUID(),
    userId,
    localDay: onDay(e.localDay),
    questKind: e.questKind,
    delta: e.delta,
    reason: e.reason,
    createdAt: at(e.createdAt),
  }));

  const planner = backup.planner;
  const categoryId = new Map((planner?.categories ?? []).map((c) => [c.id, randomUUID()]));
  const taskId = new Map((planner?.tasks ?? []).map((t) => [t.id, randomUUID()]));
  const categoryRows = (planner?.categories ?? []).map((c) => ({
    id: categoryId.get(c.id)!,
    userId,
    name: c.name,
    color: c.color,
    createdAt: at(c.createdAt),
    updatedAt: at(c.updatedAt),
  }));
  const taskRows = (planner?.tasks ?? []).map((t) => ({
    id: taskId.get(t.id)!,
    userId,
    categoryId: categoryId.get(t.categoryId)!,
    title: t.title,
    localDay: onDay(t.localDay),
    startAt: t.startAt ? at(t.startAt) : null,
    estimateMinutes: t.estimateMinutes,
    done: t.done,
    xpAwardedAt: t.xpAwardedAt ? at(t.xpAwardedAt) : null,
    loggedMinutes: t.loggedMinutes,
    createdAt: at(t.createdAt),
    updatedAt: at(t.updatedAt),
  }));
  const sessionRows = (planner?.sessions ?? []).map((s) => ({
    id: randomUUID(),
    userId,
    taskId: taskId.get(s.taskId)!,
    kind: s.kind,
    plannedMinutes: s.plannedMinutes,
    actualMinutes: s.actualMinutes,
    startedAt: at(s.startedAt),
    endedAt: s.endedAt ? at(s.endedAt) : null,
    overrun: s.overrun,
  }));
  const pomodoroSettings = { ...(planner?.settings ?? DEFAULT_POMODORO_SETTINGS) };

  try {
    await prisma.$transaction(
      async (tx) => {
        // First statement: takes the user row lock, so concurrent restores of one user serialise.
        const locked = await tx.user.updateMany({
          where: { id: userId },
          data: {
            studyDirections: backup.user.studyDirections,
            cultivationXp: backup.cultivation.xp,
            cultivationSettledThrough: settledThrough,
            pomodoroSettings,
          },
        });
        if (locked.count === 0) throw new HttpError(404, "NOT_FOUND", "User not found.");

        await tx.task.deleteMany({ where: { userId } }); // cascades Pomodoro sessions
        await tx.taskCategory.deleteMany({ where: { userId } }); // after Tasks: Task.categoryId is Restrict
        await tx.class.deleteMany({ where: { userId } }); // cascades Members, invitations and every learner's records
        await tx.cultivationDay.deleteMany({ where: { userId } });
        await tx.xpEvent.deleteMany({ where: { userId } });

        for (const rows of chunks(classRows)) await tx.class.createMany({ data: rows });
        for (const rows of chunks(memberRows)) await tx.classMember.createMany({ data: rows });
        for (const rows of chunks(folderRows)) await tx.folder.createMany({ data: rows });
        for (const rows of chunks(flashcardRows)) await tx.flashcard.createMany({ data: rows });
        for (const rows of chunks(cardRows)) await tx.card.createMany({ data: rows });
        for (const rows of chunks(recordRows)) await tx.schedulingRecord.createMany({ data: rows });
        for (const rows of chunks(dayRows)) await tx.cultivationDay.createMany({ data: rows });
        for (const rows of chunks(eventRows)) await tx.xpEvent.createMany({ data: rows });
        for (const rows of chunks(categoryRows)) await tx.taskCategory.createMany({ data: rows });
        for (const rows of chunks(taskRows)) await tx.task.createMany({ data: rows });
        for (const rows of chunks(sessionRows)) await tx.pomodoroSession.createMany({ data: rows });
      },
      { timeout: TX_TIMEOUT_MS, maxWait: 10_000 }
    );
  } catch (error) {
    if (error instanceof HttpError) {
      log("error", { outcome: `rejected:${error.status}` });
      return error.toResponse();
    }
    log("error", {
      outcome: "failed",
      error: error instanceof Error ? error.message.slice(0, 300) : String(error),
    });
    return fail(500, "RESTORE_FAILED", "The restore failed. Nothing was changed.");
  }

  const counts = {
    classes: classRows.length,
    folders: folderRows.length,
    flashcards: flashcardRows.length,
    cards: cardRows.length,
    schedulingRecords: recordRows.length,
    members: memberRows.length,
    cultivationDays: dayRows.length,
    xpEvents: eventRows.length,
    taskCategories: categoryRows.length,
    tasks: taskRows.length,
    pomodoroSessions: sessionRows.length,
  };
  log("info", {
    outcome: "success",
    ...counts,
    unresolvedMemberEmails: [...unresolvedEmails],
    ignoredSharedClasses: backup.sharedClasses.map((s) => `${s.name} (${s.ownerEmail})`),
  });
  return ok(counts);
}
