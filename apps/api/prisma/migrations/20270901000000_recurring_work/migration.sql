-- Phase 6: timezone-aware recurring task schedules and idempotent occurrences.
CREATE TABLE "task_schedule" (
  "id" TEXT NOT NULL,
  "taskId" TEXT,
  "rrule" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "startLocal" TEXT NOT NULL,
  "nextRunAt" TIMESTAMP(3),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "task_schedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_schedule_task_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "task_schedule_rrule_not_empty" CHECK (length(trim("rrule")) > 0),
  CONSTRAINT "task_schedule_timezone_not_empty" CHECK (length(trim("timezone")) > 0),
  CONSTRAINT "task_schedule_start_local_not_empty" CHECK (length(trim("startLocal")) > 0)
);
CREATE UNIQUE INDEX "task_schedule_taskId_key" ON "task_schedule"("taskId");
CREATE INDEX "task_schedule_enabled_nextRunAt_idx" ON "task_schedule"("enabled", "nextRunAt");

CREATE TABLE "schedule_occurrence" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "generatedTaskId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "schedule_occurrence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "schedule_occurrence_schedule_fkey" FOREIGN KEY ("scheduleId") REFERENCES "task_schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "schedule_occurrence_task_fkey" FOREIGN KEY ("generatedTaskId") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "schedule_occurrence_scheduleId_scheduledAt_key" ON "schedule_occurrence"("scheduleId", "scheduledAt");
CREATE UNIQUE INDEX "schedule_occurrence_generatedTaskId_key" ON "schedule_occurrence"("generatedTaskId");
CREATE INDEX "schedule_occurrence_scheduleId_scheduledAt_idx" ON "schedule_occurrence"("scheduleId", "scheduledAt");
