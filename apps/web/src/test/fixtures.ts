import type {
  BoardMember,
  BoardSummary,
  InvitationPreview,
  PendingInvitation,
  Task,
} from "@ksat/contracts";

export const USER_IDS = {
  ada: "01900000-0000-7000-8000-000000000101",
  grace: "01900000-0000-7000-8000-000000000102",
  linus: "01900000-0000-7000-8000-000000000103",
  maya: "01900000-0000-7000-8000-000000000104",
  sofia: "01900000-0000-7000-8000-000000000105",
} as const;

export const BOARD_ID = "01900000-0000-7000-8000-000000000001";
export const INVITATION_TOKEN = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";

export const ada = {
  id: USER_IDS.ada,
  name: "Ada Lovelace",
  email: "ada@example.test",
  image: null,
  avatarSeed: "ada-seed",
};
export const grace = {
  id: USER_IDS.grace,
  name: "Grace Hopper",
  email: "grace@example.test",
  image: null,
  avatarSeed: "grace-seed",
};
export const linus = {
  id: USER_IDS.linus,
  name: "Linus Torvalds",
  email: "linus@example.test",
  image: null,
  avatarSeed: "linus-seed",
};
export const maya = {
  id: USER_IDS.maya,
  name: "Maya Chen",
  email: "maya@example.test",
  image: null,
  avatarSeed: "maya-seed",
};

export function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();
}

export function buildBoard(overrides: Partial<BoardSummary> = {}): BoardSummary {
  return {
    id: BOARD_ID,
    name: "Tokyo Zine Fair 2027",
    description: "Editorial planning for the Tokyo independent publishing fair.",
    ownerId: USER_IDS.ada,
    role: "ADMIN",
    memberCount: 3,
    memberPreview: [
      { id: USER_IDS.ada, name: "Ada Lovelace", avatarSeed: "ada-seed" },
      { id: USER_IDS.grace, name: "Grace Hopper", avatarSeed: "grace-seed" },
      { id: USER_IDS.linus, name: "Linus Torvalds", avatarSeed: "linus-seed" },
    ],
    version: 1,
    createdAt: "2027-01-12T09:00:00.000Z",
    updatedAt: isoMinutesAgo(12),
    ...overrides,
  };
}

export function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "01900000-0000-7000-8000-000000000301",
    boardId: BOARD_ID,
    sequence: 1,
    name: "Curate photo prints for Tokyo Zine Fair",
    status: "NOT_STARTED",
    priority: "MEDIUM",
    assignee: null,
    reporter: { id: USER_IDS.ada, name: "Ada Lovelace", avatarSeed: "ada-seed" },
    dueDate: null,
    createdBy: { id: USER_IDS.ada, name: "Ada Lovelace", avatarSeed: "ada-seed" },
    version: 1,
    createdAt: "2027-01-12T09:00:00.000Z",
    updatedAt: isoMinutesAgo(12),
    ...overrides,
  };
}

export function buildMember(overrides: Partial<BoardMember> = {}): BoardMember {
  return {
    boardId: BOARD_ID,
    userId: USER_IDS.ada,
    role: "ADMIN",
    joinedAt: "2027-01-12T09:00:00.000Z",
    user: {
      id: USER_IDS.ada,
      name: "Ada Lovelace",
      avatarSeed: "ada-seed",
      email: "ada@example.test",
    },
    ...overrides,
  };
}

export function buildPendingInvitation(
  overrides: Partial<PendingInvitation> = {},
): PendingInvitation {
  return {
    id: "01900000-0000-7000-8000-000000000201",
    boardId: BOARD_ID,
    email: "sofia.chen@example.test",
    role: "CONTRIBUTOR",
    invitedBy: { id: USER_IDS.ada, name: "Ada Lovelace", avatarSeed: "ada-seed" },
    expiresAt: isoDaysFromNow(6),
    createdAt: isoMinutesAgo(120),
    ...overrides,
  };
}

export function buildInvitationPreview(
  overrides: Partial<InvitationPreview> = {},
): InvitationPreview {
  return {
    boardId: BOARD_ID,
    boardName: "Tokyo Zine Fair 2027",
    email: "maya@example.test",
    role: "CONTRIBUTOR",
    invitedBy: { id: USER_IDS.ada, name: "Ada Lovelace", avatarSeed: "ada-seed" },
    expiresAt: isoDaysFromNow(6),
    ...overrides,
  };
}
