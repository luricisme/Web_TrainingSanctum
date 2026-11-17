-- Story 12.3: Class invitations. Additive only.
-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "class_invitations" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "class_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_invitations_inviteeId_status_idx" ON "class_invitations"("inviteeId", "status");

-- CreateIndex
CREATE INDEX "class_invitations_classId_idx" ON "class_invitations"("classId");

-- AddForeignKey
ALTER TABLE "class_invitations" ADD CONSTRAINT "class_invitations_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_invitations" ADD CONSTRAINT "class_invitations_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_invitations" ADD CONSTRAINT "class_invitations_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Raw SQL (AD-2 exception, migration only): Prisma cannot express a partial
-- unique index. At most one PENDING invitation per (class, invitee).
CREATE UNIQUE INDEX "class_invitations_classId_inviteeId_pending_key" ON "class_invitations"("classId", "inviteeId") WHERE "status" = 'PENDING';
