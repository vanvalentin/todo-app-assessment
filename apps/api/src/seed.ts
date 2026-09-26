import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createBetterAuth } from "./auth/config.js";
import { generateUuid } from "./auth/identity.js";
import { loadEnvironment, type Environment } from "./config/env.js";

const DEMO_PASSWORD = "ksat-demo-password-2027";

export function assertDemoSeedAllowed(
  environment: Pick<Environment, "NODE_ENV" | "SEED_DEMO_DATA" | "ALLOW_PRODUCTION_DEMO_SEED">,
): void {
  if (
    environment.NODE_ENV === "production" &&
    environment.SEED_DEMO_DATA &&
    !environment.ALLOW_PRODUCTION_DEMO_SEED
  ) {
    throw new Error(
      "Demo seed data is disabled in production. Set ALLOW_PRODUCTION_DEMO_SEED=true only for an explicit, audited override.",
    );
  }
}

const users = [
  { email: "ada@example.test", name: "Ada Lovelace" },
  { email: "grace@example.test", name: "Grace Hopper" },
  { email: "linus@example.test", name: "Linus Torvalds" },
  { email: "maya@example.test", name: "Maya Chen" },
] as const;
const boards = [
  {
    id: "01900000-0000-7000-8000-000000000001",
    name: "Tokyo Zine Fair 2027",
    description: "Editorial planning for the Tokyo independent publishing fair.",
    owner: "ada@example.test",
    members: [
      ["ada@example.test", "ADMIN"],
      ["grace@example.test", "MANAGER"],
      ["linus@example.test", "CONTRIBUTOR"],
    ],
  },
  {
    id: "01900000-0000-7000-8000-000000000002",
    name: "Spring Product Launch",
    description: "Launch checklist for the spring product release.",
    owner: "grace@example.test",
    members: [
      ["grace@example.test", "ADMIN"],
      ["ada@example.test", "MANAGER"],
      ["maya@example.test", "CONTRIBUTOR"],
    ],
  },
  {
    id: "01900000-0000-7000-8000-000000000003",
    name: "Community Events",
    description: "Planning for community workshops and meetups.",
    owner: "linus@example.test",
    members: [
      ["linus@example.test", "ADMIN"],
      ["maya@example.test", "MANAGER"],
    ],
  },
  {
    id: "01900000-0000-7000-8000-000000000004",
    name: "Studio Operations",
    description: "Shared studio operations and recurring housekeeping.",
    owner: "maya@example.test",
    members: [
      ["maya@example.test", "ADMIN"],
      ["ada@example.test", "CONTRIBUTOR"],
    ],
  },
] as const;

/**
 * Deterministic demo tasks for the Kanban slice. Fixed ids and sequences keep the
 * seed idempotent and make a seeded database reproducible; the archived row
 * demonstrates that board reads exclude ARCHIVED tasks.
 */
