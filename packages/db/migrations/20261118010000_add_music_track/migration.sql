-- Story 11.2: nullable music track on Task categories and Tasks (additive).
-- AlterTable
ALTER TABLE "task_categories" ADD COLUMN "musicTrack" JSONB;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "musicTrack" JSONB;
