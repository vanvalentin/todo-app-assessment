import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { invitationCreateConflict } from "../src/modules/invitations/invitations.repository.js";

describe("invitation creation conflicts", () => {
  it("maps serializable transaction failures to a stable conflict", () => {
    const error = new Prisma.PrismaClientKnownRequestError("serialization failure", {
      code: "P2034",
      clientVersion: "6.7.0",
    });
    const mapped = invitationCreateConflict(error);

    expect(mapped?.status).toBe(409);
    expect(mapped?.code).toBe("INVITATION_CONFLICT");
  });
});
