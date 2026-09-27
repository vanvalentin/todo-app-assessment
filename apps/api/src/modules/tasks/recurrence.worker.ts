import { DateTime } from "luxon";
import { Queue, Worker } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { generateUuid } from "../../auth/identity.js";
import { nextOccurrence } from "./recurrence.js";

const QUEUE_NAME = "ksat-task-recurrence";
const SWEEP_MS = 15_000;
const SWEEP_LIMIT = 100;

interface RecurrenceJob {
  readonly scheduleId: string;
  readonly scheduledAt: string;
}

export interface RecurrenceWorkerRuntime {
  readonly close: () => Promise<void>;
}

function dateForOccurrence(instant: Date, timezone: string): Date {
  const day = DateTime.fromJSDate(instant, { zone: timezone }).toISODate();
  if (!day) throw new Error("recurrence occurrence has no calendar date");
  return new Date(`${day}T00:00:00.000Z`);
}

async function enqueueDueSchedules(
  prisma: PrismaClient,
  queue: Queue<RecurrenceJob>,
  now: Date,
): Promise<void> {
  const schedules = await prisma.taskSchedule.findMany({
    where: { enabled: true, nextRunAt: { lte: now }, taskId: { not: null } },
    orderBy: { nextRunAt: "asc" },
    take: SWEEP_LIMIT,
    select: { id: true, nextRunAt: true },
  });
  for (const schedule of schedules) {
    if (!schedule.nextRunAt) continue;
    await queue.add(
      "generate-occurrence",
      { scheduleId: schedule.id, scheduledAt: schedule.nextRunAt.toISOString() },
      {
        jobId: `recurrence:${schedule.id}:${schedule.nextRunAt.toISOString()}`,
        attempts: 8,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}

export async function generateOccurrence(prisma: PrismaClient, job: RecurrenceJob): Promise<void> {
  const scheduledAt = new Date(job.scheduledAt);
  await prisma.$transaction(
    async (tx) => {
      const schedule = await tx.taskSchedule.findUnique({
        where: { id: job.scheduleId },
        include: { task: true },
      });
      if (
        !schedule ||
        !schedule.enabled ||
        !schedule.task ||
        schedule.task.status === "ARCHIVED" ||
        !schedule.nextRunAt ||
        schedule.nextRunAt.getTime() !== scheduledAt.getTime()
      ) {
        return;
      }

      const nextRunAt = nextOccurrence(schedule, scheduledAt);
      const board = await tx.board.update({
        where: { id: schedule.task.boardId },
        data: { nextTaskSequence: { increment: 1 } },
        select: { nextTaskSequence: true },
      });
      const generatedTaskId = generateUuid();
      await tx.task.create({
        data: {
          id: generatedTaskId,
          boardId: schedule.task.boardId,
          sequence: board.nextTaskSequence - 1,
          name: schedule.task.name,
          description: schedule.task.description,
          status: "NOT_STARTED",
          priority: schedule.task.priority,
          assigneeId: schedule.task.assigneeId,
          dueDate: dateForOccurrence(scheduledAt, schedule.timezone),
          createdById: schedule.task.createdById,
        },
        select: { id: true },
      });
      await tx.scheduleOccurrence.create({
        data: {
          id: generateUuid(),
          scheduleId: schedule.id,
          scheduledAt,
          generatedTaskId,
        },
      });
      await tx.taskSchedule.update({
        where: { id: schedule.id },
        data: nextRunAt ? { nextRunAt } : { nextRunAt: null, enabled: false },
      });
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

export async function startRecurrenceWorker(input: {
  readonly prisma: PrismaClient;
  readonly redisUrl: string;
  readonly now?: () => Date;
}): Promise<RecurrenceWorkerRuntime> {
  const now = input.now ?? (() => new Date());
  const connection = { url: input.redisUrl };
  const queue = new Queue<RecurrenceJob>(QUEUE_NAME, { connection });
  const sweep = async (): Promise<void> => {
    await enqueueDueSchedules(input.prisma, queue, now());
  };
  await sweep();
  const worker = new Worker<RecurrenceJob>(
    QUEUE_NAME,
    async (job) => {
      await generateOccurrence(input.prisma, job.data);
      // A single job advances one occurrence. The next sweep deliberately enqueues
      // another bounded job, making downtime catch-up observable and rate-limited.
      await sweep();
    },
    { connection, concurrency: 2 },
  );
  const timer = setInterval(() => {
    void sweep();
  }, SWEEP_MS);
  return {
    close: async () => {
      clearInterval(timer);
      await worker.close();
      await queue.close();
    },
  };
}
