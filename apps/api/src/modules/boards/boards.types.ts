import type { BoardRole, CreateBoardRequest, UpdateBoardRequest } from "@ksat/contracts";

export interface MemberPreview {
  readonly id: string;
  readonly name: string;
  readonly avatarSeed: string;
}
export interface BoardWithRole {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly ownerId: string;
  readonly role: BoardRole;
  readonly memberCount: number;
  readonly memberPreview: readonly MemberPreview[];
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
export interface BoardMemberRow {
  readonly userId: string;
  readonly boardId: string;
  readonly role: BoardRole;
  readonly joinedAt: Date;
  readonly membershipId: string;
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly avatarSeed: string;
    readonly email: string;
  };
}
export interface PageRequest {
  readonly cursorId?: string | undefined;
  readonly cursorKey?: string | undefined;
  readonly limit: number;
}
export interface Page<T> {
  readonly items: readonly T[];
  readonly hasMore: boolean;
}
export type UpdateBoardResult =
  | {
      readonly kind: "UPDATED";
      readonly board: BoardWithRole;
      readonly memberIds: readonly string[];
    }
  | { readonly kind: "NOT_FOUND" }
  | { readonly kind: "FORBIDDEN" }
  | { readonly kind: "VERSION_CONFLICT" };

export interface BoardsRepository {
  createBoardForOwner(userId: string, input: CreateBoardRequest): Promise<BoardWithRole>;
  findMembershipRole(boardId: string, userId: string): Promise<BoardRole | null>;
  updateBoardForAdmin(
    boardId: string,
    userId: string,
    input: UpdateBoardRequest,
  ): Promise<UpdateBoardResult>;
  listBoardsForMember(userId: string, page: PageRequest): Promise<Page<BoardWithRole>>;
  getBoardForMember(boardId: string, userId: string): Promise<BoardWithRole | null>;
  listMembers(boardId: string, userId: string, page: PageRequest): Promise<Page<BoardMemberRow>>;
}
