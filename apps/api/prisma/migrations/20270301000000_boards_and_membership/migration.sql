-- Phase 3: boards and membership.
-- BoardRole enum, Board, BoardMembership, and BoardInvitation, matching the Prisma
-- schema exactly, plus two invariants Prisma cannot express declaratively:
-- a non-empty board name CHECK constraint and a partial unique index limiting
-- each board/email pair to a single pending (not accepted, not revoked) invitation.

-- CreateEnum
CREATE TYPE "BoardRole" AS ENUM ('ADMIN', 'MANAGER', 'CONTRIBUTOR');

-- CreateTable
CREATE TABLE "board" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_membership" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "BoardRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_invitation" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "role" "BoardRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "board_ownerId_idx" ON "board"("ownerId");

-- CreateIndex
CREATE INDEX "board_membership_userId_idx" ON "board_membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "board_membership_boardId_userId_key" ON "board_membership"("boardId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "board_invitation_tokenHash_key" ON "board_invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "board_invitation_boardId_idx" ON "board_invitation"("boardId");

-- CreateIndex
CREATE INDEX "board_invitation_email_idx" ON "board_invitation"("email");

-- AddForeignKey
ALTER TABLE "board" ADD CONSTRAINT "board_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_membership" ADD CONSTRAINT "board_membership_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_membership" ADD CONSTRAINT "board_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_invitation" ADD CONSTRAINT "board_invitation_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_invitation" ADD CONSTRAINT "board_invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_invitation" ADD CONSTRAINT "board_invitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint: Prisma's schema DSL has no declarative CHECK-constraint support,
-- so this invariant is added as raw SQL rather than generated from schema.prisma.
ALTER TABLE "board" ADD CONSTRAINT "board_name_not_empty" CHECK (btrim("name") <> '');

-- PartialUniqueIndex: Prisma's schema DSL has no declarative partial-index support,
-- so "one pending invite per board+email" is added as raw SQL. Pending means not yet
-- accepted and not revoked; a re-invite must first revoke the prior pending row.
CREATE UNIQUE INDEX "board_invitation_pending_board_email_key"
    ON "board_invitation" ("boardId", "email")
    WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
