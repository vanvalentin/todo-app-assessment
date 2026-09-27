import { PrismaClient } from "@prisma/client";
import type { TaskStatus } from "@ksat/contracts";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createPrismaTasksRepository } from "../../src/modules/tasks/tasks.repository.js";
import type { TaskRow } from "../../src/modules/tasks/tasks.types.js";

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
          description: null,
          dependsOnIds: [],
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
        description: null,
        dependsOnIds: [],
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
      description: null,
      dependsOnIds: [],
      reporterId: ids.contributor,
      dueDate: null,
    });
    expect(badAssignee).toEqual({ kind: "ASSIGNEE_NOT_MEMBER" });

    const badReporter = await repository.createForMember(ids.board, ids.contributor, {
      name: "Bad reporter",
      status: "NOT_STARTED",
      priority: "LOW",
      assigneeId: null,
      description: null,
      dependsOnIds: [],
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
      description: null,
      dependsOnIds: [],
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
      description: null,
      dependsOnIds: [],
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
      description: null,
      dependsOnIds: [],
      reporterId: ids.contributor,
      dueDate: null,
      version: moved.kind === "UPDATED" ? moved.task.version : 0,
    });
    expect(rejected).toEqual({ kind: "ASSIGNEE_NOT_MEMBER" });
  });

  const activeStatuses = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;
  const listActive = (
    userId: string,
    page: { limit: number; sort?: import("@ksat/contracts").TaskSort },
  ) =>
    repository.listForMember(
      ids.board,
      userId,
      { statuses: [...activeStatuses] },
      { sort: page.sort ?? "NEWEST", limit: page.limit },
    );

  it("hides archived tasks by default and includes them only when requested", async () => {
    const listed = await listActive(ids.contributor, { limit: 50 });
    expect(listed.hasMore).toBe(false);
    expect(listed.items.length).toBeGreaterThan(0);

    const archived = listed.items[0];
    if (!archived) throw new Error("expected a task to archive");
    await prisma.task.update({ where: { id: archived.id }, data: { status: "ARCHIVED" } });
    const afterArchive = await listActive(ids.contributor, { limit: 50 });
    expect(afterArchive.items.map((item) => item.id)).not.toContain(archived.id);
    expect(await repository.getForMember(archived.id, ids.outsider)).toBeNull();

    const withArchived = await repository.listForMember(
      ids.board,
      ids.contributor,
      { statuses: [...activeStatuses, "ARCHIVED"] },
      { sort: "NEWEST", limit: 50 },
    );
    expect(withArchived.items.map((item) => item.id)).toContain(archived.id);
    await prisma.task.update({ where: { id: archived.id }, data: { status: "NOT_STARTED" } });
  });

  it("rejects a stale update and lets only one writer win", async () => {
    const page = await listActive(ids.admin, { limit: 1 });
    const target = page.items[0];
    if (!target) throw new Error("expected a task");
    const results = await Promise.all([
      repository.updateForMember(target.id, ids.contributor, {
        name: "Moved to in progress",
        status: "IN_PROGRESS",
        priority: "HIGH",
        assigneeId: null,
        description: null,
        dependsOnIds: [],
        reporterId: ids.contributor,
        dueDate: null,
        version: target.version,
      }),
      repository.updateForMember(target.id, ids.contributor, {
        name: "Moved to completed",
        status: "COMPLETED",
        priority: "LOW",
        assigneeId: null,
        description: null,
        dependsOnIds: [],
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
      description: null,
      dependsOnIds: [],
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
        description: null,
        dependsOnIds: [],
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
      description: null,
      dependsOnIds: [],
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
      description: null,
      dependsOnIds: [],
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

  describe("phase 4c search, filter, and sort", () => {
    const filterBoardId = "01900000-0000-7000-8000-000000000401";
    let taskIds: Record<string, string> = {};

    function daysFromNow(days: number): string {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    }

    beforeAll(async () => {
      await prisma.board.deleteMany({ where: { id: filterBoardId } });
      await prisma.board.create({
        data: {
          id: filterBoardId,
          name: "Filter board",
          ownerId: ids.admin,
          memberships: {
            create: [
              { id: "01900000-0000-7000-8000-000000000402", userId: ids.admin, role: "ADMIN" },
              {
                id: "01900000-0000-7000-8000-000000000403",
                userId: ids.contributor,
                role: "CONTRIBUTOR",
              },
            ],
          },
        },
      });
      const specs: Array<{
        key: string;
        name: string;
        priority: "LOW" | "MEDIUM" | "HIGH";
        assigneeId: string | null;
        dueDate: string | null;
      }> = [
        {
          key: "overdue",
          name: "Alpha overdue booth",
          priority: "HIGH",
          assigneeId: ids.contributor,
          dueDate: daysFromNow(-2),
        },
        {
          key: "today",
          name: "Bravo due today",
          priority: "MEDIUM",
          assigneeId: null,
          dueDate: daysFromNow(0),
        },
        {
          key: "soon",
          name: "Charlie due soon",
          priority: "LOW",
          assigneeId: ids.admin,
          dueDate: daysFromNow(3),
        },
        {
          key: "far",
          name: "Delta far out",
          priority: "MEDIUM",
          assigneeId: null,
          dueDate: daysFromNow(30),
        },
        {
          key: "none",
          name: "Echo 50% off signage",
          priority: "HIGH",
          assigneeId: ids.contributor,
          dueDate: null,
        },
      ];
      taskIds = {};
      for (const spec of specs) {
        const created = await repository.createForMember(filterBoardId, ids.admin, {
          name: spec.name,
          status: "NOT_STARTED",
          priority: spec.priority,
          assigneeId: spec.assigneeId,
          description: null,
          dependsOnIds: [],
          reporterId: ids.admin,
          dueDate: spec.dueDate,
        });
        if (created.kind !== "CREATED") throw new Error("expected a created task");
        taskIds[spec.key] = created.task.id;
      }
    });

    afterAll(async () => {
      await prisma.board.deleteMany({ where: { id: filterBoardId } });
    });

    it("filters by priority", async () => {
      const page = await repository.listForMember(
        filterBoardId,
        ids.admin,
        { statuses: [...activeStatuses], priority: "HIGH" },
        { sort: "NAME", limit: 50 },
      );
      expect(page.items.map((item) => item.id).sort()).toEqual(
        [taskIds.overdue, taskIds.none].sort(),
      );
    });

    it("filters by assignee, including the unassigned sentinel", async () => {
      const assigned = await repository.listForMember(
        filterBoardId,
        ids.admin,
        { statuses: [...activeStatuses], assigneeId: ids.contributor },
        { sort: "NAME", limit: 50 },
      );
      expect(assigned.items.map((item) => item.id).sort()).toEqual(
        [taskIds.overdue, taskIds.none].sort(),
      );

      const unassigned = await repository.listForMember(
        filterBoardId,
        ids.admin,
        { statuses: [...activeStatuses], assigneeId: null },
        { sort: "NAME", limit: 50 },
      );
      expect(unassigned.items.map((item) => item.id).sort()).toEqual(
        [taskIds.today, taskIds.far].sort(),
      );

      // A member of a different board is never a match, but the query still succeeds.
      const otherBoardMember = await repository.listForMember(
        filterBoardId,
        ids.admin,
        { statuses: [...activeStatuses], assigneeId: ids.outsider },
        { sort: "NAME", limit: 50 },
      );
      expect(otherBoardMember.items).toEqual([]);
    });

    it("resolves due-date buckets against the caller-supplied local today", async () => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const overdue = await repository.listForMember(
        filterBoardId,
        ids.admin,
        { statuses: [...activeStatuses], due: { kind: "OVERDUE", today } },
        { sort: "NAME", limit: 50 },
      );
      expect(overdue.items.map((item) => item.id)).toEqual([taskIds.overdue]);

      const dueToday = await repository.listForMember(
        filterBoardId,
        ids.admin,
        { statuses: [...activeStatuses], due: { kind: "TODAY", today } },
        { sort: "NAME", limit: 50 },
      );
      expect(dueToday.items.map((item) => item.id)).toEqual([taskIds.today]);

      const next7 = await repository.listForMember(
        filterBoardId,
        ids.admin,
        {
          statuses: [...activeStatuses],
          due: { kind: "NEXT_7_DAYS", from: today, to: new Date(today.getTime() + 6 * 86_400_000) },
        },
        { sort: "NAME", limit: 50 },
      );
      // NEXT_7_DAYS spans today..today+6 inclusive, so a task due today also matches.
      expect(next7.items.map((item) => item.id).sort()).toEqual(
        [taskIds.today, taskIds.soon].sort(),
      );

      const none = await repository.listForMember(
        filterBoardId,
        ids.admin,
        { statuses: [...activeStatuses], due: { kind: "NONE" } },
        { sort: "NAME", limit: 50 },
      );
      expect(none.items.map((item) => item.id)).toEqual([taskIds.none]);
    });

    it("searches by a case-insensitive name substring, treating % and _ literally", async () => {
      const byName = await repository.listForMember(
        filterBoardId,
        ids.admin,
        { statuses: [...activeStatuses], search: { name: "bravo", sequence: null } },
        { sort: "NAME", limit: 50 },
      );
      expect(byName.items.map((item) => item.id)).toEqual([taskIds.today]);

      const literalWildcard = await repository.listForMember(
        filterBoardId,
        ids.admin,
        { statuses: [...activeStatuses], search: { name: "50%", sequence: null } },
        { sort: "NAME", limit: 50 },
      );
      expect(literalWildcard.items.map((item) => item.id)).toEqual([taskIds.none]);

      const noWildcardMatch = await repository.listForMember(
        filterBoardId,
        ids.admin,
        { statuses: [...activeStatuses], search: { name: "5_", sequence: null } },
        { sort: "NAME", limit: 50 },
      );
      expect(noWildcardMatch.items).toEqual([]);
    });

    it("searches by an exact task sequence", async () => {
      const target = await repository.getForMember(taskIds.far as string, ids.admin);
      if (!target) throw new Error("expected the task");
      const bySequence = await repository.listForMember(
        filterBoardId,
        ids.admin,
        {
          statuses: [...activeStatuses],
          search: { name: "#" + String(target.sequence), sequence: target.sequence },
        },
        { sort: "NAME", limit: 50 },
      );
      expect(bySequence.items.map((item) => item.id)).toEqual([target.id]);
    });

    it("paginates DUE_DATE ascending with null due dates last, without gaps or duplicates", async () => {
      const seen: string[] = [];
      let cursor: { key: string | null; sequence: number } | undefined;
      for (let guard = 0; guard < 10; guard += 1) {
        const page = await repository.listForMember(
          filterBoardId,
          ids.admin,
          { statuses: [...activeStatuses] },
          { sort: "DUE_DATE", limit: 2, ...(cursor ? { cursor } : {}) },
        );
        seen.push(...page.items.map((item) => item.id));
        if (!page.hasMore) break;
        const last = page.items.at(-1);
        if (!last) throw new Error("expected a row");
        cursor = {
          key: last.dueDate ? last.dueDate.toISOString().slice(0, 10) : null,
          sequence: last.sequence,
        };
      }
      expect(seen).toEqual([
        taskIds.overdue,
        taskIds.today,
        taskIds.soon,
        taskIds.far,
        taskIds.none,
      ]);
      expect(new Set(seen).size).toBe(5);
    });

    it("paginates NAME ascending without gaps or duplicates", async () => {
      const seen: string[] = [];
      let cursor: { key: string | null; sequence: number } | undefined;
      for (let guard = 0; guard < 10; guard += 1) {
        const page = await repository.listForMember(
          filterBoardId,
          ids.admin,
          { statuses: [...activeStatuses] },
          { sort: "NAME", limit: 2, ...(cursor ? { cursor } : {}) },
        );
        seen.push(...page.items.map((item) => item.id));
        if (!page.hasMore) break;
        const last = page.items.at(-1);
        if (!last) throw new Error("expected a row");
        cursor = { key: last.name, sequence: last.sequence };
      }
      expect(seen).toEqual([
        taskIds.overdue,
        taskIds.today,
        taskIds.soon,
        taskIds.far,
        taskIds.none,
      ]);
      expect(new Set(seen).size).toBe(5);
    });
  });

  describe("phase 5a description and dependencies", () => {
    const depsBoardId = "01900000-0000-7000-8000-000000000501";
    const otherBoardTaskId = "01900000-0000-7000-8000-000000000509";

    async function create(
      name: string,
      dependsOnIds: string[] = [],
      description: string | null = null,
    ) {
      const result = await repository.createForMember(depsBoardId, ids.contributor, {
        name,
        description,
        status: "NOT_STARTED",
        priority: "MEDIUM",
        assigneeId: null,
        reporterId: ids.contributor,
        dueDate: null,
        dependsOnIds,
      });
      if (result.kind !== "CREATED") throw new Error(`expected CREATED, got ${result.kind}`);
      return result.task;
    }

    function setDependencies(task: TaskRow, dependsOnIds: string[], version = task.version) {
      return repository.updateForMember(task.id, ids.contributor, {
        name: task.name,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assigneeId: null,
        reporterId: ids.contributor,
        dueDate: null,
        dependsOnIds,
        version,
      });
    }

    function setStatus(task: TaskRow, status: TaskStatus) {
      return repository.updateForMember(task.id, ids.contributor, {
        name: task.name,
        description: task.description,
        status,
        priority: task.priority,
        assigneeId: null,
        reporterId: ids.contributor,
        dueDate: null,
        dependsOnIds: task.dependsOn.map((dependency) => dependency.id),
        version: task.version,
      });
    }

    async function reload(taskId: string): Promise<TaskRow> {
      const row = await repository.getForMember(taskId, ids.contributor);
      if (!row) throw new Error("expected a visible task");
      return row;
    }

    beforeAll(async () => {
      await prisma.board.deleteMany({ where: { id: depsBoardId } });
      await prisma.board.create({
        data: {
          id: depsBoardId,
          name: "Dependency board",
          ownerId: ids.admin,
          memberships: {
            create: [
              { id: "01900000-0000-7000-8000-000000000502", userId: ids.admin, role: "ADMIN" },
              {
                id: "01900000-0000-7000-8000-000000000503",
                userId: ids.contributor,
                role: "CONTRIBUTOR",
              },
            ],
          },
        },
      });
      await prisma.task.create({
        data: {
          id: otherBoardTaskId,
          boardId: ids.otherBoard,
          sequence: 900,
          name: "Other board task",
          reporterId: ids.outsider,
          createdById: ids.outsider,
        },
      });
    });

    afterAll(async () => {
      await prisma.board.deleteMany({ where: { id: depsBoardId } });
      await prisma.task.deleteMany({ where: { id: otherBoardTaskId } });
    });

    it("persists Markdown and returns prerequisites ordered by sequence", async () => {
      const first = await create("First prerequisite");
      const second = await create("Second prerequisite");
      const task = await create("Dependent", [second.id, first.id], "## Plan\n\n- [ ] draft");
      expect(task.description).toBe("## Plan\n\n- [ ] draft");
      expect(task.dependsOn).toEqual([
        { id: first.id, sequence: first.sequence, name: first.name, status: "NOT_STARTED" },
        { id: second.id, sequence: second.sequence, name: second.name, status: "NOT_STARTED" },
      ]);
      expect((await reload(task.id)).dependsOn.map((item) => item.id)).toEqual([
        first.id,
        second.id,
      ]);
    });

    it("gates In Progress and Completed moves until every prerequisite is completed", async () => {
      const prerequisite = await create("Workflow prerequisite");

      await expect(
        repository.createForMember(depsBoardId, ids.contributor, {
          name: "Blocked create",
          description: null,
          status: "COMPLETED",
          priority: "MEDIUM",
          assigneeId: null,
          reporterId: ids.contributor,
          dueDate: null,
          dependsOnIds: [prerequisite.id],
        }),
      ).resolves.toEqual({ kind: "DEPENDENCIES_INCOMPLETE" });

      const dependent = await create("Blocked dependent", [prerequisite.id]);
      for (const status of ["IN_PROGRESS", "COMPLETED"] as const) {
        await expect(setStatus(dependent, status)).resolves.toEqual({
          kind: "DEPENDENCIES_INCOMPLETE",
        });
      }
      expect(await reload(dependent.id)).toMatchObject({
        status: "NOT_STARTED",
        version: dependent.version,
      });

      // Parking the dependent while the prerequisite is open is not a move forward.
      await expect(setStatus(dependent, "ARCHIVED")).resolves.toMatchObject({
        kind: "UPDATED",
        task: { status: "ARCHIVED" },
      });

      await expect(setStatus(prerequisite, "COMPLETED")).resolves.toMatchObject({
        kind: "UPDATED",
      });
      await expect(setStatus(await reload(dependent.id), "COMPLETED")).resolves.toMatchObject({
        kind: "UPDATED",
        task: { status: "COMPLETED" },
      });
      await expect(
        repository.createForMember(depsBoardId, ids.contributor, {
          name: "Permitted create",
          description: null,
          status: "COMPLETED",
          priority: "MEDIUM",
          assigneeId: null,
          reporterId: ids.contributor,
          dueDate: null,
          dependsOnIds: [prerequisite.id],
        }),
      ).resolves.toMatchObject({ kind: "CREATED", task: { status: "COMPLETED" } });
    });

    it("keeps the edge when a prerequisite is archived and treats it as settled", async () => {
      const prerequisite = await create("Cancelled prerequisite");
      const dependent = await create("Depends on cancelled work", [prerequisite.id]);

      await expect(setStatus(prerequisite, "ARCHIVED")).resolves.toMatchObject({
        kind: "UPDATED",
        task: { status: "ARCHIVED" },
      });
      // The edge survives archiving, so the dependency stays visible instead of
      // disappearing and taking the record of unfinished work with it.
      expect((await reload(dependent.id)).dependsOn).toEqual([
        {
          id: prerequisite.id,
          sequence: prerequisite.sequence,
          name: prerequisite.name,
          status: "ARCHIVED",
        },
      ]);
      await expect(setStatus(dependent, "IN_PROGRESS")).resolves.toMatchObject({
        kind: "UPDATED",
        task: { status: "IN_PROGRESS" },
      });
    });

    it("reports a loop instead of the status gate when one edit would do both", async () => {
      const openPrerequisite = await create("Open prerequisite");
      const task = await create("Gated dependent", [openPrerequisite.id]);
      const downstream = await create("Downstream", [task.id]);

      // Completing while adding the edge that closes the loop is both a gated move and a
      // cycle; the loop is the actionable answer.
      const current = await reload(task.id);
      await expect(
        repository.updateForMember(current.id, ids.contributor, {
          name: current.name,
          description: current.description,
          status: "COMPLETED",
          priority: current.priority,
          assigneeId: null,
          reporterId: ids.contributor,
          dueDate: null,
          dependsOnIds: [...current.dependsOn.map((dependency) => dependency.id), downstream.id],
          version: current.version,
        }),
      ).resolves.toEqual({ kind: "DEPENDENCY_CYCLE" });
      expect(await reload(task.id)).toMatchObject({
        status: "NOT_STARTED",
        version: current.version,
      });
    });

    it("leaves an unchanged status editable when a prerequisite drifts back", async () => {
      const prerequisite = await create("Drifting prerequisite");
      const dependent = await create("Progressed dependent", [prerequisite.id]);
      await expect(setStatus(prerequisite, "COMPLETED")).resolves.toMatchObject({
        kind: "UPDATED",
      });
      await expect(setStatus(dependent, "IN_PROGRESS")).resolves.toMatchObject({
        kind: "UPDATED",
        task: { status: "IN_PROGRESS" },
      });

      await expect(setStatus(await reload(prerequisite.id), "NOT_STARTED")).resolves.toMatchObject({
        kind: "UPDATED",
        task: { status: "NOT_STARTED" },
      });

      const progressed = await reload(dependent.id);
      await expect(
        repository.updateForMember(progressed.id, ids.contributor, {
          name: "Renamed while progressed",
          description: progressed.description,
          status: progressed.status,
          priority: progressed.priority,
          assigneeId: null,
          reporterId: ids.contributor,
          dueDate: null,
          dependsOnIds: progressed.dependsOn.map((dependency) => dependency.id),
          version: progressed.version,
        }),
      ).resolves.toMatchObject({
        kind: "UPDATED",
        task: { name: "Renamed while progressed" },
      });

      // Moving again is still gated by the prerequisite that drifted back.
      await expect(setStatus(await reload(dependent.id), "COMPLETED")).resolves.toEqual({
        kind: "DEPENDENCIES_INCOMPLETE",
      });
    });

    it("rejects a dependency on another board's task or an unknown task", async () => {
      await expect(
        repository.createForMember(depsBoardId, ids.contributor, {
          name: "Cross-board",
          description: null,
          status: "NOT_STARTED",
          priority: "MEDIUM",
          assigneeId: null,
          reporterId: ids.contributor,
          dueDate: null,
          dependsOnIds: [otherBoardTaskId],
        }),
      ).resolves.toEqual({ kind: "DEPENDENCY_NOT_FOUND" });
      const task = await create("Local");
      await expect(
        setDependencies(task, ["01900000-0000-7000-8000-0000000005ff"]),
      ).resolves.toEqual({ kind: "DEPENDENCY_NOT_FOUND" });
      expect(await reload(task.id)).toMatchObject({ version: task.version, dependsOn: [] });
    });

    it("rejects direct and transitive cycles without changing the task", async () => {
      const a = await create("Cycle A");
      const b = await create("Cycle B", [a.id]);
      const c = await create("Cycle C", [b.id]);
      await expect(setDependencies(a, [b.id])).resolves.toEqual({ kind: "DEPENDENCY_CYCLE" });
      await expect(setDependencies(a, [c.id])).resolves.toEqual({ kind: "DEPENDENCY_CYCLE" });
      expect(await reload(a.id)).toMatchObject({ version: a.version, dependsOn: [] });

      // Removing C -> B breaks the chain, after which A may depend on C.
      const cleared = await setDependencies(c, []);
      expect(cleared).toMatchObject({ kind: "UPDATED", task: { dependsOn: [] } });
      await expect(setDependencies(a, [c.id])).resolves.toMatchObject({ kind: "UPDATED" });
    });

    it("lets only one of two concurrent opposite edges win", async () => {
      const left = await create("Race left");
      const right = await create("Race right");
      const results = await Promise.all([
        setDependencies(left, [right.id]),
        setDependencies(right, [left.id]),
      ]);
      expect(results.map((result) => result.kind).sort()).toEqual(["DEPENDENCY_CYCLE", "UPDATED"]);
      const edges = await prisma.taskDependency.count({
        where: { taskId: { in: [left.id, right.id] } },
      });
      expect(edges).toBe(1);
    });

    it("keeps the dependency set when a stale version loses", async () => {
      const prerequisite = await create("Stale prerequisite");
      const task = await create("Stale dependent", [prerequisite.id]);
      const renamed = await setDependencies(task, [prerequisite.id]);
      expect(renamed.kind).toBe("UPDATED");
      await expect(setDependencies(task, [], task.version)).resolves.toEqual({
        kind: "VERSION_CONFLICT",
      });
      expect((await reload(task.id)).dependsOn.map((item) => item.id)).toEqual([prerequisite.id]);
    });

    it("drops edges when a prerequisite is deleted", async () => {
      const prerequisite = await create("Deleted prerequisite");
      const task = await create("Survivor", [prerequisite.id]);
      await expect(
        repository.deleteForMember(prerequisite.id, ids.contributor, prerequisite.version),
      ).resolves.toBe("DELETED");
      expect((await reload(task.id)).dependsOn).toEqual([]);
    });

    it("enforces same-board edges, no self-edges, and non-blank descriptions in PostgreSQL", async () => {
      const task = await create("Constraint target");
      await expect(
        prisma.taskDependency.create({
          data: { boardId: depsBoardId, taskId: task.id, dependsOnTaskId: task.id },
        }),
      ).rejects.toThrow(/task_dependency_not_self/);
      await expect(
        prisma.taskDependency.create({
          data: { boardId: depsBoardId, taskId: task.id, dependsOnTaskId: otherBoardTaskId },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.task.update({ where: { id: task.id }, data: { description: "" } }),
      ).rejects.toThrow(/task_description_length/);
    });
  });
});

describe.skip("placeholder", () => {});
