-- Reporter is not part of the task domain. Existing reporter values are intentionally dropped.
ALTER TABLE "task" DROP CONSTRAINT "task_reporter_board_membership_fkey";
ALTER TABLE "task" DROP CONSTRAINT "task_reporterId_fkey";
ALTER TABLE "task" DROP COLUMN "reporterId";
