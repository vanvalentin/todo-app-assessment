import { PrismaClient } from "@prisma/client";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createPrismaTasksRepository } from "../../src/modules/tasks/tasks.repository.js";

const configuredDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const databaseUrl = configuredDatabaseUrl ?? "postgresql://invalid/ksat_test";
const run = configuredDatabaseUrl ? describe : describe.skip;
const ids = {
  admin: "01900000-0000-7000-8000-000000000301",
  contributor: "01900000-0000-7000-8000-000000000302",
  outsider: "01900000-0000-7000-8000-000000000303",
  board: "01900000-0000-7000-8000-000000000304",
  otherBoard: "01900000-0000-7000-8000-000000000307",
};
const creator = { id: ids.contributor, name: "Task Contributor", avatarSeed: "task-seed" };
const contributorPreview = {
  id: ids.contributor,
  name: "Task Contributor",
  avatarSeed: "task-seed",
};
const adminPreview = { id: ids.admin, name: "Task Admin", avatarSeed: "admin-seed" };

run("PostgreSQL tasks", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const repository = createPrismaTasksRepository(prisma);

  beforeAll(async () => {
    await prisma.board.deleteMany({ where: { id: { in: [ids.board, ids.otherBoard] } } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.admin, ids.contributor, ids.outsider] } },
    });
    await prisma.user.createMany({
      data: [
        {
          id: ids.admin,
          name: "Task Admin",
          email: "task-admin@example.test",
          avatarSeed: "admin-seed",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: ids.contributor,
          name: "Task Contributor",
          email: "task-contributor@example.test",
          avatarSeed: "task-seed",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: ids.outsider,
          name: "Task Outsider",
          email: "task-outsider@example.test",
          avatarSeed: "outsider-seed",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    await prisma.board.create({
      data: {
        id: ids.board,
        name: "Task integration board",
        ownerId: ids.admin,
        memberships: {
          create: [
            { id: "01900000-0000-7000-8000-000000000305", userId: ids.admin, role: "ADMIN" },
            {
              id: "01900000-0000-7000-8000-000000000306",
              userId: ids.contributor,
              role: "CONTRIBUTOR",
            },
          ],
        },
      },
    });
    // A second board the outsider belongs to, so "outsider is a member of *some*
    // board" cannot be mistaken for "outsider is a member of *this* board" by the
    // composite assignee/reporter foreign key.
    await prisma.board.create({
      data: {
        id: ids.otherBoard,
        name: "Other board",
        ownerId: ids.outsider,
        memberships: {
          create: [
            { id: "01900000-0000-7000-8000-000000000308", userId: ids.outsider, role: "ADMIN" },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.board.deleteMany({ where: { id: { in: [ids.board, ids.otherBoard] } } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.admin, ids.contributor, ids.outsider] } },
    });
    await prisma.$disconnect();
  });

  it("allocates unique per-board sequences for concurrent creation", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_value, index) =>
        repository.createForMember(ids.board, ids.contributor, {
          name: `Concurrent task ${index}`,
          status: "NOT_STARTED",
          priority: "MEDIUM",
          assigneeId: null,
          reporterId: ids.contributor,
          dueDate: null,
        }),
      ),
    );
    const sequences = results.map((result) => {
      expect(result.kind).toBe("CREATED");
      return result.kind === "CREATED" ? result.task.sequence : 0;
    });
    expect(new Set(sequences).size).toBe(5);
    expect([...sequences].sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5]);
    expect(results[0]).toMatchObject({
      kind: "CREATED",
      task: { createdBy: creator, reporter: contributorPreview, assignee: null, version: 1 },
    });
  });

  it("denies creation for a non-member without revealing the board", async () => {
    await expect(
      repository.createForMember(ids.board, ids.outsider, {
        name: "Not allowed",
        status: "NOT_STARTED",
        priority: "LOW",
        assigneeId: null,
        reporterId: ids.outsider,
        dueDate: null,
      }),
    ).resolves.toEqual({ kind: "NOT_FOUND" });
  });

  it("rejects an assignee or reporter who is not a member of this board", async () => {
    const badAssignee = await repository.createForMember(ids.board, ids.contributor, {
      name: "Bad assignee",
      status: "NOT_STARTED",
      priority: "LOW",
      // The outsider is a member of otherBoard, not this board.
      assigneeId: ids.outsider,
      reporterId: ids.contributor,
      dueDate: null,
    });
    expect(badAssignee).toEqual({ kind: "ASSIGNEE_NOT_MEMBER" });

    const badReporter = await repository.createForMember(ids.board, ids.contributor, {
      name: "Bad reporter",
      status: "NOT_STARTED",
      priority: "LOW",
      assigneeId: null,
      reporterId: ids.outsider,
      dueDate: null,
    });
    expect(badReporter).toEqual({ kind: "REPORTER_NOT_MEMBER" });
  });

  it("creates and updates a task with an assignee, reporter, and due date", async () => {
    const created = await repository.createForMember(ids.board, ids.admin, {
      name: "Curate the booth",
      status: "NOT_STARTED",
      priority: "HIGH",
      assigneeId: ids.contributor,
      reporterId: ids.admin,
      dueDate: "2027-04-18",
    });
    expect(created).toMatchObject({
      kind: "CREATED",
      task: {
        assignee: contributorPreview,
        reporter: adminPreview,
        dueDate: new Date("2027-04-18T00:00:00.000Z"),
      },
    });
    if (created.kind !== "CREATED") throw new Error("expected a created task");

    const moved = await repository.updateForMember(created.task.id, ids.admin, {
      name: created.task.name,
      status: "IN_PROGRESS",
      priority: "HIGH",
      assigneeId: ids.admin,
      reporterId: ids.contributor,
      dueDate: "2027-05-01",
      version: created.task.version,
    });
    expect(moved).toMatchObject({
      kind: "UPDATED",
      task: {
        assignee: adminPreview,
        reporter: contributorPreview,
        dueDate: new Date("2027-05-01T00:00:00.000Z"),
      },
    });

    const rejected = await repository.updateForMember(created.task.id, ids.admin, {
      name: created.task.name,
      status: "IN_PROGRESS",
      priority: "HIGH",
      assigneeId: ids.outsider,
      reporterId: ids.contributor,
      dueDate: null,
      version: moved.kind === "UPDATED" ? moved.task.version : 0,
    });
    expect(rejected).toEqual({ kind: "ASSIGNEE_NOT_MEMBER" });
  });

  it("hides archived tasks and confines reads to board members", async () => {
    const listed = await repository.listActiveForMember(ids.board, ids.contributor, { limit: 50 });
    expect(listed.hasMore).toBe(false);
    expect(listed.items.length).toBeGreaterThan(0);

    const archived = listed.items[0];
    if (!archived) throw new Error("expected a task to archive");
    await prisma.task.update({ where: { id: archived.id }, data: { status: "ARCHIVED" } });
    const afterArchive = await repository.listActiveForMember(ids.board, ids.contributor, {
      limit: 50,
    });
    expect(afterArchive.items.map((item) => item.id)).not.toContain(archived.id);
    expect(await repository.getForMember(archived.id, ids.outsider)).toBeNull();
    await prisma.task.update({ where: { id: archived.id }, data: { status: "NOT_STARTED" } });
  });

  it("rejects a stale update and lets only one writer win", async () => {
    const page = await repository.listActiveForMember(ids.board, ids.admin, { limit: 1 });
    const target = page.items[0];
    if (!target) throw new Error("expected a task");
    const results = await Promise.all([
      repository.updateForMember(target.id, ids.contributor, {
        name: "Moved to in progress",
        status: "IN_PROGRESS",
        priority: "HIGH",
        assigneeId: null,
        reporterId: ids.contributor,
        dueDate: null,
        version: target.version,
      }),
      repository.updateForMember(target.id, ids.contributor, {
        name: "Moved to completed",
        status: "COMPLETED",
        priority: "LOW",
        assigneeId: null,
        reporterId: ids.contributor,
        dueDate: null,
        version: target.version,
      }),
    ]);
    const winners = results.filter((result) => result.kind === "UPDATED");
    expect(winners).toHaveLength(1);
    expect(results.filter((result) => result.kind === "VERSION_CONFLICT")).toHaveLength(1);

    const stored = await prisma.task.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.version).toBe(target.version + 1);

    const stale = await repository.updateForMember(target.id, ids.contributor, {
      name: "Stale write",
      status: "NOT_STARTED",
      priority: "LOW",
      assigneeId: null,
      reporterId: ids.contributor,
      dueDate: null,
      version: target.version,
    });
    expect(stale).toEqual({ kind: "VERSION_CONFLICT" });
    await expect(
      repository.updateForMember(target.id, ids.outsider, {
        name: "Outsider write",
        status: "NOT_STARTED",
        priority: "LOW",
        assigneeId: null,
        reporterId: ids.contributor,
        dueDate: null,
        version: stored.version,
      }),
    ).resolves.toEqual({ kind: "NOT_FOUND" });
    await expect(
      prisma.task.findUniqueOrThrow({ where: { id: target.id } }),
    ).resolves.toMatchObject({
      name: stored.name,
    });
  });

  it("deletes only with the current version and hides the task afterwards", async () => {
    const created = await repository.createForMember(ids.board, ids.admin, {
      name: "Delete me",
      status: "NOT_STARTED",
      priority: "LOW",
      assigneeId: null,
      reporterId: ids.admin,
      dueDate: null,
    });
    if (created.kind !== "CREATED") throw new Error("expected a created task");
    const task = created.task;

    await expect(repository.deleteForMember(task.id, ids.outsider, task.version)).resolves.toBe(
      "NOT_FOUND",
    );
    await expect(repository.deleteForMember(task.id, ids.admin, task.version + 5)).resolves.toBe(
      "VERSION_CONFLICT",
    );
    await expect(repository.deleteForMember(task.id, ids.admin, task.version)).resolves.toBe(
      "DELETED",
    );
    await expect(repository.getForMember(task.id, ids.admin)).resolves.toBeNull();
  });

  it("nulls the assignee when the database removes the member row directly", async () => {
    const created = await repository.createForMember(ids.board, ids.admin, {
      name: "Assignee goes away",
      status: "NOT_STARTED",
      priority: "LOW",
      assigneeId: ids.contributor,
      reporterId: ids.admin,
      dueDate: null,
    });
    if (created.kind !== "CREATED") throw new Error("expected a created task");

    const membershipId = "01900000-0000-7000-8000-000000000309";
    // Simulate member removal (not yet an application feature) directly against the
    // database to prove the composite FK's ON DELETE SET NULL (assigneeId) clause.
    await prisma.boardMembership.create({
      data: { id: membershipId, boardId: ids.board, userId: ids.outsider, role: "CONTRIBUTOR" },
    });
    await prisma.task.update({
      where: { id: created.task.id },
      data: { assigneeId: ids.outsider },
    });
    await prisma.boardMembership.delete({ where: { id: membershipId } });

    const afterRemoval = await prisma.task.findUniqueOrThrow({ where: { id: created.task.id } });
    expect(afterRemoval.assigneeId).toBeNull();
  });

  it("reports the caller's membership role for the board", async () => {
    await expect(repository.findMembershipRole(ids.board, ids.contributor)).resolves.toBe(
      "CONTRIBUTOR",
    );
    await expect(repository.findMembershipRole(ids.board, ids.outsider)).resolves.toBeNull();
    await expect(
      repository.findMembershipRole("01900000-0000-7000-8000-000000000999", ids.admin),
    ).resolves.toBeNull();
  });
});
