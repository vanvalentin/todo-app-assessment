-- Phase 4b: assignee, reporter, and due date on tasks.
-- assigneeId (nullable) and reporterId (backfilled from createdById, then required)
-- name active board members; dueDate is a calendar date, not a timestamp, because a
-- due date names a day rather than an instant. Two invariants Prisma's schema DSL
-- cannot express as declarative relations (a composite FK alongside the task's
-- required boardId column) are added as raw SQL below, matching the pattern already
-- used for board_name_not_empty, task_name_not_empty, and the pending-invitation
-- partial unique index.

-- AlterTable
ALTER TABLE "task" ADD COLUMN "assigneeId" TEXT;
ALTER TABLE "task" ADD COLUMN "reporterId" TEXT;
ALTER TABLE "task" ADD COLUMN "dueDate" DATE;

-- Backfill: every existing task's reporter is its creator. This is always a valid
-- board member at the time of this migration because member removal is not yet a
-- feature of the application (see README "After the MVP"), so createdById is
-- guaranteed to still satisfy the composite membership foreign key added below.
UPDATE "task" SET "reporterId" = "createdById" WHERE "reporterId" IS NULL;

-- AlterTable: reporterId is required once every existing row has one.
ALTER TABLE "task" ALTER COLUMN "reporterId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "task_boardId_assigneeId_idx" ON "task"("boardId", "assigneeId");

-- CreateIndex
CREATE INDEX "task_boardId_dueDate_idx" ON "task"("boardId", "dueDate");

-- AddForeignKey: plain FKs to user(id), used only so Prisma can `include` the
-- assignee/reporter preview. The membership invariant itself is the composite FK below.
ALTER TABLE "task" ADD CONSTRAINT "task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task" ADD CONSTRAINT "task_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CompositeForeignKey: Prisma's schema DSL cannot express a composite FK through a
-- required local column (boardId), so these two invariants are raw SQL rather than
-- generated from schema.prisma. They require assigneeId/reporterId to name a row in
-- board_membership for the *same* boardId, i.e. an active member of the task's own
-- board, not merely any user. A column-list ON DELETE SET NULL (only assigneeId, not
-- boardId) requires PostgreSQL 15+; Compose pins postgres:17.4-alpine. A NULL
-- assigneeId trivially satisfies a MATCH SIMPLE foreign key, so an unassigned task
-- needs no exception. reporterId uses NO ACTION so removing a board member (not yet
-- an application feature) cannot silently orphan a task's reporter.
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_board_membership_fkey"
    FOREIGN KEY ("boardId", "assigneeId") REFERENCES "board_membership"("boardId", "userId")
    ON DELETE SET NULL ("assigneeId") ON UPDATE CASCADE;
ALTER TABLE "task" ADD CONSTRAINT "task_reporter_board_membership_fkey"
    FOREIGN KEY ("boardId", "reporterId") REFERENCES "board_membership"("boardId", "userId")
    ON DELETE NO ACTION ON UPDATE CASCADE;
