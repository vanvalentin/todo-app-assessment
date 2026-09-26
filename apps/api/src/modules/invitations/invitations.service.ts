import type {
  AcceptInvitationResponse,
  BoardRole,
  CreateInvitationResponse,
  InvitationPreview,
  PendingInvitation,
  PendingInvitationListResponse,
} from "@ksat/contracts";
import { HttpError } from "../../errors.js";
import { decodeCursor, encodeCursor } from "../../lib/cursor.js";
import { generateInvitationToken, hashInvitationToken } from "../../lib/tokens.js";
import type { Mailer } from "../../infrastructure/mail.js";
import { sendInvitationEmailSafely } from "../../infrastructure/mail.js";
import type { Logger } from "../../logging.js";
import type { BoardListCache } from "../boards/boards.cache.js";
import { createNoopBoardListCache } from "../boards/boards.cache.js";
import type { InvitationsRepository } from "./invitations.types.js";

export interface InvitationsServiceDeps {
  readonly repository: InvitationsRepository;
  readonly mailer: Mailer;
  readonly logger: Logger;
  readonly appPublicUrl: string;
  readonly ttlHours: number;
  readonly boardCache?: BoardListCache;
}

export interface InvitationsService {
  listPending(
    userId: string,
    boardId: string,
    query: { readonly cursor?: string; readonly limit: number },
  ): Promise<PendingInvitationListResponse>;
  revoke(userId: string, boardId: string, invitationId: string, now?: Date): Promise<void>;
  create(
    userId: string,
    boardId: string,
    email: string,
    role: BoardRole,
  ): Promise<CreateInvitationResponse>;
  preview(token: string, now?: Date): Promise<InvitationPreview>;
  accept(
    token: string,
    userId: string,
    userEmail: string,
    now?: Date,
  ): Promise<AcceptInvitationResponse>;
}

function boardNotFound(): HttpError {
  return new HttpError(404, "BOARD_NOT_FOUND", "The board was not found.");
}
function forbidden(): HttpError {
  return new HttpError(403, "FORBIDDEN", "You do not have permission to perform this action.");
}
function invitationUnavailable(
  row: {
    readonly acceptedAt: Date | null;
    readonly revokedAt: Date | null;
    readonly expiresAt: Date;
  },
  now: Date,
): HttpError {
  if (row.acceptedAt)
    return new HttpError(
      410,
      "INVITATION_ALREADY_ACCEPTED",
      "The invitation has already been accepted.",
    );
  if (row.revokedAt)
    return new HttpError(410, "INVITATION_REVOKED", "The invitation is no longer available.");
  if (row.expiresAt <= now)
    return new HttpError(410, "INVITATION_EXPIRED", "The invitation has expired.");
  return new HttpError(410, "INVITATION_UNAVAILABLE", "The invitation is no longer available.");
}

export function createInvitationsService(deps: InvitationsServiceDeps): InvitationsService {
  const { repository, mailer, logger, appPublicUrl, ttlHours } = deps;
  const boardCache = deps.boardCache ?? createNoopBoardListCache();
  return {
    async listPending(userId, boardId, query): Promise<PendingInvitationListResponse> {
      const role = await repository.findMembershipRole(boardId, userId);
      if (!role) throw boardNotFound();
      if (role !== "ADMIN" && role !== "MANAGER") throw forbidden();
      const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
      if (query.cursor !== undefined && !cursor)
        throw new HttpError(400, "INVALID_CURSOR", "The pagination cursor is invalid.");
      const page = await repository.listPending(boardId, userId, {
        ...(cursor ? { cursorKey: cursor.k, cursorId: cursor.id } : {}),
        limit: query.limit,
      });
      const last = page.items.at(-1);
      return {
        items: page.items.map(
          (row): PendingInvitation => ({
            id: row.id,
            boardId: row.boardId,
            email: row.email,
            role: row.role,
            invitedBy: row.invitedBy,
            expiresAt: row.expiresAt.toISOString(),
            createdAt: row.createdAt.toISOString(),
          }),
        ),
        nextCursor:
          page.hasMore && last
            ? encodeCursor({ k: last.createdAt.toISOString(), id: last.id })
            : null,
      };
    },

    async revoke(userId, boardId, invitationId, now = new Date()): Promise<void> {
      const result = await repository.revokePending(boardId, invitationId, userId, now);
      if (result === "NOT_FOUND")
        throw new HttpError(404, "INVITATION_NOT_FOUND", "The invitation was not found.");
      if (result === "FORBIDDEN") throw forbidden();
      if (result === "ADMIN_ROLE_REQUIRED")
        throw new HttpError(
          403,
          "ADMIN_ROLE_REQUIRED",
          "Only admins may cancel an admin invitation.",
        );
      if (result === "ALREADY_ACCEPTED")
        throw new HttpError(
          409,
          "INVITATION_NOT_PENDING",
          "The invitation has already been accepted.",
        );
      if (result === "REVOKED") {
        logger.info({ boardId, invitationId, actorId: userId }, "Board invitation cancelled");
      }
    },

    async create(userId, boardId, email, role): Promise<CreateInvitationResponse> {
      const actorRole = await repository.findMembershipRole(boardId, userId);
      if (!actorRole) throw boardNotFound();
      if (actorRole !== "ADMIN" && actorRole !== "MANAGER") throw forbidden();
      if (role === "ADMIN" && actorRole !== "ADMIN")
        throw new HttpError(403, "ADMIN_ROLE_REQUIRED", "Only admins may invite another admin.");
      const token = generateInvitationToken();
      const created = await repository.createPending({
        boardId,
        inviterId: userId,
        email,
        role,
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(Date.now() + ttlHours * 3_600_000),
      });
      const publicUrl = appPublicUrl.replace(/\/$/, "");
      const emailDelivery = await sendInvitationEmailSafely(mailer, logger, {
        to: created.email,
        boardName: created.boardName,
        inviterName: created.inviterName,
        role: created.role,
        acceptUrl: `${publicUrl}/invitations/${token}`,
        expiresAt: created.expiresAt,
      });
      return {
        id: created.id,
        boardId: created.boardId,
        email: created.email,
        role: created.role,
        invitedById: created.invitedById,
        expiresAt: created.expiresAt.toISOString(),
        createdAt: created.createdAt.toISOString(),
        emailDelivery,
      };
    },

    async preview(token, now = new Date()): Promise<InvitationPreview> {
      const row = await deps.repository.findByTokenHash(hashInvitationToken(token));
      if (!row) throw new HttpError(404, "INVITATION_NOT_FOUND", "The invitation was not found.");
      if (row.acceptedAt || row.revokedAt || row.expiresAt <= now)
        throw invitationUnavailable(row, now);
      return {
        boardId: row.boardId,
        boardName: row.boardName,
        email: row.email,
        role: row.role,
        invitedBy: row.invitedBy,
        expiresAt: row.expiresAt.toISOString(),
      };
    },

    async accept(token, userId, userEmail, now = new Date()): Promise<AcceptInvitationResponse> {
      const row = await deps.repository.accept(hashInvitationToken(token), userId, userEmail, now);
      await boardCache.invalidateForUsers(await repository.listMemberIds(row.boardId));
      return {
        boardId: row.boardId,
        boardName: row.boardName,
        role: row.role,
        joinedAt: row.joinedAt.toISOString(),
        alreadyMember: row.alreadyMember,
      };
    },
  };
}
