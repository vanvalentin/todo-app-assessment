import type { BoardRole } from "@ksat/contracts";

export interface PendingInvitationRow {
  readonly id: string;
  readonly boardId: string;
  readonly email: string;
  readonly role: BoardRole;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly invitedBy: { readonly id: string; readonly name: string; readonly avatarSeed: string };
}

export interface InvitationPreviewRow {
  readonly boardId: string;
  readonly boardName: string;
  readonly email: string;
  readonly role: BoardRole;
  readonly expiresAt: Date;
  readonly invitedBy: { readonly id: string; readonly name: string; readonly avatarSeed: string };
  readonly acceptedAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface CreatedInvitationRow {
  readonly id: string;
  readonly boardId: string;
  readonly boardName: string;
  readonly email: string;
  readonly role: BoardRole;
  readonly invitedById: string;
  readonly inviterName: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface AcceptedInvitationRow {
  readonly boardId: string;
  readonly boardName: string;
  readonly role: BoardRole;
  readonly joinedAt: Date;
  readonly alreadyMember: boolean;
}

export interface InvitationPageRequest {
  readonly cursorId?: string;
  readonly cursorKey?: string;
  readonly limit: number;
}

export interface InvitationPage {
  readonly items: readonly PendingInvitationRow[];
  readonly hasMore: boolean;
}

export interface CreatePendingInvitationInput {
  readonly boardId: string;
  readonly inviterId: string;
  readonly email: string;
  readonly role: BoardRole;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export type RevokeInvitationResult =
  | "REVOKED"
  | "ALREADY_REVOKED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "ADMIN_ROLE_REQUIRED"
  | "ALREADY_ACCEPTED";

export interface InvitationsRepository {
  findMembershipRole(boardId: string, userId: string): Promise<BoardRole | null>;
  listPending(
    boardId: string,
    userId: string,
    page: InvitationPageRequest,
  ): Promise<InvitationPage>;
  createPending(input: CreatePendingInvitationInput): Promise<CreatedInvitationRow>;
  revokePending(
    boardId: string,
    invitationId: string,
    actorId: string,
    now: Date,
  ): Promise<RevokeInvitationResult>;
  findByTokenHash(tokenHash: string): Promise<InvitationPreviewRow | null>;
  listMemberIds(boardId: string): Promise<readonly string[]>;
  accept(
    tokenHash: string,
    userId: string,
    userEmail: string,
    now: Date,
  ): Promise<AcceptedInvitationRow>;
}
