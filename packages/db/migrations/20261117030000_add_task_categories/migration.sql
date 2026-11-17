-- Story 8.2: Planner data model (Epic 8's single additive migration).
-- AlterEnum
ALTER TYPE "XpEventReason" ADD VALUE 'FOCUS_SESSION';
ALTER TYPE "XpEventReason" ADD VALUE 'TASK_DONE';

-- AlterTable: Planner XP has no quest.
ALTER TABLE "xp_events" ALTER COLUMN "questKind" DROP NOT NULL;

-- CreateTable
CREATE TABLE "task_categories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" "ClassColor" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "localDay" DATE NOT NULL,
    "startAt" TIMESTAMP(3),
    "estimateMinutes" INTEGER NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "xpAwardedAt" TIMESTAMP(3),
    "loggedMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_categories_userId_idx" ON "task_categories"("userId");

-- CreateIndex
CREATE INDEX "tasks_userId_localDay_idx" ON "tasks"("userId", "localDay");

-- CreateIndex
CREATE INDEX "tasks_categoryId_idx" ON "tasks"("categoryId");

-- AddForeignKey
ALTER TABLE "task_categories" ADD CONSTRAINT "task_categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "task_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Raw SQL (AD-2 exception, migration only): Prisma cannot express an index on
-- an expression. A Category name is unique per user, case-insensitive.
CREATE UNIQUE INDEX "task_categories_userId_lower_name_key" ON "task_categories"("userId", lower("name"));
