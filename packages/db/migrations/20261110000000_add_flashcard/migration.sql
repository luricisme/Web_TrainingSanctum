-- Story 2.7: Flashcard level between Folder and Card.
-- Existing cards are test data and are wiped (no data migration).
DELETE FROM "scheduling_records";
DELETE FROM "cards";

-- DropForeignKey
ALTER TABLE "cards" DROP CONSTRAINT "cards_folderId_fkey";

-- DropIndex
DROP INDEX "cards_folderId_idx";

-- AlterTable
ALTER TABLE "cards" DROP COLUMN "folderId",
ADD COLUMN "flashcardId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "flashcards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flashcards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flashcards_folderId_idx" ON "flashcards"("folderId");

-- CreateIndex
CREATE INDEX "flashcards_userId_idx" ON "flashcards"("userId");

-- CreateIndex
CREATE INDEX "cards_flashcardId_idx" ON "cards"("flashcardId");

-- AddForeignKey
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "flashcards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Raw SQL (AD-2 exception, migration only): Prisma cannot express an index on
-- an expression. A Flashcard name is unique per Folder, case-insensitive.
CREATE UNIQUE INDEX "flashcards_folderId_lower_name_key" ON "flashcards"("folderId", lower("name"));
