-- Phase 5b: private task attachments and durable object cleanup.
CREATE TABLE "attachment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attachment_task_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "attachment_uploader_fkey" FOREIGN KEY ("uploaderId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "attachment_byte_size_positive" CHECK ("byteSize" > 0),
  CONSTRAINT "attachment_filename_not_empty" CHECK (length(trim("originalFilename")) > 0),
  CONSTRAINT "attachment_checksum_sha256" CHECK ("checksumSha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "attachment_object_key_not_empty" CHECK (length(trim("objectKey")) > 0)
);
CREATE UNIQUE INDEX "attachment_objectKey_key" ON "attachment"("objectKey");
CREATE INDEX "attachment_taskId_createdAt_id_idx" ON "attachment"("taskId", "createdAt", "id");
CREATE INDEX "attachment_uploaderId_idx" ON "attachment"("uploaderId");

CREATE TABLE "object_cleanup" (
  "id" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "object_cleanup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "object_cleanup_objectKey_key" ON "object_cleanup"("objectKey");
CREATE INDEX "object_cleanup_completedAt_createdAt_idx" ON "object_cleanup"("completedAt", "createdAt");
