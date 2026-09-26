import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { createInvitationsService } from "../src/modules/invitations/invitations.service.js";
import type {
  InvitationsRepository,
  RevokeInvitationResult,
} from "../src/modules/invitations/invitations.types.js";

const BOARD_ID = "01900000-0000-7000-8000-000000000001";
const INVITATION_ID = "01900000-0000-7000-8000-000000000003";

function repository(result: RevokeInvitationResult): InvitationsRepository {
  return {
    findMembershipRole: async () => "ADMIN",
    listPending: async () => ({ items: [], hasMore: false }),
    createPending: async () => {
      throw new Error("not used");
    },
    revokePending: async () => result,
    findByTokenHash: async () => null,
    listMemberIds: async () => [],
    accept: async () => {
      throw new Error("not used");
    },
  };
}

function service(result: RevokeInvitationResult) {
  return createInvitationsService({
    repository: repository(result),
    mailer: { sendInvitationEmail: async () => undefined },
    logger: pino({ level: "silent" }),
    appPublicUrl: "http://localhost:8080",
    ttlHours: 72,
  });
}

describe("invitation cancellation service", () => {
  it.each(["REVOKED", "ALREADY_REVOKED"] as const)(
    "treats %s as successful cancellation",
    async (result) => {
      await expect(
        service(result).revoke("user-1", BOARD_ID, INVITATION_ID),
      ).resolves.toBeUndefined();
    },
  );

  it.each([
    ["NOT_FOUND", 404, "INVITATION_NOT_FOUND"],
    ["FORBIDDEN", 403, "FORBIDDEN"],
    ["ADMIN_ROLE_REQUIRED", 403, "ADMIN_ROLE_REQUIRED"],
    ["ALREADY_ACCEPTED", 409, "INVITATION_NOT_PENDING"],
  ] as const)("maps %s to stable Problem Details", async (result, status, code) => {
    await expect(service(result).revoke("user-1", BOARD_ID, INVITATION_ID)).rejects.toMatchObject({
      status,
      code,
    });
  });
});
