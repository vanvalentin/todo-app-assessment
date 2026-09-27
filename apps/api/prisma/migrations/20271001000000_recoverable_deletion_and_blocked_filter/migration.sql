-- Phase 8: recoverable task deletion, blocked filtering, and active-task indexes.
ALTER TABLE "task" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "task_boardId_deletedAt_status_sequence_idx"
  ON "task"("boardId", "deletedAt", "status", "sequence");
CREATE INDEX "task_boardId_deletedAt_assigneeId_idx"
  ON "task"("boardId", "deletedAt", "assigneeId");

-- Keep the dependency lookup index aligned with blocked/unblocked EXISTS checks.
CREATE INDEX "task_dependency_boardId_taskId_dependsOnTaskId_idx"
  ON "task_dependency"("boardId", "taskId", "dependsOnTaskId");
