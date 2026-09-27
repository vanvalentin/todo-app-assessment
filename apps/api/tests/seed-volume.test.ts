import { describe, expect, it } from "vitest";
import {
  assertVolumeSeedAllowed,
  buildVolumePlan,
  parseVolumeSeedArgs,
  volumeBoardIdPrefix,
  volumeSeedOptionsSchema,
} from "../src/seed-volume.js";

const options = {
  users: 40,
  boards: 6,
  largeBoardTasks: 3_000,
  tasksPerBoard: 120,
  referenceDate: "2027-05-01",
  dataset: 0,
};

describe("volume seed plan", () => {
  it("produces the same plan for the same options", () => {
    expect(JSON.stringify(buildVolumePlan(options))).toBe(JSON.stringify(buildVolumePlan(options)));
  });

  it("generates a large, internally consistent dataset", () => {
    const plan = buildVolumePlan(options);
    expect(plan.users).toHaveLength(40);
    expect(plan.boards).toHaveLength(7);
    expect(plan.tasks).toHaveLength(3_000 + 6 * 120);
    expect(new Set(plan.users.map((user) => user.email)).size).toBe(40);
    expect(plan.users.every((user) => user.email.endsWith("@example.test"))).toBe(true);

    // The large board includes everyone; the first user reaches every board.
    expect(plan.boards[0]?.members).toHaveLength(40);
    for (const board of plan.boards) {
      expect(board.id.startsWith(volumeBoardIdPrefix(0))).toBe(true);
      expect(board.members.some((member) => member.userIndex === 0)).toBe(true);
      expect(board.members.find((member) => member.userIndex === board.ownerIndex)?.role).toBe(
        "ADMIN",
      );
    }

    const ids = [...plan.boards.map((b) => b.id), ...plan.tasks.map((t) => t.id)];
    expect(new Set(ids).size).toBe(ids.length);

    const members = new Map(
      plan.boards.map((b) => [b.id, new Set(b.members.map((m) => m.userIndex))]),
    );
    const taskById = new Map(plan.tasks.map((task) => [task.id, task]));
    const sequencesByBoard = new Map<string, number[]>();
    for (const task of plan.tasks) {
      const boardMembers = members.get(task.boardId);
      expect(boardMembers?.has(task.creatorIndex)).toBe(true);
      if (task.assigneeIndex !== null) expect(boardMembers?.has(task.assigneeIndex)).toBe(true);
      sequencesByBoard.set(task.boardId, [
        ...(sequencesByBoard.get(task.boardId) ?? []),
        task.sequence,
      ]);
    }
    for (const sequences of sequencesByBoard.values()) {
      expect(sequences).toEqual(sequences.map((_, index) => index + 1));
    }

    // Dependencies stay on one board, point backwards (acyclic), and never break the
    // start/complete gate or reference deleted rows.
    let blocked = 0;
    let settledOnly = 0;
    const edgesPerTask = new Map<string, number>();
    for (const edge of plan.dependencies) {
      const task = taskById.get(edge.taskId);
      const prerequisite = taskById.get(edge.dependsOnTaskId);
      expect(task?.boardId).toBe(edge.boardId);
      expect(prerequisite?.boardId).toBe(edge.boardId);
      expect(prerequisite && task && prerequisite.sequence < task.sequence).toBe(true);
      expect(task?.status).toBe("NOT_STARTED");
      expect(task?.deletedAt).toBeNull();
      expect(prerequisite?.deletedAt).toBeNull();
      edgesPerTask.set(edge.taskId, (edgesPerTask.get(edge.taskId) ?? 0) + 1);
      if (prerequisite?.status === "NOT_STARTED" || prerequisite?.status === "IN_PROGRESS")
        blocked += 1;
      else settledOnly += 1;
    }
    expect(Math.max(...edgesPerTask.values())).toBeLessThanOrEqual(20);
    expect(blocked).toBeGreaterThan(0);
    expect(settledOnly).toBeGreaterThan(0);

    expect(new Set(plan.tasks.map((task) => task.status))).toEqual(
      new Set(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "ARCHIVED"]),
    );
    expect(plan.tasks.some((task) => task.deletedAt !== null)).toBe(true);
    expect(
      plan.tasks.some((task) => task.dueDate !== null && task.dueDate < options.referenceDate),
    ).toBe(true);

    expect(plan.schedules.length).toBeGreaterThan(0);
    for (const schedule of plan.schedules) {
      const task = taskById.get(schedule.taskId);
      expect(task?.status).toBe("NOT_STARTED");
      expect(task?.deletedAt).toBeNull();
      expect(schedule.nextRunAt?.getTime()).toBeGreaterThanOrEqual(
        Date.parse("2027-05-01T00:00:00Z"),
      );
    }
  });

  it("keeps datasets in disjoint id ranges", () => {
    const first = buildVolumePlan({
      ...options,
      dataset: 0,
      largeBoardTasks: 10,
      tasksPerBoard: 5,
    });
    const second = buildVolumePlan({
      ...options,
      dataset: 1,
      largeBoardTasks: 10,
      tasksPerBoard: 5,
    });
    const firstIds = new Set(first.tasks.map((task) => task.id));
    expect(second.tasks.some((task) => firstIds.has(task.id))).toBe(false);
  });
});

describe("volume seed command", () => {
  it("parses options, including pnpm's forwarded separator", () => {
    const command = parseVolumeSeedArgs([
      "--",
      "--users=500",
      "--large-board-tasks",
      "20000",
      "--reset",
    ]);
    expect(command.reset).toBe(true);
    expect(command.options).toMatchObject({
      users: 500,
      largeBoardTasks: 20_000,
      boards: 20,
      tasksPerBoard: 250,
    });
  });

  it.each([
    [{ users: 1 }],
    [{ users: 5_001 }],
    [{ largeBoardTasks: 100_001 }],
    [{ referenceDate: "2027-02-30" }],
    [{ dataset: 4_096 }],
  ])("rejects out-of-range options %j", (input) => {
    expect(volumeSeedOptionsSchema.safeParse(input).success).toBe(false);
  });

  it("rejects unknown flags", () => {
    expect(() => parseVolumeSeedArgs(["--userz=5"])).toThrow();
  });

  it("refuses production unless explicitly overridden", () => {
    expect(() =>
      assertVolumeSeedAllowed({ NODE_ENV: "production", ALLOW_PRODUCTION_DEMO_SEED: false }),
    ).toThrow(/disabled in production/);
    expect(() =>
      assertVolumeSeedAllowed({ NODE_ENV: "production", ALLOW_PRODUCTION_DEMO_SEED: true }),
    ).not.toThrow();
    expect(() =>
      assertVolumeSeedAllowed({ NODE_ENV: "development", ALLOW_PRODUCTION_DEMO_SEED: false }),
    ).not.toThrow();
  });
});
