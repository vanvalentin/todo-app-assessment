-- Existing schedules were originally attached permanently to the first task in a series.
-- Hand each schedule to its latest live generated occurrence so deleting an older task
-- cannot stop the current occurrence from creating its successor.
WITH "latest_occurrence" AS (
  SELECT DISTINCT ON ("scheduleId")
    "scheduleId",
    "generatedTaskId"
  FROM "schedule_occurrence"
  WHERE "generatedTaskId" IS NOT NULL
  ORDER BY "scheduleId", "scheduledAt" DESC
)
UPDATE "task_schedule" AS "schedule"
SET
  "taskId" = "latest_occurrence"."generatedTaskId",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "latest_occurrence"
INNER JOIN "task" AS "current_task"
  ON "current_task"."id" = "latest_occurrence"."generatedTaskId"
  AND "current_task"."deletedAt" IS NULL
WHERE "schedule"."id" = "latest_occurrence"."scheduleId";
