-- Phase 4c: task-board search.
-- pg_trgm backs a case-insensitive substring search on task name. Prisma's schema
-- DSL has no `postgresqlExtensions` preview enabled in this project, so the
-- extension and its GIN index are raw SQL, matching the pattern already used for
-- board_name_not_empty, task_name_not_empty, the pending-invitation partial unique
-- index, and the phase 4b composite membership foreign keys.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "task_name_trgm_idx" ON "task" USING GIN ("name" gin_trgm_ops);
