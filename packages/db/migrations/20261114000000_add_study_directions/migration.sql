-- Story 4.9: study directions setting (FR-18, AD-14). Additive only: no
-- Scheduling Record is touched, and every existing user reads BOTH.
-- CreateEnum
CREATE TYPE "StudyDirections" AS ENUM ('BOTH', 'TERM_TO_DEFINITION', 'DEFINITION_TO_TERM');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "studyDirections" "StudyDirections" NOT NULL DEFAULT 'BOTH';
