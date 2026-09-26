import { Prisma, type PrismaClient } from "@prisma/client";
import type { BoardRole } from "@ksat/contracts";
import { generateUuid } from "../../auth/identity.js";
import { HttpError } from "../../errors.js";
import type {
  AcceptedInvitationRow,
  CreatePendingInvitationInput,
  CreatedInvitationRow,
  InvitationPage,
  InvitationPageRequest,
  InvitationPreviewRow,
  InvitationsRepository,
  PendingInvitationRow,
} from "./invitations.types.js";

const memberPreview = { id: true, name: true, avatarSeed: true } as const;

function cursorWhere(page: InvitationPageRequest): Record<string, unknown> {
  if (page.cursorKey === undefined || page.cursorId === undefined) return {};
  return {
    OR: [
      { createdAt: { lt: new Date(page.cursorKey) } },
      { createdAt: new Date(page.cursorKey), id: { lt: page.cursorId } },
    ],
  };
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

export function invitationCreateConflict(error: unknown): HttpError | undefined {
  if (!isUniqueConstraint(error) && !isSerializationConflict(error)) return undefined;
  return new HttpError(409, "INVITATION_CONFLICT", "A concurrent invitation already exists.");
}

export function createPrismaInvitationsRepository(prisma: PrismaClient): InvitationsRepository {
  return {
    async findMembershipRole(boardId, userId): Promise<BoardRole | null> {
      const row = await prisma.boardMembership.findUnique({
        where: { boardId_userId: { boardId, userId } },
        select: { role: true },
      });
      return row?.role ?? null;
    },

    async listPending(boardId, userId, page): Promise<InvitationPage> {
      const rows = await prisma.boardInvitation.findMany({
        where: {
          boardId,
          acceptedAt: null,
          revokedAt: null,
          board: { memberships: { some: { userId } } },
          ...cursorWhere(page),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.limit + 1,
        include: { invitedBy: { select: memberPreview } },
      });
      const hasMore = rows.length > page.limit;
      const pageRows = hasMore ? rows.slice(0, page.limit) : rows;
      const items: PendingInvitationRow[] = pageRows.map((row) => ({
        id: row.id,
        boardId: row.boardId,
        email: row.email,
        role: row.role,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        invitedBy: row.invitedBy,
      }));
      return { items, hasMore };
    },

    async createPending(input: CreatePendingInvitationInput): Promise<CreatedInvitationRow> {
      try {
        return await prisma.$transaction(
          async (tx) => {
            const board = await tx.board.findFirst({
              where: { id: input.boardId, memberships: { some: { userId: input.inviterId } } },
              select: { id: true, name: true },
            });
            if (!board) throw new HttpError(404, "BOARD_NOT_FOUND", "The board was not found.");
            const existingActor = await tx.boardMembership.findUnique({
              where: { boardId_userId: { boardId: input.boardId, userId: input.inviterId } },
              select: { userId: true },
            });
            if (!existingActor)
              throw new HttpError(404, "BOARD_NOT_FOUND", "The board was not found.");
            const account = await tx.user.findUnique({
              where: { email: input.email },
              select: { id: true },
            });
            if (account) {
              const member = await tx.boardMembership.findUnique({
                where: { boardId_userId: { boardId: input.boardId, userId: account.id } },
                select: { userId: true },
              });
              if (member)
                throw new HttpError(409, "ALREADY_MEMBER", "That user is already a board member.");
            }
            await tx.boardInvitation.updateMany({
              where: {
                boardId: input.boardId,
                email: input.email,
                acceptedAt: null,
                revokedAt: null,
              },
              data: { revokedAt: new Date() },
            });
            const row = await tx.boardInvitation.create({
              data: {
                id: generateUuid(),
                boardId: input.boardId,
                email: input.email,
                role: input.role,
                tokenHash: input.tokenHash,
                invitedById: input.inviterId,
                expiresAt: input.expiresAt,
              },
              include: { invitedBy: { select: { id: true, name: true } } },
            });
            return {
              id: row.id,
              boardId: row.boardId,
              boardName: board.name,
              email: row.email,
              role: row.role,
              invitedById: row.invitedById,
              inviterName: row.invitedBy.name,
              expiresAt: row.expiresAt,
              createdAt: row.createdAt,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof HttpError) throw error;
        const conflict = invitationCreateConflict(error);
        if (conflict) throw conflict;
        throw error;
      }
    },

    async revokePending(boardId, invitationId, actorId, now) {
      let attempt = 0;
      while (attempt < 3) {
        attempt += 1;
        try {
          return await prisma.$transaction(
            async (tx) => {
              const membership = await tx.boardMembership.findUnique({
                where: { boardId_userId: { boardId, userId: actorId } },
                select: { role: true },
              });
              if (!membership) return "NOT_FOUND" as const;
              if (membership.role !== "ADMIN" && membership.role !== "MANAGER")
                return "FORBIDDEN" as const;

              const invitation = await tx.boardInvitation.findFirst({
                where: { id: invitationId, boardId },
                select: { id: true, role: true, acceptedAt: true, revokedAt: true },
              });
              if (!invitation) return "NOT_FOUND" as const;
              if (membership.role === "MANAGER" && invitation.role === "ADMIN")
                return "ADMIN_ROLE_REQUIRED" as const;
              if (invitation.revokedAt) return "ALREADY_REVOKED" as const;
              if (invitation.acceptedAt) return "ALREADY_ACCEPTED" as const;

              await tx.boardInvitation.update({
                where: { id: invitation.id },
                data: { revokedAt: now },
              });
              return "REVOKED" as const;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
        } catch (error) {
          if (isSerializationConflict(error)) {
            if (attempt < 3) continue;
            throw new HttpError(
              409,
              "INVITATION_REVOKE_CONFLICT",
              "The invitation could not be cancelled concurrently.",
            );
          }
          throw error;
        }
      }
      throw new HttpError(
        409,
        "INVITATION_REVOKE_CONFLICT",
        "The invitation could not be cancelled concurrently.",
      );
    },

    async findByTokenHash(tokenHash): Promise<InvitationPreviewRow | null> {
      const row = await prisma.boardInvitation.findUnique({
        where: { tokenHash },
        include: { board: { select: { name: true } }, invitedBy: { select: memberPreview } },
      });
      if (!row) return null;
      return {
        boardId: row.boardId,
        boardName: row.board.name,
        email: row.email,
        role: row.role,
        expiresAt: row.expiresAt,
        invitedBy: row.invitedBy,
        acceptedAt: row.acceptedAt,
        revokedAt: row.revokedAt,
      };
    },

    async listMemberIds(boardId): Promise<readonly string[]> {
      const rows = await prisma.boardMembership.findMany({
        where: { boardId },
        select: { userId: true },
      });
      return rows.map((row) => row.userId);
    },

    async accept(tokenHash, userId, userEmail, now): Promise<AcceptedInvitationRow> {
      let attempt = 0;
      while (attempt < 3) {
        attempt += 1;
        try {
          return await prisma.$transaction(
            async (tx) => {
              const invitation = await tx.boardInvitation.findUnique({
                where: { tokenHash },
                include: { board: { select: { name: true } } },
              });
              if (!invitation)
                throw new HttpError(404, "INVITATION_NOT_FOUND", "The invitation was not found.");
              if (invitation.acceptedAt)
                throw new HttpError(
                  410,
                  "INVITATION_ALREADY_ACCEPTED",
                  "The invitation has already been accepted.",
                );
              if (invitation.revokedAt)
                throw new HttpError(
                  410,
                  "INVITATION_REVOKED",
                  "The invitation is no longer available.",
                );
              if (invitation.expiresAt <= now)
                throw new HttpError(410, "INVITATION_EXPIRED", "The invitation has expired.");
              if (invitation.email.toLowerCase() !== userEmail.toLowerCase())
                throw new HttpError(
                  403,
                  "INVITATION_EMAIL_MISMATCH",
                  "The signed-in email does not match this invitation.",
                );
              const existing = await tx.boardMembership.findUnique({
                where: { boardId_userId: { boardId: invitation.boardId, userId } },
                select: { joinedAt: true },
              });
              if (existing) {
                const updated = await tx.boardInvitation.updateMany({
                  where: {
                    id: invitation.id,
                    acceptedAt: null,
                    revokedAt: null,
                    expiresAt: { gt: now },
                  },
                  data: { acceptedAt: now, acceptedById: userId },
                });
                if (updated.count !== 1)
                  throw new HttpError(
                    410,
                    "INVITATION_UNAVAILABLE",
                    "The invitation is no longer available.",
                  );
                return {
                  boardId: invitation.boardId,
                  boardName: invitation.board.name,
                  role: invitation.role,
                  joinedAt: existing.joinedAt,
                  alreadyMember: true,
                };
              }
              const membership = await tx.boardMembership.create({
                data: {
                  id: generateUuid(),
                  boardId: invitation.boardId,
                  userId,
                  role: invitation.role,
                },
                select: { joinedAt: true },
              });
              const updated = await tx.boardInvitation.updateMany({
                where: {
                  id: invitation.id,
                  acceptedAt: null,
                  revokedAt: null,
                  expiresAt: { gt: now },
                },
                data: { acceptedAt: now, acceptedById: userId },
              });
              if (updated.count !== 1)
                throw new HttpError(
                  410,
                  "INVITATION_UNAVAILABLE",
                  "The invitation is no longer available.",
                );
              return {
                boardId: invitation.boardId,
                boardName: invitation.board.name,
                role: invitation.role,
                joinedAt: membership.joinedAt,
                alreadyMember: false,
              };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
        } catch (error) {
          if (isSerializationConflict(error) && attempt < 3) continue;
          if (isUniqueConstraint(error) && attempt < 3) continue;
          throw error;
        }
      }
      throw new HttpError(
        409,
        "INVITATION_ACCEPT_CONFLICT",
        "The invitation could not be accepted concurrently.",
      );
    },
  };
}
