-- Story 4.6: learned marker (AD-14).
-- AlterTable
ALTER TABLE "scheduling_records" ADD COLUMN "firstGradedAt" TIMESTAMP(3);

-- Backfill: a record with interval > 0 has been graded (applyGrade never returns 0).
UPDATE "scheduling_records" SET "firstGradedAt" = "updatedAt" WHERE "interval" > 0;
