import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createBetterAuth } from "./auth/config.js";
import { generateUuid } from "./auth/identity.js";
import { loadEnvironment, type Environment } from "./config/env.js";

export const DEMO_PASSWORD = "ksat-demo-password-2027";

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
    assignee: "grace@example.test",
    dueDate: "2027-04-18",
    description:
      "Email the fair committee to confirm our **corner booth**.\n\n- Table size\n- Power outlet",
  },
  {
    id: "01900000-0000-7000-8000-000000000702",
    boardId: "01900000-0000-7000-8000-000000000001",
    sequence: 2,
    name: "Curate photo prints for the fair",
    status: "IN_PROGRESS",
    priority: "MEDIUM",
    creator: "grace@example.test",
    assignee: "grace@example.test",
    dueDate: "2027-04-25",
    description:
      "Pick twelve prints for the wall. See the [fair guide](https://example.test/fair-guide).",
  },
  {
    id: "01900000-0000-7000-8000-000000000703",
    boardId: "01900000-0000-7000-8000-000000000001",
    sequence: 3,
    name: "Draft the press release",
    status: "COMPLETED",
    priority: "LOW",
    creator: "linus@example.test",
    assignee: null,
    dueDate: null,
    description: null,
  },
  {
    id: "01900000-0000-7000-8000-000000000704",
    boardId: "01900000-0000-7000-8000-000000000001",
    sequence: 4,
    name: "Old booth plan (superseded)",
    status: "ARCHIVED",
    priority: "LOW",
    creator: "ada@example.test",
    assignee: null,
    dueDate: null,
    description: null,
  },
  {
    id: "01900000-0000-7000-8000-000000000705",
    boardId: "01900000-0000-7000-8000-000000000002",
    sequence: 1,
    name: "Freeze the launch scope",
    status: "IN_PROGRESS",
    priority: "HIGH",
    creator: "grace@example.test",
    assignee: "ada@example.test",
    dueDate: "2027-05-02",
    description: null,
  },
  {
    id: "01900000-0000-7000-8000-000000000706",
    boardId: "01900000-0000-7000-8000-000000000002",
    sequence: 2,
    name: "Prepare the release notes",
    status: "NOT_STARTED",
    priority: "MEDIUM",
    creator: "ada@example.test",
    assignee: "maya@example.test",
    dueDate: null,
    description: "Summarize the frozen scope for the changelog.",
  },
  {
    id: "01900000-0000-7000-8000-000000000707",
    boardId: "01900000-0000-7000-8000-000000000003",
    sequence: 1,
    name: "Book the community hall",
    status: "COMPLETED",
    priority: "MEDIUM",
    creator: "maya@example.test",
    assignee: "maya@example.test",
    dueDate: "2027-03-14",
    description: null,
  },
  {
    id: "01900000-0000-7000-8000-000000000708",
    boardId: "01900000-0000-7000-8000-000000000004",
    sequence: 1,
    name: "Restock studio supplies",
    status: "NOT_STARTED",
    priority: "LOW",
    creator: "maya@example.test",
    assignee: null,
    dueDate: "2027-06-01",
    description: null,
  },
  {
    id: "01900000-0000-7000-8000-000000000709",
    boardId: "01900000-0000-7000-8000-000000000001",
    sequence: 5,
    name: "Arrange international print shipping",
    status: "NOT_STARTED",
    priority: "MEDIUM",
    creator: "linus@example.test",
    assignee: "linus@example.test",
    dueDate: "2027-04-12",
    description: "Compare tracked shipping options and confirm the customs paperwork deadline.",
  },
  {
    id: "01900000-0000-7000-8000-000000000710",
    boardId: "01900000-0000-7000-8000-000000000001",
    sequence: 6,
    name: "Design booth price cards",
    status: "IN_PROGRESS",
    priority: "LOW",
    creator: "ada@example.test",
    assignee: null,
    dueDate: null,
    description: null,
  },
  {
    id: "01900000-0000-7000-8000-000000000711",
    boardId: "01900000-0000-7000-8000-000000000002",
    sequence: 3,
    name: "Complete launch accessibility review",
    status: "NOT_STARTED",
    priority: "HIGH",
    creator: "ada@example.test",
    assignee: "ada@example.test",
    dueDate: "2027-04-28",
    description: "Review keyboard navigation, screen-reader labels, and reduced-motion behavior.",
  },
  {
    id: "01900000-0000-7000-8000-000000000712",
    boardId: "01900000-0000-7000-8000-000000000002",
    sequence: 4,
    name: "Record the product walkthrough",
    status: "IN_PROGRESS",
    priority: "MEDIUM",
    creator: "maya@example.test",
    assignee: "maya@example.test",
    dueDate: "2027-05-05",
    description: null,
  },
  {
    id: "01900000-0000-7000-8000-000000000713",
    boardId: "01900000-0000-7000-8000-000000000002",
    sequence: 5,
    name: "Approve launch email copy",
    status: "COMPLETED",
    priority: "LOW",
    creator: "grace@example.test",
    assignee: null,
    dueDate: null,
    description: "Final copy approved by product and support.",
  },
  {
    id: "01900000-0000-7000-8000-000000000714",
    boardId: "01900000-0000-7000-8000-000000000002",
    sequence: 6,
    name: "Retire the winter launch checklist",
    status: "ARCHIVED",
    priority: "LOW",
    creator: "grace@example.test",
    assignee: null,
    dueDate: null,
    description: null,
  },
  {
    id: "01900000-0000-7000-8000-000000000715",
    boardId: "01900000-0000-7000-8000-000000000003",
    sequence: 2,
    name: "Publish the workshop registration form",
    status: "IN_PROGRESS",
    priority: "HIGH",
    creator: "linus@example.test",
    assignee: "maya@example.test",
    dueDate: "2027-03-21",
    description: "Include dietary requirements and an accessibility request field.",
  },
  {
    id: "01900000-0000-7000-8000-000000000716",
    boardId: "01900000-0000-7000-8000-000000000003",
    sequence: 3,
    name: "Recruit meetup volunteers",
    status: "NOT_STARTED",
    priority: "MEDIUM",
    creator: "maya@example.test",
    assignee: null,
    dueDate: "2027-03-28",
    description: null,
  },
  {
    id: "01900000-0000-7000-8000-000000000717",
    boardId: "01900000-0000-7000-8000-000000000003",
    sequence: 4,
    name: "Draft facilitator briefing",
    status: "NOT_STARTED",
    priority: "LOW",
    creator: "linus@example.test",
    assignee: "linus@example.test",
    dueDate: null,
    description: "Document arrival times, room contacts, and the session handoff plan.",
  },
  {
    id: "01900000-0000-7000-8000-000000000718",
    boardId: "01900000-0000-7000-8000-000000000003",
    sequence: 5,
    name: "Send speaker thank-you notes",
    status: "COMPLETED",
    priority: "LOW",
    creator: "maya@example.test",
    assignee: "maya@example.test",
    dueDate: null,
    description: null,
  },
  {
    id: "01900000-0000-7000-8000-000000000719",
    boardId: "01900000-0000-7000-8000-000000000003",
    sequence: 6,
    name: "Archive last season's venue shortlist",
    status: "ARCHIVED",
    priority: "MEDIUM",
    creator: "linus@example.test",
    assignee: null,
    dueDate: null,
    description: null,
  },
  {
    id: "01900000-0000-7000-8000-000000000720",
    boardId: "01900000-0000-7000-8000-000000000004",
    sequence: 2,
    name: "Schedule the equipment safety check",
    status: "IN_PROGRESS",
    priority: "HIGH",
    creator: "maya@example.test",
    assignee: "ada@example.test",
    dueDate: "2027-05-20",
    description: "Inspect lighting stands, extension leads, and the shared cutting tools.",
  },
  {
    id: "01900000-0000-7000-8000-000000000721",
    boardId: "01900000-0000-7000-8000-000000000004",
    sequence: 3,
    name: "Update the studio access guide",
    status: "NOT_STARTED",
    priority: "MEDIUM",
    creator: "ada@example.test",
    assignee: "ada@example.test",
    dueDate: null,
    description: "Add the new alarm procedure and weekend contact details.",
  },
  {
    id: "01900000-0000-7000-8000-000000000722",
    boardId: "01900000-0000-7000-8000-000000000004",
    sequence: 4,
    name: "Reconcile shared material receipts",
    status: "COMPLETED",
    priority: "MEDIUM",
    creator: "maya@example.test",
    assignee: null,
    dueDate: "2027-05-10",
    description: null,
  },
  {
    id: "01900000-0000-7000-8000-000000000723",
    boardId: "01900000-0000-7000-8000-000000000004",
    sequence: 5,
    name: "Label the photography storage shelves",
    status: "NOT_STARTED",
    priority: "LOW",
    creator: "ada@example.test",
    assignee: null,
    dueDate: "2027-06-08",
    description: null,
  },
  {
    id: "01900000-0000-7000-8000-000000000724",
    boardId: "01900000-0000-7000-8000-000000000004",
    sequence: 6,
    name: "Archive the old keyholder rota",
    status: "ARCHIVED",
    priority: "LOW",
    creator: "maya@example.test",
    assignee: null,
    dueDate: null,
    description: "Superseded by the current access guide.",
  },
] as const;

