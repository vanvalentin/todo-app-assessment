import { DeleteObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { Queue, Worker } from "bullmq";
import type { PrismaClient } from "@prisma/client";

const QUEUE_NAME = "ksat-attachment-cleanup";
export interface AttachmentCleanupRuntime {
  readonly close: () => Promise<void>;
}
export async function startAttachmentCleanupWorker(input: {
  prisma: PrismaClient;
  s3: S3Client;
  bucket: string;
  redisUrl: string;
}): Promise<AttachmentCleanupRuntime> {
  const connection = { url: input.redisUrl };
  const queue = new Queue<{ cleanupId: string }>(QUEUE_NAME, { connection });
  const pending = await input.prisma.objectCleanup.findMany({
    where: { completedAt: null },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  for (const item of pending)
    await queue.add(
      "delete-object",
      { cleanupId: item.id },
      {
        jobId: item.id,
        attempts: 8,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  const worker = new Worker<{ cleanupId: string }>(
    QUEUE_NAME,
    async (job) => {
      const item = await input.prisma.objectCleanup.findUnique({
        where: { id: job.data.cleanupId },
      });
      if (!item || item.completedAt) return;
      await input.prisma.objectCleanup.update({
        where: { id: item.id },
        data: { attempts: { increment: 1 }, lastAttemptAt: new Date() },
      });
      try {
        await input.s3.send(new DeleteObjectCommand({ Bucket: input.bucket, Key: item.objectKey }));
        await input.prisma.objectCleanup.update({
          where: { id: item.id },
          data: { completedAt: new Date(), lastErrorCode: null },
        });
      } catch {
        await input.prisma.objectCleanup.update({
          where: { id: item.id },
          data: { lastErrorCode: "STORAGE_DELETE_FAILED" },
        });
        throw new Error("attachment cleanup retryable failure");
      }
    },
    { connection, concurrency: 4 },
  );
  const sweep = setInterval(async () => {
    const rows = await input.prisma.objectCleanup.findMany({
      where: { completedAt: null },
      take: 100,
    });
    for (const row of rows)
      await queue.add(
        "delete-object",
        { cleanupId: row.id },
        {
          jobId: row.id,
          attempts: 8,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
  }, 30_000);
  return {
    close: async () => {
      clearInterval(sweep);
      await worker.close();
      await queue.close();
    },
  };
}
