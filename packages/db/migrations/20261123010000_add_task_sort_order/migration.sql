-- Task priority within its day (drag to reorder in Planner -> Tasks). Additive.
-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "sortOrder" INTEGER;
