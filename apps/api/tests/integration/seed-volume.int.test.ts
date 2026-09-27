import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaTasksRepository } from "../../src/modules/tasks/tasks.repository.js";
import {
  buildVolumePlan,
  resetVolumeData,
  volumeBoardIdPrefix,
  writeVolumePlan,
} from "../../src/seed-volume.js";

const configuredDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const databaseUrl = configuredDatabaseUrl ?? "postgresql://invalid/ksat_test";
const run = configuredDatabaseUrl ? describe : describe.skip;

// A dataset number that the volume command never uses by default, so this test
// cannot touch locally seeded volume data.
const DATASET = 4_000;
const userIds = [
  "01900000-0000-7000-8000-000000000a01",
  "01900000-0000-7000-8000-000000000a02",
  "01900000-0000-7000-8000-000000000a03",
  "01900000-0000-7000-8000-000000000a04",
];

run("PostgreSQL volume seed", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const plan = buildVolumePlan({
    users: userIds.length,
    boards: 2,
    largeBoardTasks: 400,
    tasksPerBoard: 30,
    referenceDate: "2027-05-01",
    dataset: DATASET,
  });
  const prefix = volumeBoardIdPrefix(DATASET);

  beforeAll(async () => {
    await resetVolumeData(prisma, DATASET);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.user.createMany({
      data: userIds.map((id, index) => ({
        id,
        name: `Volume Test ${index}`,
        email: `volume-int-${index}@example.test`,
        avatarSeed: `volume-int-${index}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    });
  });

  afterAll(async () => {
    await resetVolumeData(prisma, DATASET);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function counts() {
    const boardFilter = { boardId: { startsWith: prefix } };
    const [boards, memberships, tasks, dependencies, schedules] = await Promise.all([
      prisma.board.count({ where: { id: { startsWith: prefix } } }),
      prisma.boardMembership.count({ where: boardFilter }),
      prisma.task.count({ where: boardFilter }),
      prisma.taskDependency.count({ where: boardFilter }),
      prisma.taskSchedule.count({ where: { task: boardFilter } }),
    ]);
    return { boards, memberships, tasks, dependencies, schedules };
  }

  it("writes the plan, is idempotent on re-run, and keeps task numbering ahead", async () => {
    const expected = {
      boards: plan.boards.length,
      memberships: plan.boards.reduce((sum, board) => sum + board.members.length, 0),
      tasks: plan.tasks.length,
      dependencies: plan.dependencies.length,
      schedules: plan.schedules.length,
    };
    expect(await writeVolumePlan(prisma, plan, userIds)).toEqual(expected);
    expect(await counts()).toEqual(expected);

    const again = await writeVolumePlan(prisma, plan, userIds);
    expect(again).toEqual({ boards: 0, memberships: 0, tasks: 0, dependencies: 0, schedules: 0 });
    expect(await counts()).toEqual(expected);

    const large = await prisma.board.findUniqueOrThrow({ where: { id: `${prefix}000000000000` } });
    expect(large.nextTaskSequence).toBe(401);

    // Seeded rows are usable through the application's own queries: soft-deleted rows
    // stay hidden and new tasks get the next free sequence.
    const repository = createPrismaTasksRepository(prisma);
    const firstUser = userIds[0] ?? "";
    const page = await repository.listForMember(
      large.id,
      firstUser,
      { statuses: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "ARCHIVED"] },
      { sort: "NAME", limit: 100 },
    );
    const deletedIds = new Set(
      plan.tasks.filter((task) => task.deletedAt !== null).map((task) => task.id),
    );
    expect(page.items).toHaveLength(100);
    expect(page.items.some((item) => deletedIds.has(item.id))).toBe(false);
    const created = await repository.createForMember(large.id, firstUser, {
      name: "Created after seeding",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      assigneeId: null,
      description: null,
      dependsOnIds: [],
      dueDate: null,
    });
    expect(created.kind === "CREATED" ? created.task.sequence : null).toBe(401);
  });

  it("reset removes only the selected dataset", async () => {
    expect(await resetVolumeData(prisma, DATASET)).toBe(plan.boards.length);
    expect((await counts()).tasks).toBe(0);
  });
});
