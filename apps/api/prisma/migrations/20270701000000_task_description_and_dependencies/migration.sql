-- Phase 5a: Markdown task descriptions and same-board task dependencies.
-- description is nullable Markdown source (blank input is normalized to NULL by the
-- API). task_dependency stores directed "taskId depends on dependsOnTaskId" edges.
-- Both composite foreign keys reuse the edge's boardId, so PostgreSQL itself
-- guarantees that the two tasks are on the same board, and deleting either task
-- cascades its edges. Cycle rejection needs a graph walk and stays in the service,
-- inside a transaction that locks the board row. The two CHECK constraints are raw SQL
-- because Prisma's schema DSL cannot express CHECK constraints (same pattern as
-- board_name_not_empty and task_name_not_empty).

-- AlterTable
ALTER TABLE "task" ADD COLUMN     "description" TEXT;

-- CheckConstraint: mirrors TASK_DESCRIPTION_MAX_LENGTH and the blank-to-NULL
-- normalization in @ksat/contracts.
ALTER TABLE "task" ADD CONSTRAINT "task_description_length"
    CHECK ("description" IS NULL OR (char_length("description") BETWEEN 1 AND 10000));

-- CreateIndex: the composite target that keeps dependency edges on one board.
CREATE UNIQUE INDEX "task_boardId_id_key" ON "task"("boardId", "id");

-- CreateTable
CREATE TABLE "task_dependency" (
    "boardId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dependsOnTaskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependency_pkey" PRIMARY KEY ("taskId","dependsOnTaskId")
);

-- CheckConstraint: a task can never depend on itself.
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_not_self"
    CHECK ("taskId" <> "dependsOnTaskId");

-- CreateIndex
CREATE INDEX "task_dependency_boardId_dependsOnTaskId_idx" ON "task_dependency"("boardId", "dependsOnTaskId");

-- AddForeignKey
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_boardId_taskId_fkey" FOREIGN KEY ("boardId", "taskId") REFERENCES "task"("boardId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_boardId_dependsOnTaskId_fkey" FOREIGN KEY ("boardId", "dependsOnTaskId") REFERENCES "task"("boardId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
