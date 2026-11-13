-- Story 5.1: cultivation ledger (FR-12, AD-15). Additive only: every existing
-- user reads cultivationXp = 0 and a null cultivationSettledThrough, and no
-- other row changes. Nothing writes the two new tables until Stories 5.6/5.7.
-- CreateEnum
CREATE TYPE "QuestKind" AS ENUM ('LEARN_FLASHCARDS', 'CLEAR_REVIEW');

-- CreateEnum
CREATE TYPE "XpEventReason" AS ENUM ('CLAIM', 'PENALTY');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cultivationSettledThrough" DATE,
ADD COLUMN     "cultivationXp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "cultivation_days" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localDay" DATE NOT NULL,
    "quests" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cultivation_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localDay" DATE NOT NULL,
    "questKind" "QuestKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "XpEventReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cultivation_days_userId_localDay_key" ON "cultivation_days"("userId", "localDay");

-- CreateIndex
CREATE INDEX "xp_events_userId_localDay_idx" ON "xp_events"("userId", "localDay");

-- AddForeignKey
ALTER TABLE "cultivation_days" ADD CONSTRAINT "cultivation_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
