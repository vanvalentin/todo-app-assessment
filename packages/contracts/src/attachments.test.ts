import { describe, expect, it } from "vitest";
import { attachmentListResponseSchema, attachmentSchema } from "./attachments.js";

describe("attachment contracts", () => {
  const attachment = {
    id: "01900000-0000-7000-8000-000000000001",
    taskId: "01900000-0000-7000-8000-000000000002",
    originalFilename: "photo.png",
    mediaType: "image/png",
    byteSize: 12,
    checksumSha256: "a".repeat(64),
    uploader: { id: "01900000-0000-7000-8000-000000000003", name: "Ada", avatarSeed: "seed" },
    createdAt: "2027-08-01T00:00:00.000Z",
    updatedAt: "2027-08-01T00:00:00.000Z",
  };
  it("accepts metadata and rejects leaked storage fields", () => {
    expect(attachmentSchema.parse(attachment)).toEqual(attachment);
    expect(attachmentSchema.safeParse({ ...attachment, objectKey: "private/key" }).success).toBe(
      false,
    );
  });
  it("accepts paginated metadata", () => {
    expect(
      attachmentListResponseSchema.parse({ items: [attachment], nextCursor: null }).items,
    ).toHaveLength(1);
  });
});
