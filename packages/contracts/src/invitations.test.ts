import { describe, expect, it } from "vitest";
import {
  acceptInvitationResponseSchema,
  createInvitationRequestSchema,
  createInvitationResponseSchema,
  invitationPreviewSchema,
  pendingInvitationSchema,
} from "./invitations.js";

const inviter = { id: "018f7f2e-3b8a-7c3a-8f2e-3b8a7c3a8f30", name: "Ada", avatarSeed: "seed-1" };

describe("invitation contracts", () => {
  it("normalizes the invitation request email to lowercase", () => {
    const parsed = createInvitationRequestSchema.parse({
      email: "NEW@Example.TEST",
      role: "MANAGER",
    });
    expect(parsed.email).toBe("new@example.test");
  });

  it("rejects an invalid role on the invitation request", () => {
    expect(
      createInvitationRequestSchema.safeParse({ email: "a@example.test", role: "OWNER" }).success,
    ).toBe(false);
  });

  it("never includes a token field on the create-invitation response", () => {
    const response = {
      id: inviter.id,
      boardId: inviter.id,
      email: "new@example.test",
      role: "CONTRIBUTOR",
      invitedById: inviter.id,
      expiresAt: "2024-01-08T00:00:00.000Z",
      createdAt: "2024-01-01T00:00:00.000Z",
      emailDelivery: "SENT",
    };
    expect(createInvitationResponseSchema.parse(response).emailDelivery).toBe("SENT");
    expect(createInvitationResponseSchema.safeParse({ ...response, token: "leak" }).success).toBe(
      false,
    );
  });

  it("parses a pending invitation and an invitation preview without a token", () => {
    const pending = {
      id: inviter.id,
      boardId: inviter.id,
      email: "new@example.test",
      role: "MANAGER",
      invitedBy: inviter,
      expiresAt: "2024-01-08T00:00:00.000Z",
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    expect(pendingInvitationSchema.parse(pending).invitedBy).toEqual(inviter);

    const preview = {
      boardId: inviter.id,
      boardName: "Tokyo Zine Fair 2027",
      email: "new@example.test",
      role: "MANAGER",
      invitedBy: inviter,
      expiresAt: "2024-01-08T00:00:00.000Z",
    };
    expect(invitationPreviewSchema.parse(preview).boardName).toBe("Tokyo Zine Fair 2027");
    expect(invitationPreviewSchema.safeParse({ ...preview, token: "leak" }).success).toBe(false);
  });

  it("parses an accept-invitation response", () => {
    const accepted = {
      boardId: inviter.id,
      boardName: "Tokyo Zine Fair 2027",
      role: "CONTRIBUTOR",
      joinedAt: "2024-01-01T00:00:00.000Z",
      alreadyMember: false,
    };
    expect(acceptInvitationResponseSchema.parse(accepted).alreadyMember).toBe(false);
  });
});
