import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  Prisma,
  PrismaClient,
  type BoardRole,
  type TaskPriority,
  type TaskStatus,
} from "@prisma/client";
import { z } from "zod";
import { createBetterAuth } from "./auth/config.js";
import { generateAvatarSeed } from "./auth/identity.js";
import { loadEnvironment, type Environment } from "./config/env.js";
import { parseSchedule } from "./modules/tasks/recurrence.js";
import { DEMO_PASSWORD } from "./seed.js";

/**
 * Volume seed: a deterministic, clearly non-production dataset with many users,
 * boards, and one very large board, for exercising filters, pagination, and the
 * virtualized board at assessment scale. It is an explicit command, never part of
 * the Compose migrate job, and is safe to re-run: every row has a deterministic id
 * and is inserted with ON CONFLICT DO NOTHING.
 */

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export const volumeSeedOptionsSchema = z.object({
  users: z.coerce.number().int().min(2).max(5_000).default(200),
  boards: z.coerce.number().int().min(0).max(500).default(20),
  largeBoardTasks: z.coerce.number().int().min(0).max(100_000).default(10_000),
  tasksPerBoard: z.coerce.number().int().min(0).max(10_000).default(250),
  referenceDate: z
    .string()
    .regex(isoDate)
    .refine((value) => new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value), {
      message: "Invalid calendar date",
    })
    .default(todayUtc),
  dataset: z.coerce.number().int().min(0).max(4_095).default(0),
});
export type VolumeSeedOptions = z.output<typeof volumeSeedOptionsSchema>;

export interface PlannedUser {
  readonly index: number;
  readonly email: string;
  readonly name: string;
}

export interface PlannedMembership {
  readonly id: string;
  readonly userIndex: number;
  readonly role: BoardRole;
}

export interface PlannedBoard {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly ownerIndex: number;
  readonly members: readonly PlannedMembership[];
}

export interface PlannedTask {
  readonly id: string;
  readonly boardId: string;
  readonly sequence: number;
  readonly name: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly creatorIndex: number;
  readonly assigneeIndex: number | null;
  readonly dueDate: string | null;
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
}

export interface PlannedDependency {
  readonly boardId: string;
  readonly taskId: string;
  readonly dependsOnTaskId: string;
}

export interface PlannedSchedule {
  readonly id: string;
  readonly taskId: string;
  readonly rrule: string;
  readonly timezone: string;
  readonly startLocal: string;
  readonly nextRunAt: Date | null;
}

export interface VolumePlan {
  readonly users: readonly PlannedUser[];
  readonly boards: readonly PlannedBoard[];
  readonly tasks: readonly PlannedTask[];
  readonly dependencies: readonly PlannedDependency[];
  readonly schedules: readonly PlannedSchedule[];
}

const FIRST_NAMES = [
  "Ada",
  "Grace",
  "Alan",
  "Maya",
  "Linus",
  "Hedy",
  "Kenji",
  "Amara",
  "Sofia",
  "Omar",
  "Priya",
  "Lars",
  "Chloe",
  "Diego",
  "Yuki",
  "Noah",
];
const LAST_NAMES = [
  "Lovelace",
  "Hopper",
  "Turing",
  "Chen",
  "Lamarr",
  "Okafor",
  "Tanaka",
  "Silva",
  "Haddad",
  "Iyer",
  "Berg",
  "Martin",
  "Rossi",
  "Novak",
  "Kowalski",
  "Dubois",
];
const TEAMS = [
  "Studio",
  "Growth",
  "Platform",
  "Editorial",
  "Events",
  "Support",
  "Design",
  "Finance",
  "People",
  "Partnerships",
];
const PROJECTS = [
  "Roadmap",
  "Launch",
  "Operations",
  "Backlog",
  "Campaign",
  "Migration",
  "Offsite",
  "Audit",
  "Onboarding",
  "Refresh",
];
const VERBS = [
  "Draft",
  "Review",
  "Confirm",
  "Update",
  "Prepare",
  "Publish",
  "Audit",
  "Schedule",
  "Design",
  "Test",
  "Migrate",
  "Document",
  "Order",
  "Book",
  "Refine",
];
const NOUNS = [
  "press release",
  "booth layout",
  "launch checklist",
  "onboarding guide",
  "pricing page",
  "vendor contract",
  "newsletter",
  "photo prints",
  "release notes",
  "budget sheet",
  "venue booking",
  "social campaign",
  "support macros",
  "API docs",
  "inventory count",
];
const QUALIFIERS = [
  "",
  "",
  "for Q3",
  "for the fair",
  "with legal",
  "before launch",
  "for partners",
  "v2",
  "for EMEA",
  "for the workshop",
];
const DESCRIPTIONS = [
  "Coordinate with the owner and capture decisions in the thread.\n\n- Agree scope\n- Share a draft",
  "See the **shared brief** before starting. Keep the change small.",
  "Follow up with the vendor and attach the confirmation once received.",
];
const TIMEZONES = ["America/New_York", "Europe/London", "Asia/Tokyo", "Australia/Sydney"];
const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR"];
const MAX_DEPENDENCIES = 20;
const MAX_SCHEDULES_PER_BOARD = 5;

