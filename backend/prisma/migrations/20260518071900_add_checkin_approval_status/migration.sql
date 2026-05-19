-- CreateEnum
CREATE TYPE "CheckInApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REWORK_REQUESTED');

-- AlterTable
ALTER TABLE "CheckInComment" ADD COLUMN     "approvalStatus" "CheckInApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "approvalTimestamp" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "reworkComments" TEXT,
ADD COLUMN     "reworkRequested" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "CheckInComment_approvalStatus_idx" ON "CheckInComment"("approvalStatus");

-- AddForeignKey
ALTER TABLE "CheckInComment" ADD CONSTRAINT "CheckInComment_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
