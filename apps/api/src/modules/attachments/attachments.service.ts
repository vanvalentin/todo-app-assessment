import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { PrismaClient } from "@prisma/client";
import type {
  Attachment,
  AttachmentListResponse,
  AttachmentMediaType,
  AttachmentListQuery,
} from "@ksat/contracts";
import { generateUuid } from "../../auth/identity.js";
import { HttpError } from "../../errors.js";

const ALLOWED = new Set<AttachmentMediaType>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
]);
const person = { id: true, name: true, avatarSeed: true } as const;
type AttachmentRow = {
  id: string;
  taskId: string;
  originalFilename: string;
  mediaType: string;
  byteSize: number;
  checksumSha256: string;
  uploader: { id: string; name: string; avatarSeed: string };
  createdAt: Date;
  updatedAt: Date;
  objectKey: string;
};

export interface UploadedFile {
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
  readonly buffer: Buffer;
}
export interface AttachmentContent {
  readonly metadata: Attachment;
  readonly body: AsyncIterable<Uint8Array>;
}
export interface AttachmentsService {
  list(userId: string, taskId: string, query: AttachmentListQuery): Promise<AttachmentListResponse>;
  upload(userId: string, taskId: string, file: UploadedFile): Promise<Attachment>;
  content(userId: string, taskId: string, attachmentId: string): Promise<AttachmentContent>;
  remove(userId: string, taskId: string, attachmentId: string): Promise<void>;
}
export interface AttachmentsDeps {
  readonly prisma: PrismaClient;
  readonly s3: S3Client;
  readonly bucket: string;
  readonly maxFileBytes: number;
  readonly maxTaskBytes: number;
}
function notFound(): never {
  throw new HttpError(404, "ATTACHMENT_NOT_FOUND", "The attachment was not found.");
}
function map(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    taskId: row.taskId,
    originalFilename: row.originalFilename,
    mediaType: row.mediaType as AttachmentMediaType,
    byteSize: row.byteSize,
    checksumSha256: row.checksumSha256,
    uploader: row.uploader,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function detected(buffer: Buffer, declared: string): AttachmentMediaType | null {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return "image/jpeg";
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii")))
    return "image/gif";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (declared === "text/plain" && !buffer.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      return "text/plain";
    } catch {
      return null;
    }
  }
  return null;
}
function safeFilename(name: string): string {
  const normalized = name
    .normalize("NFKC")
    .replace(/[\\/\r\n\0]/g, "_")
    .trim();
  if (!normalized || normalized === "." || normalized === "..")
    throw new HttpError(422, "ATTACHMENT_FILENAME_INVALID", "The file name is invalid.");
  return normalized.slice(0, 255);
}
export function createAttachmentsService(deps: AttachmentsDeps): AttachmentsService {
  const authorizedTask = (userId: string, taskId: string) =>
    deps.prisma.task.findFirst({
      where: { id: taskId, board: { memberships: { some: { userId } } } },
      select: { id: true },
    });
  return {
    async list(userId, taskId, query) {
      if (!(await authorizedTask(userId, taskId))) notFound();
      const rows = await deps.prisma.attachment.findMany({
        where: { taskId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: query.limit + 1,
        ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
        include: { uploader: { select: person } },
      });
      const hasMore = rows.length > query.limit;
      const page = rows.slice(0, query.limit);
      return { items: page.map(map), nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null };
    },
    async upload(userId, taskId, file) {
      if (!(await authorizedTask(userId, taskId))) notFound();
      if (!file || file.size === 0)
        throw new HttpError(422, "ATTACHMENT_EMPTY", "Choose a non-empty file.");
      if (file.size > deps.maxFileBytes)
        throw new HttpError(413, "ATTACHMENT_TOO_LARGE", "The file exceeds the per-file limit.");
      const originalFilename = safeFilename(file.originalname);
      const mediaType = detected(file.buffer, file.mimetype);
      if (!mediaType || !ALLOWED.has(mediaType))
        throw new HttpError(415, "ATTACHMENT_TYPE_NOT_ALLOWED", "That file type is not supported.");
      const checksumSha256 = createHash("sha256").update(file.buffer).digest("hex");
      const objectKey = `tasks/${taskId}/${generateUuid()}`;
      try {
        await deps.s3.send(
          new PutObjectCommand({
            Bucket: deps.bucket,
            Key: objectKey,
            Body: file.buffer,
            ContentType: mediaType,
            Metadata: { checksum: checksumSha256 },
          }),
        );
        const created = await deps.prisma.$transaction(async (tx) => {
          const task = await tx.task.findFirst({
            where: { id: taskId, board: { memberships: { some: { userId } } } },
            select: { id: true },
          });
          if (!task) notFound();
          const total = await tx.attachment.aggregate({
            where: { taskId },
            _sum: { byteSize: true },
          });
          if ((total._sum.byteSize ?? 0) + file.size > deps.maxTaskBytes)
            throw new HttpError(
              413,
              "ATTACHMENT_TASK_LIMIT_EXCEEDED",
              "The task attachment limit would be exceeded.",
            );
          return tx.attachment.create({
            data: {
              id: generateUuid(),
              taskId,
              uploaderId: userId,
              objectKey,
              originalFilename,
              mediaType,
              byteSize: file.size,
              checksumSha256,
            },
            include: { uploader: { select: person } },
          });
        });
        return map(created);
      } catch (error) {
        try {
          await deps.s3.send(new DeleteObjectCommand({ Bucket: deps.bucket, Key: objectKey }));
        } catch {
          /* compensation is best effort; worker sweep handles metadata only */
        }
        if (error instanceof HttpError) throw error;
        throw new HttpError(
          503,
          "ATTACHMENT_STORAGE_UNAVAILABLE",
          "The attachment could not be stored.",
        );
      }
    },
    async content(userId, taskId, attachmentId) {
      if (!(await authorizedTask(userId, taskId))) notFound();
      const row = await deps.prisma.attachment.findFirst({
        where: { id: attachmentId, taskId },
        include: { uploader: { select: person } },
      });
      if (!row) notFound();
      try {
        const result = await deps.s3.send(
          new GetObjectCommand({ Bucket: deps.bucket, Key: row.objectKey }),
        );
        if (!result.Body) throw new Error("missing body");
        return { metadata: map(row), body: result.Body as AsyncIterable<Uint8Array> };
      } catch {
        throw new HttpError(404, "ATTACHMENT_NOT_FOUND", "The attachment was not found.");
      }
    },
    async remove(userId, taskId, attachmentId) {
      if (!(await authorizedTask(userId, taskId))) notFound();
      await deps.prisma.$transaction(async (tx) => {
        const row = await tx.attachment.findFirst({ where: { id: attachmentId, taskId } });
        if (!row) notFound();
        await tx.objectCleanup.upsert({
          where: { objectKey: row.objectKey },
          create: { id: generateUuid(), objectKey: row.objectKey },
          update: { completedAt: null, lastErrorCode: null },
        });
        await tx.attachment.delete({ where: { id: attachmentId } });
      });
    },
  };
}