/** Small, fast, seedable PRNG so the same options always produce the same plan. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("Cannot pick from an empty list");
  return item;
}

function hex(value: number, width: number): string {
  return value.toString(16).padStart(width, "0");
}

function datasetTag(dataset: number): string {
  return `9${hex(dataset, 3)}`;
}

/** Every volume board id shares this prefix, which is how --reset finds them. */
export function volumeBoardIdPrefix(dataset: number): string {
  return `01900000-0000-7000-${datasetTag(dataset)}-`;
}

function boardId(dataset: number, board: number): string {
  return `${volumeBoardIdPrefix(dataset)}${hex(board, 12)}`;
}

function childId(kind: 1 | 2 | 3, dataset: number, board: number, index: number): string {
  return `0190000${kind}-0000-7${hex(board, 3)}-${datasetTag(dataset)}-${hex(index, 12)}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function volumeUserEmail(index: number): string {
  return `volume.user.${String(index + 1).padStart(4, "0")}@example.test`;
}

function planMembers(
  dataset: number,
  board: number,
  users: number,
  random: () => number,
): PlannedMembership[] {
  let indexes: number[];
  if (board === 0) {
    indexes = Array.from({ length: users }, (_, index) => index);
  } else {
    const pool = Array.from({ length: users }, (_, index) => index);
    const size = Math.min(users, 3 + Math.floor(random() * 23));
    for (let index = 0; index < size; index += 1) {
      const swap = index + Math.floor(random() * (pool.length - index));
      const current = pool[index];
      const other = pool[swap];
      if (current === undefined || other === undefined) throw new Error("Invalid member shuffle");
      pool[index] = other;
      pool[swap] = current;
    }
    indexes = pool.slice(0, size);
    // The first volume user belongs to every board, so one login reaches the whole dataset.
    if (!indexes.includes(0)) indexes[indexes.length - 1] = 0;
  }
  return indexes.map((userIndex, position) => {
    const role: BoardRole =
      board === 0
        ? userIndex === 0
          ? "ADMIN"
          : userIndex < 5
            ? "MANAGER"
            : "CONTRIBUTOR"
        : position === 0
          ? "ADMIN"
          : position === 1
            ? "MANAGER"
            : "CONTRIBUTOR";
    return { id: childId(2, dataset, board, userIndex), userIndex, role };
  });
}

function pickStatus(random: () => number): TaskStatus {
  const roll = random();
  if (roll < 0.4) return "NOT_STARTED";
  if (roll < 0.65) return "IN_PROGRESS";
  if (roll < 0.92) return "COMPLETED";
  return "ARCHIVED";
}

function pickPriority(random: () => number): TaskPriority {
  const roll = random();
  if (roll < 0.25) return "HIGH";
  if (roll < 0.7) return "MEDIUM";
  return "LOW";
}

export function buildVolumePlan(input: Partial<VolumeSeedOptions> = {}): VolumePlan {
  const options = volumeSeedOptionsSchema.parse(input);
  const { dataset, referenceDate } = options;
  const referenceMidnight = new Date(`${referenceDate}T00:00:00.000Z`);

  const users: PlannedUser[] = Array.from({ length: options.users }, (_, index) => ({
    index,
    email: volumeUserEmail(index),
    name: `${FIRST_NAMES[index % FIRST_NAMES.length] ?? "User"} ${
      LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length] ?? "Volume"
    } ${index + 1}`,
  }));

  const boards: PlannedBoard[] = [];
  const tasks: PlannedTask[] = [];
  const dependencies: PlannedDependency[] = [];
  const schedules: PlannedSchedule[] = [];

  for (let board = 0; board <= options.boards; board += 1) {
    const random = mulberry32(dataset * 100_003 + board * 7_919 + 17);
    const id = boardId(dataset, board);
    const members = planMembers(dataset, board, options.users, random);
    const owner = members[0];
    if (!owner) throw new Error("A volume board needs at least one member");
    const taskCount = board === 0 ? options.largeBoardTasks : options.tasksPerBoard;
    boards.push({
      id,
      name:
        board === 0
          ? `Volume: large board (${taskCount.toLocaleString("en-US")} tasks)`
          : `Volume: ${pick(TEAMS, random)} ${pick(PROJECTS, random)} ${board}`,
      description: "Generated, non-production volume data for performance and filter review.",
      ownerIndex: owner.userIndex,
      members,
    });

    const boardTasks: PlannedTask[] = [];
    let boardSchedules = 0;
    for (let sequence = 1; sequence <= taskCount; sequence += 1) {
      const status = pickStatus(random);
      const createdAt = new Date(
        referenceMidnight.getTime() - (taskCount - sequence + 1) * 180_000,
      );
      const deleted = random() < 0.01;
      const qualifier = pick(QUALIFIERS, random);
      const task: PlannedTask = {
        id: childId(1, dataset, board, sequence),
        boardId: id,
        sequence,
        name: `${pick(VERBS, random)} ${pick(NOUNS, random)}${qualifier === "" ? "" : ` ${qualifier}`}`,
        description: random() < 0.2 ? pick(DESCRIPTIONS, random) : null,
        status,
        priority: pickPriority(random),
        creatorIndex: pick(members, random).userIndex,
        assigneeIndex: random() < 0.7 ? pick(members, random).userIndex : null,
        dueDate: random() < 0.75 ? addDays(referenceDate, Math.floor(random() * 81) - 20) : null,
        createdAt,
        deletedAt: deleted ? referenceMidnight : null,
      };
      boardTasks.push(task);

      // Only NOT_STARTED dependents get prerequisites, so seeded rows never violate the
      // "cannot start before prerequisites settle" rule. Prerequisites always have a
      // lower sequence, which keeps the graph acyclic.
      if (status === "NOT_STARTED" && !deleted && sequence > 1 && random() < 0.15) {
        const wanted = 1 + Math.floor(random() * 2);
        const chosen = new Set<string>();
        for (let attempt = 0; attempt < 6 && chosen.size < wanted; attempt += 1) {
          const window = Math.min(50, sequence - 1);
          const candidate = boardTasks[sequence - 2 - Math.floor(random() * window)];
          if (candidate && candidate.deletedAt === null) chosen.add(candidate.id);
        }
        for (const dependsOnTaskId of [...chosen].slice(0, MAX_DEPENDENCIES)) {
          dependencies.push({ boardId: id, taskId: task.id, dependsOnTaskId });
        }
      }

      if (
        status === "NOT_STARTED" &&
        !deleted &&
        boardSchedules < MAX_SCHEDULES_PER_BOARD &&
        random() < 0.01
      ) {
        const rrule = `RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=${WEEKDAYS[sequence % WEEKDAYS.length] ?? "MO"}`;
        const timezone = TIMEZONES[sequence % TIMEZONES.length] ?? "UTC";
        const startLocal = `${referenceDate}T09:00:00`;
        const parsed = parseSchedule(
          { rrule, timezone, startLocal, enabled: true },
          referenceMidnight,
        );
        schedules.push({
          id: childId(3, dataset, board, sequence),
          taskId: task.id,
          rrule: parsed.rrule,
          timezone: parsed.timezone,
          startLocal: parsed.startLocal,
          nextRunAt: parsed.nextRunAt,
        });
        boardSchedules += 1;
      }
    }
    tasks.push(...boardTasks);
  }

  return { users, boards, tasks, dependencies, schedules };
}

export interface VolumeSeedSummary {
  readonly boards: number;
  readonly memberships: number;
  readonly tasks: number;
  readonly dependencies: number;
  readonly schedules: number;
}

const TASK_CHUNK = 1_000;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size)
    result.push(items.slice(start, start + size));
  return result;
}

/**
 * Writes a plan idempotently. Each board is written in its own transaction so a
 * failure never leaves a half-populated board, and the task counter is only ever
 * raised, so tasks created through the app after seeding never collide.
 * `userIds[index]` is the database id of `plan.users[index]`.
 */
export async function writeVolumePlan(
  prisma: PrismaClient,
  plan: VolumePlan,
  userIds: readonly string[],
): Promise<VolumeSeedSummary> {
  const userId = (index: number): string => {
    const id = userIds[index];
    if (id === undefined) throw new Error(`Missing volume user ${index}`);
    return id;
  };
  const tasksByBoard = new Map<string, PlannedTask[]>();
  for (const task of plan.tasks)
    tasksByBoard.set(task.boardId, [...(tasksByBoard.get(task.boardId) ?? []), task]);
  const boardOfTask = new Map(plan.tasks.map((task) => [task.id, task.boardId]));

  const inserted = { boards: 0, memberships: 0, tasks: 0, dependencies: 0, schedules: 0 };
  for (const board of plan.boards) {
    const boardTasks = tasksByBoard.get(board.id) ?? [];
    const boardDependencies = plan.dependencies.filter((edge) => edge.boardId === board.id);
    const boardSchedules = plan.schedules.filter(
      (schedule) => boardOfTask.get(schedule.taskId) === board.id,
    );
    await prisma.$transaction(
      async (tx) => {
        inserted.boards += (
          await tx.board.createMany({
            data: [
              {
                id: board.id,
                name: board.name,
                description: board.description,
                ownerId: userId(board.ownerIndex),
              },
            ],
            skipDuplicates: true,
          })
        ).count;
        for (const members of chunks(board.members, TASK_CHUNK)) {
          inserted.memberships += (
            await tx.boardMembership.createMany({
              data: members.map((member) => ({
                id: member.id,
                boardId: board.id,
                userId: userId(member.userIndex),
                role: member.role,
              })),
              skipDuplicates: true,
            })
          ).count;
        }
        for (const page of chunks(boardTasks, TASK_CHUNK)) {
          inserted.tasks += (
            await tx.task.createMany({
              data: page.map((task) => ({
                id: task.id,
                boardId: task.boardId,
                sequence: task.sequence,
                name: task.name,
                description: task.description,
                status: task.status,
                priority: task.priority,
                createdById: userId(task.creatorIndex),
                assigneeId: task.assigneeIndex === null ? null : userId(task.assigneeIndex),
                dueDate: task.dueDate === null ? null : new Date(`${task.dueDate}T00:00:00.000Z`),
                createdAt: task.createdAt,
                updatedAt: task.createdAt,
                deletedAt: task.deletedAt,
              })),
              skipDuplicates: true,
            })
          ).count;
        }
        for (const edges of chunks(boardDependencies, TASK_CHUNK)) {
          inserted.dependencies += (
            await tx.taskDependency.createMany({ data: edges, skipDuplicates: true })
          ).count;
        }
        if (boardSchedules.length > 0) {
          inserted.schedules += (
            await tx.taskSchedule.createMany({
              data: boardSchedules.map((schedule) => ({ ...schedule, enabled: true })),
              skipDuplicates: true,
            })
          ).count;
        }
        await tx.$executeRaw(Prisma.sql`
          UPDATE "board"
          SET "nextTaskSequence" = GREATEST(
            "nextTaskSequence",
            COALESCE((SELECT MAX("sequence") FROM "task" WHERE "boardId" = ${board.id}), 0) + 1
          )
          WHERE "id" = ${board.id}
        `);
      },
      { maxWait: 10_000, timeout: 300_000 },
    );
  }
  return inserted;
}

/** Removes one dataset's boards (tasks, memberships, and edges cascade). Users are kept. */
export async function resetVolumeData(prisma: PrismaClient, dataset: number): Promise<number> {
  const prefix = volumeBoardIdPrefix(dataset);
  await prisma.taskSchedule.deleteMany({ where: { task: { boardId: { startsWith: prefix } } } });
  const removed = await prisma.board.deleteMany({ where: { id: { startsWith: prefix } } });
  return removed.count;
}

type AuthInstance = ReturnType<typeof createBetterAuth>["auth"];

/**
 * Creates missing volume users through Better Auth's internal adapter, so ids,
 * email normalization, and the credential account follow the library's own shape.
 * The Argon2id password hash is computed once and shared, which keeps thousands of
 * users fast to create. Existing users are reused.
 */
export async function provisionVolumeUsers(
  prisma: PrismaClient,
  auth: AuthInstance,
  users: readonly PlannedUser[],
): Promise<{ ids: string[]; created: number }> {
  const existing = await prisma.user.findMany({
    where: { email: { in: users.map((user) => user.email) } },
    select: { id: true, email: true },
  });
  const idByEmail = new Map(existing.map((user) => [user.email.toLowerCase(), user.id]));
  const missing = users.filter((user) => !idByEmail.has(user.email));
  if (missing.length > 0) {
    const context = await auth.$context;
    const passwordHash = await context.password.hash(DEMO_PASSWORD);
    for (const batch of chunks(missing, 10)) {
      await Promise.all(
        batch.map(async (user) => {
          const created = await context.internalAdapter.createUser(
            {
              name: user.name,
              email: user.email,
              emailVerified: true,
              avatarSeed: generateAvatarSeed(),
            },
            { method: "email-password" },
          );
          await context.internalAdapter.linkAccount({
            userId: created.id,
            providerId: "credential",
            accountId: created.id,
            password: passwordHash,
          });
          idByEmail.set(user.email, created.id);
        }),
      );
    }
  }
  const ids = users.map((user) => {
    const id = idByEmail.get(user.email);
    if (id === undefined) throw new Error(`Volume user was not created: ${user.email}`);
    return id;
  });
  return { ids, created: missing.length };
}

export function assertVolumeSeedAllowed(
  environment: Pick<Environment, "NODE_ENV" | "ALLOW_PRODUCTION_DEMO_SEED">,
): void {
  if (environment.NODE_ENV === "production" && !environment.ALLOW_PRODUCTION_DEMO_SEED) {
    throw new Error(
      "Volume seed data is disabled in production. Set ALLOW_PRODUCTION_DEMO_SEED=true only for an explicit, audited override.",
    );
  }
}

export interface VolumeSeedCommand {
  readonly options: VolumeSeedOptions;
  readonly reset: boolean;
  readonly help: boolean;
}

export const VOLUME_SEED_USAGE = `Usage: db:seed:volume [options]
  --users <n>              Users to provision (default 200, max 5000)
  --boards <n>             Additional boards besides the large board (default 20, max 500)
  --large-board-tasks <n>  Tasks on the large board (default 10000, max 100000)
  --tasks-per-board <n>    Tasks on each additional board (default 250, max 10000)
  --reference-date <date>  YYYY-MM-DD anchor for due and created dates (default today, UTC)
  --dataset <n>            Independent dataset number (default 0)
  --reset                  Delete this dataset's boards before seeding (users are kept)
  --help                   Show this help`;

export function parseVolumeSeedArgs(argv: readonly string[]): VolumeSeedCommand {
  // pnpm forwards a literal "--" separator; it must not end option parsing here.
  const args = argv.filter((arg) => arg !== "--");
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      users: { type: "string" },
      boards: { type: "string" },
      "large-board-tasks": { type: "string" },
      "tasks-per-board": { type: "string" },
      "reference-date": { type: "string" },
      dataset: { type: "string" },
      reset: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  const options = volumeSeedOptionsSchema.parse({
    users: values.users,
    boards: values.boards,
    largeBoardTasks: values["large-board-tasks"],
    tasksPerBoard: values["tasks-per-board"],
    referenceDate: values["reference-date"],
    dataset: values.dataset,
  });
  return { options, reset: values.reset === true, help: values.help === true };
}

async function main(argv: readonly string[]): Promise<void> {
  const command = parseVolumeSeedArgs(argv);
  if (command.help) {
    console.log(VOLUME_SEED_USAGE);
    return;
  }
  const environment = loadEnvironment();
  assertVolumeSeedAllowed(environment);
  const prisma = new PrismaClient({ datasources: { db: { url: environment.DATABASE_URL } } });
  const started = Date.now();
  try {
    const plan = buildVolumePlan(command.options);
    const { auth } = createBetterAuth({ prisma, environment });
    const users = await provisionVolumeUsers(prisma, auth, plan.users);
    const removed = command.reset ? await resetVolumeData(prisma, command.options.dataset) : 0;
    const inserted = await writeVolumePlan(prisma, plan, users.ids);
    const seconds = ((Date.now() - started) / 1_000).toFixed(1);
    console.log(
      [
        `Volume seed finished in ${seconds}s (dataset ${command.options.dataset}, reference ${command.options.referenceDate}).`,
        `  users:        ${plan.users.length} planned, ${users.created} created`,
        ...(command.reset ? [`  reset:        ${removed} boards removed`] : []),
        `  boards:       ${plan.boards.length} planned, ${inserted.boards} inserted`,
        `  memberships:  ${plan.boards.reduce((sum, board) => sum + board.members.length, 0)} planned, ${inserted.memberships} inserted`,
        `  tasks:        ${plan.tasks.length} planned, ${inserted.tasks} inserted`,
        `  dependencies: ${plan.dependencies.length} planned, ${inserted.dependencies} inserted`,
        `  schedules:    ${plan.schedules.length} planned, ${inserted.schedules} inserted`,
        `Sign in as ${volumeUserEmail(0)} (member of every volume board) with the demo password from the README.`,
      ].join("\n"),
    );
  } finally {
    await prisma.$disconnect();
  }
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain)
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof z.ZodError ? `${error.message}\n\n${VOLUME_SEED_USAGE}` : error);
    process.exitCode = 1;
  });