/** Deterministic schedule attached to the first demo task for worker/UI smoke coverage. */
export const demoTaskSchedule = {
  id: "01900000-0000-7000-8000-000000000791",
  taskId: "01900000-0000-7000-8000-000000000701",
  rrule: "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO",
  timezone: "America/New_York",
  startLocal: "2027-04-19T09:00:00",
  nextRunAt: "2027-04-26T13:00:00.000Z",
  enabled: true,
} as const;

/** Deterministic same-board prerequisite edges: [task id, depends-on task id]. */
export const demoTaskDependencies = [
  ["01900000-0000-7000-8000-000000000702", "01900000-0000-7000-8000-000000000701"],
  ["01900000-0000-7000-8000-000000000706", "01900000-0000-7000-8000-000000000705"],
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
      const assigneeId = task.assignee === null ? null : (userIds.get(task.assignee) ?? null);
      if (task.assignee !== null && assigneeId === null) {
        throw new Error(`Missing demo task assignee: ${task.assignee}`);
      }
      const dueDate = task.dueDate === null ? null : new Date(`${task.dueDate}T00:00:00.000Z`);
      await prisma.task.upsert({
        where: { id: task.id },
        update: {
          name: task.name,
          description: task.description,
          status: task.status,
          priority: task.priority,
          createdById: creatorId,
          assigneeId,
          dueDate,
        },
        create: {
          id: task.id,
          boardId: task.boardId,
          sequence: task.sequence,
          name: task.name,
          description: task.description,
          status: task.status,
          priority: task.priority,
          createdById: creatorId,
          assigneeId,
          dueDate,
        },
      });
    }
    const boardOfTask = new Map<string, string>(demoTasks.map((task) => [task.id, task.boardId]));
    await prisma.taskSchedule.upsert({
      where: { id: demoTaskSchedule.id },
      update: {
        taskId: demoTaskSchedule.taskId,
        rrule: demoTaskSchedule.rrule,
        timezone: demoTaskSchedule.timezone,
        startLocal: demoTaskSchedule.startLocal,
        nextRunAt: new Date(demoTaskSchedule.nextRunAt),
        enabled: demoTaskSchedule.enabled,
      },
      create: {
        id: demoTaskSchedule.id,
        taskId: demoTaskSchedule.taskId,
        rrule: demoTaskSchedule.rrule,
        timezone: demoTaskSchedule.timezone,
        startLocal: demoTaskSchedule.startLocal,
        nextRunAt: new Date(demoTaskSchedule.nextRunAt),
        enabled: demoTaskSchedule.enabled,
      },
    });
    for (const [taskId, dependsOnTaskId] of demoTaskDependencies) {
      const boardId = boardOfTask.get(taskId);
      if (!boardId) throw new Error(`Missing demo dependency task: ${taskId}`);
      await prisma.taskDependency.upsert({
        where: { taskId_dependsOnTaskId: { taskId, dependsOnTaskId } },
        update: {},
        create: { boardId, taskId, dependsOnTaskId },
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
