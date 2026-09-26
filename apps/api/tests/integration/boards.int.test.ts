import { PrismaClient } from "@prisma/client";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createPrismaInvitationsRepository } from "../../src/modules/invitations/invitations.repository.js";
import { createPrismaBoardsRepository } from "../../src/modules/boards/boards.repository.js";

const configuredDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const databaseUrl = configuredDatabaseUrl ?? "postgresql://invalid/ksat_test";
const run = configuredDatabaseUrl ? describe : describe.skip;
const ids = {
  admin: "01900000-0000-7000-8000-000000000091",
  member: "01900000-0000-7000-8000-000000000092",
  invitee: "01900000-0000-7000-8000-000000000096",
  raceInvitee: "01900000-0000-7000-8000-000000000097",
  board: "01900000-0000-7000-8000-000000000093",
};

run("PostgreSQL boards and invitations", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const repository = createPrismaInvitationsRepository(prisma);
  const boardsRepository = createPrismaBoardsRepository(prisma);
  beforeAll(async () => {
    await prisma.board.deleteMany({ where: { id: ids.board } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.admin, ids.member, ids.invitee, ids.raceInvitee] } },
    });
    await prisma.user.createMany({
      data: [
        {
          id: ids.admin,
          name: "Integration Admin",
          email: "integration-admin@example.test",
          avatarSeed: "admin-seed",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: ids.member,
          name: "Integration Member",
          email: "integration-member@example.test",
          avatarSeed: "member-seed",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: ids.invitee,
          name: "Integration Invitee",
          email: "integration-invitee@example.test",
          avatarSeed: "invitee-seed",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: ids.raceInvitee,
          name: "Race Invitee",
          email: "race-invitee@example.test",
          avatarSeed: "race-seed",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    await prisma.board.create({
      data: {
        id: ids.board,
        name: "Integration Board",
        ownerId: ids.admin,
        memberships: {
          create: [
            { id: "01900000-0000-7000-8000-000000000094", userId: ids.admin, role: "ADMIN" },
            { id: "01900000-0000-7000-8000-000000000095", userId: ids.member, role: "CONTRIBUTOR" },
          ],
        },
      },
    });
  });
  afterAll(async () => {
    await prisma.board.deleteMany({ where: { id: ids.board } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.admin, ids.member, ids.invitee, ids.raceInvitee] } },
    });
    await prisma.$disconnect();
  });
  it("creates a board and its owner ADMIN membership atomically", async () => {
    const created = await boardsRepository.createBoardForOwner(ids.admin, {
      name: "Created integration board",
      description: null,
    });
    try {
      expect(created).toMatchObject({
        name: "Created integration board",
        ownerId: ids.admin,
        role: "ADMIN",
        memberCount: 1,
      });
      await expect(
        prisma.boardMembership.findUnique({
          where: { boardId_userId: { boardId: created.id, userId: ids.admin } },
        }),
      ).resolves.toMatchObject({ role: "ADMIN" });
    } finally {
      await prisma.board.delete({ where: { id: created.id } });
    }
  });

  it("updates an admin board atomically and leaves stale writes untouched", async () => {
    const updated = await boardsRepository.updateBoardForAdmin(ids.board, ids.admin, {
      name: "Renamed integration board",
      description: "Updated safely",
      version: 1,
    });
    expect(updated.kind).toBe("UPDATED");
    expect(updated).toMatchObject({ kind: "UPDATED", memberIds: [ids.admin, ids.member] });

    const stale = await boardsRepository.updateBoardForAdmin(ids.board, ids.admin, {
      name: "Must not win",
      description: null,
      version: 1,
    });
    expect(stale).toEqual({ kind: "VERSION_CONFLICT" });
    await expect(prisma.board.findUnique({ where: { id: ids.board } })).resolves.toMatchObject({
      name: "Renamed integration board",
      description: "Updated safely",
      version: 2,
    });
  });

  it("constrains invitation creation to a member and replaces pending email invites", async () => {
    const first = await repository.createPending({
      boardId: ids.board,
      inviterId: ids.admin,
      email: "new@example.test",
      role: "CONTRIBUTOR",
      tokenHash: "integration-token-1",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await expect(
      repository.createPending({
        boardId: ids.board,
        inviterId: ids.admin,
        email: "new@example.test",
        role: "CONTRIBUTOR",
        tokenHash: "integration-token-2",
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
    ).resolves.toMatchObject({ id: expect.any(String) });
    const rows = await prisma.boardInvitation.findMany({
      where: { boardId: ids.board, email: "new@example.test" },
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === first.id)?.revokedAt).not.toBeNull();
  });
  it("maps concurrent invitation-create conflicts to a client conflict", async () => {
    const results = await Promise.allSettled([
      repository.createPending({
        boardId: ids.board,
        inviterId: ids.admin,
        email: "concurrent@example.test",
        role: "CONTRIBUTOR",
        tokenHash: "integration-token-concurrent-1",
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
      repository.createPending({
        boardId: ids.board,
        inviterId: ids.admin,
        email: "concurrent@example.test",
        role: "CONTRIBUTOR",
        tokenHash: "integration-token-concurrent-2",
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
    ]);

    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toMatchObject({
          status: 409,
          code: "INVITATION_CONFLICT",
        });
      }
    }
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
  });

  it("cancels a pending invitation idempotently and blocks its token", async () => {
    const invitation = await repository.createPending({
      boardId: ids.board,
      inviterId: ids.admin,
      email: "cancelled@example.test",
      role: "CONTRIBUTOR",
      tokenHash: "integration-token-cancelled",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const now = new Date();
    await expect(repository.revokePending(ids.board, invitation.id, ids.admin, now)).resolves.toBe(
      "REVOKED",
    );
    await expect(
      repository.revokePending(ids.board, invitation.id, ids.admin, new Date()),
    ).resolves.toBe("ALREADY_REVOKED");
    await expect(
      repository.accept(
        "integration-token-cancelled",
        ids.invitee,
        "integration-invitee@example.test",
        new Date(),
      ),
    ).rejects.toMatchObject({ status: 410, code: "INVITATION_REVOKED" });
  });

  it("allows only acceptance or cancellation to win concurrently", async () => {
    const invitation = await repository.createPending({
      boardId: ids.board,
      inviterId: ids.admin,
      email: "race-invitee@example.test",
      role: "CONTRIBUTOR",
      tokenHash: "integration-token-cancel-race",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const now = new Date();
    await Promise.allSettled([
      repository.accept(
        "integration-token-cancel-race",
        ids.raceInvitee,
        "race-invitee@example.test",
        now,
      ),
      repository.revokePending(ids.board, invitation.id, ids.admin, now),
    ]);

    const stored = await prisma.boardInvitation.findUniqueOrThrow({
      where: { id: invitation.id },
      select: { acceptedAt: true, revokedAt: true },
    });
    expect(stored.acceptedAt === null).not.toBe(stored.revokedAt === null);
    expect(
      await prisma.boardMembership.count({
        where: { boardId: ids.board, userId: ids.raceInvitee },
      }),
    ).toBe(stored.acceptedAt === null ? 0 : 1);
  });

  it("allows only one concurrent acceptance to add the membership", async () => {
    const created = await repository.createPending({
      boardId: ids.board,
      inviterId: ids.admin,
      email: "integration-invitee@example.test",
      role: "MANAGER",
      tokenHash: "integration-token-3",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const results = await Promise.allSettled([
      repository.accept(
        "integration-token-3",
        ids.invitee,
        "integration-invitee@example.test",
        new Date(),
      ),
      repository.accept(
        "integration-token-3",
        ids.invitee,
        "integration-invitee@example.test",
        new Date(),
      ),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.boardMembership.count({ where: { boardId: ids.board, userId: ids.invitee } }),
    ).toBe(1);
    expect(created.id).toBeTypeOf("string");
  });
});
