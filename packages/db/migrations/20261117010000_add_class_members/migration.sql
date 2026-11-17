-- Story 12.2: Class membership. Additive only.
-- CreateTable
CREATE TABLE "class_members" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_members_userId_idx" ON "class_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "class_members_classId_userId_key" ON "class_members"("classId", "userId");

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