export const demoTasks = [
  {
    id: "01900000-0000-7000-8000-000000000701",
    boardId: "01900000-0000-7000-8000-000000000001",
    sequence: 1,
    name: "Confirm zine fair booth allocation",
    status: "NOT_STARTED",
    priority: "HIGH",
    creator: "ada@example.test",
  },
  {
    id: "01900000-0000-7000-8000-000000000702",
    boardId: "01900000-0000-7000-8000-000000000001",
    sequence: 2,
    name: "Curate photo prints for the fair",
    status: "IN_PROGRESS",
    priority: "MEDIUM",
    creator: "grace@example.test",
  },
  {
    id: "01900000-0000-7000-8000-000000000703",
    boardId: "01900000-0000-7000-8000-000000000001",
    sequence: 3,
    name: "Draft the press release",
    status: "COMPLETED",
    priority: "LOW",
    creator: "linus@example.test",
  },
  {
    id: "01900000-0000-7000-8000-000000000704",
    boardId: "01900000-0000-7000-8000-000000000001",
    sequence: 4,
    name: "Old booth plan (superseded)",
    status: "ARCHIVED",
    priority: "LOW",
    creator: "ada@example.test",
  },
  {
    id: "01900000-0000-7000-8000-000000000705",
    boardId: "01900000-0000-7000-8000-000000000002",
    sequence: 1,
    name: "Freeze the launch scope",
    status: "IN_PROGRESS",
    priority: "HIGH",
    creator: "grace@example.test",
  },
  {
    id: "01900000-0000-7000-8000-000000000706",
    boardId: "01900000-0000-7000-8000-000000000002",
    sequence: 2,
    name: "Prepare the release notes",
    status: "NOT_STARTED",
    priority: "MEDIUM",
    creator: "ada@example.test",
  },
  {
    id: "01900000-0000-7000-8000-000000000707",
    boardId: "01900000-0000-7000-8000-000000000003",
    sequence: 1,
    name: "Book the community hall",
    status: "COMPLETED",
    priority: "MEDIUM",
    creator: "maya@example.test",
  },
  {
    id: "01900000-0000-7000-8000-000000000708",
    boardId: "01900000-0000-7000-8000-000000000004",
    sequence: 1,
    name: "Restock studio supplies",
    status: "NOT_STARTED",
    priority: "LOW",
    creator: "maya@example.test",
  },
] as const;

export async function seed(): Promise<void> {
  const environment = loadEnvironment();
  assertDemoSeedAllowed(environment);
  if (!environment.SEED_DEMO_DATA) return;
  const prisma = new PrismaClient({ datasources: { db: { url: environment.DATABASE_URL } } });
  try {
    const { auth } = createBetterAuth({ prisma, environment });
    const userIds = new Map<string, string>();
    for (const user of users) {
      let record = await prisma.user.findUnique({
        where: { email: user.email },
        select: { id: true },
      });
      if (!record) {
        await auth.api.signUpEmail({
          body: { name: user.name, email: user.email, password: DEMO_PASSWORD },
          headers: new Headers({ origin: environment.BETTER_AUTH_URL }),
        });
        record = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true },
        });
      }
      if (!record) throw new Error(`Demo user was not created: ${user.email}`);
      userIds.set(user.email, record.id);
    }
    for (const board of boards) {
      const ownerId = userIds.get(board.owner);
      if (!ownerId) throw new Error(`Missing demo board owner: ${board.owner}`);
      await prisma.board.upsert({
        where: { id: board.id },
        update: { name: board.name, description: board.description, ownerId },
        create: { id: board.id, name: board.name, description: board.description, ownerId },
      });
      for (const [email, role] of board.members) {
        const userId = userIds.get(email);
        if (!userId) throw new Error(`Missing demo member: ${email}`);
        await prisma.boardMembership.upsert({
          where: { boardId_userId: { boardId: board.id, userId } },
          update: { role },
          create: { id: generateUuid(), boardId: board.id, userId, role },
        });
      }
    }
    for (const task of demoTasks) {
      const creatorId = userIds.get(task.creator);
      if (!creatorId) throw new Error(`Missing demo task creator: ${task.creator}`);
      await prisma.task.upsert({
        where: { id: task.id },
        update: {
          name: task.name,
          status: task.status,
          priority: task.priority,
          createdById: creatorId,
        },
        create: {
          id: task.id,
          boardId: task.boardId,
          sequence: task.sequence,
          name: task.name,
          status: task.status,
          priority: task.priority,
          createdById: creatorId,
        },
      });
    }
    // Keep each board counter ahead of the deterministic rows so tasks created later
    // in a seeded database never collide with the demo sequences.
    for (const board of boards) {
      const highest = demoTasks
        .filter((task) => task.boardId === board.id)
        .reduce((max, task) => Math.max(max, task.sequence), 0);
      await prisma.board.update({
        where: { id: board.id },
        data: { nextTaskSequence: highest + 1 },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Matches both the compiled entry point and the tsx dev entry point, so
// `pnpm db:seed` and the Compose migrate job both run the seed.
const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain)
  seed().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
