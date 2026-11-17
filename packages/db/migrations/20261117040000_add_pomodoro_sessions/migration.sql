-- Story 9.1: Pomodoro data model (the single additive migration of Epic 9).
-- CreateEnum
CREATE TYPE "PomodoroKind" AS ENUM ('FOCUS', 'BREAK');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "pomodoroSettings" JSONB NOT NULL DEFAULT '{"focus": 25, "shortBreak": 5, "longBreak": 15, "longBreakEvery": 4}';

-- CreateTable
CREATE TABLE "pomodoro_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "PomodoroKind" NOT NULL,
    "plannedMinutes" INTEGER NOT NULL,
    "actualMinutes" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "overrun" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pomodoro_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pomodoro_sessions_userId_taskId_idx" ON "pomodoro_sessions"("userId", "taskId");

-- AddForeignKey
ALTER TABLE "pomodoro_sessions" ADD CONSTRAINT "pomodoro_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pomodoro_sessions" ADD CONSTRAINT "pomodoro_sessions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Raw SQL (AD-2 exception, migration only): Prisma cannot express a partial
-- unique index. A user has at most one running (not yet ended) session.
CREATE UNIQUE INDEX "pomodoro_sessions_userId_running_key" ON "pomodoro_sessions"("userId") WHERE "endedAt" IS NULL;
