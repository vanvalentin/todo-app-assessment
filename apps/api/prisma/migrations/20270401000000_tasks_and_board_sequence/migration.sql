-- Phase 4a: tasks and the per-board task sequence counter.
-- TaskStatus and TaskPriority, the Task table, and Board.nextTaskSequence. The
-- counter is incremented in the same transaction as task creation so sequence
-- numbers stay unique per board without a separate allocation table.

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "board" ADD COLUMN "nextTaskSequence" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "task" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_boardId_sequence_key" ON "task"("boardId", "sequence");

-- CreateIndex
CREATE INDEX "task_boardId_status_sequence_idx" ON "task"("boardId", "status", "sequence");

-- CreateIndex
CREATE INDEX "task_createdById_idx" ON "task"("createdById");

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: Prisma's schema DSL has no declarative CHECK-constraint support,
-- so this invariant is added as raw SQL rather than generated from schema.prisma.
ALTER TABLE "task" ADD CONSTRAINT "task_name_not_empty" CHECK (btrim("name") <> '');
