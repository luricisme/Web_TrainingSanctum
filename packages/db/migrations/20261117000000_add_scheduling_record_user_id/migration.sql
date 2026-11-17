-- Story 12.1 (AD-19): Scheduling Records per learner.
-- AlterTable
ALTER TABLE "scheduling_records" ADD COLUMN "userId" TEXT;

-- Backfill: every existing record belongs to its Card's owner.
UPDATE "scheduling_records" sr SET "userId" = c."userId" FROM "cards" c WHERE c."id" = sr."cardId";

-- Fails (and applies nothing) if any record had no Card owner.
ALTER TABLE "scheduling_records" ALTER COLUMN "userId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "scheduling_records" ADD CONSTRAINT "scheduling_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "scheduling_records_cardId_direction_key";

-- CreateIndex
CREATE UNIQUE INDEX "scheduling_records_userId_cardId_direction_key" ON "scheduling_records"("userId", "cardId", "direction");

-- CreateIndex
CREATE INDEX "scheduling_records_userId_nextReviewDate_idx" ON "scheduling_records"("userId", "nextReviewDate");
