-- CreateEnum
CREATE TYPE "RecallDirection" AS ENUM ('TERM_TO_DEFINITION', 'DEFINITION_TO_TERM');


-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isUnsorted" BOOLEAN NOT NULL DEFAULT false,
    "classId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "example" TEXT,
    "context" TEXT,
    "partOfSpeech" TEXT,
    "folderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "scheduling_records" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "direction" "RecallDirection" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "nextReviewDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduling_records_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE INDEX "classes_userId_name_idx" ON "classes"("userId", "name");


-- CreateIndex
CREATE INDEX "folders_classId_idx" ON "folders"("classId");


-- CreateIndex
CREATE INDEX "folders_userId_idx" ON "folders"("userId");


-- CreateIndex
CREATE INDEX "cards_folderId_idx" ON "cards"("folderId");


-- CreateIndex
CREATE INDEX "cards_userId_idx" ON "cards"("userId");


-- CreateIndex
CREATE INDEX "scheduling_records_nextReviewDate_idx" ON "scheduling_records"("nextReviewDate");


-- CreateIndex
CREATE UNIQUE INDEX "scheduling_records_cardId_direction_key" ON "scheduling_records"("cardId", "direction");


-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "scheduling_records" ADD CONSTRAINT "scheduling_records_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Raw SQL (AD-2 exception, migration only): Prisma cannot express a partial
-- unique index. At most one Unsorted Folder per Class.
CREATE UNIQUE INDEX "folders_classId_isUnsorted_key" ON "folders"("classId") WHERE "isUnsorted";
