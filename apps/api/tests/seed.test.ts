import { describe, expect, it } from "vitest";
import { assertDemoSeedAllowed, demoTaskDependencies, demoTasks } from "../src/seed.js";

describe("demo seed policy", () => {
  it("rejects production demo seeding unless explicitly overridden", () => {
    expect(() =>
      assertDemoSeedAllowed({
        NODE_ENV: "production",
        SEED_DEMO_DATA: true,
        ALLOW_PRODUCTION_DEMO_SEED: false,
      }),
    ).toThrow(/disabled in production/);

    expect(() =>
      assertDemoSeedAllowed({
        NODE_ENV: "production",
        SEED_DEMO_DATA: true,
        ALLOW_PRODUCTION_DEMO_SEED: true,
      }),
    ).not.toThrow();
  });

  it("keeps the demo task fixtures deterministic and non-production", () => {
    const ids = demoTasks.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(demoTasks.length).toBeGreaterThan(0);

    for (const task of demoTasks) {
      expect(task.name.trim()).not.toBe("");
      expect(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "ARCHIVED"]).toContain(task.status);
      expect(["LOW", "MEDIUM", "HIGH"]).toContain(task.priority);
      expect(task.creator.endsWith("@example.test")).toBe(true);
      expect(task.sequence).toBeGreaterThan(0);
    }

    const perBoard = new Map<string, number[]>();
    for (const task of demoTasks) {
      perBoard.set(task.boardId, [...(perBoard.get(task.boardId) ?? []), task.sequence]);
    }
    expect(perBoard.size).toBe(4);
    for (const sequences of perBoard.values()) {
      expect(sequences).toHaveLength(6);
      expect(new Set(sequences).size).toBe(sequences.length);
    }

    expect(new Set(demoTasks.map((task) => task.status))).toEqual(
      new Set(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "ARCHIVED"]),
    );
    expect(new Set(demoTasks.map((task) => task.priority))).toEqual(
      new Set(["LOW", "MEDIUM", "HIGH"]),
    );
    for (const field of ["assignee", "dueDate", "description"] as const) {
      expect(demoTasks.some((task) => task[field] === null)).toBe(true);
      expect(demoTasks.some((task) => task[field] !== null)).toBe(true);
    }

    const membersByBoard = new Map<string, ReadonlySet<string>>([
      [
        "01900000-0000-7000-8000-000000000001",
        new Set(["ada@example.test", "grace@example.test", "linus@example.test"]),
      ],
      [
        "01900000-0000-7000-8000-000000000002",
        new Set(["grace@example.test", "ada@example.test", "maya@example.test"]),
      ],
      [
        "01900000-0000-7000-8000-000000000003",
        new Set(["linus@example.test", "maya@example.test"]),
      ],
      ["01900000-0000-7000-8000-000000000004", new Set(["maya@example.test", "ada@example.test"])],
    ]);
    for (const task of demoTasks) {
      const members = membersByBoard.get(task.boardId);
      expect(members?.has(task.creator)).toBe(true);
      if (task.assignee !== null) expect(members?.has(task.assignee)).toBe(true);
    }

    // Every demo dependency stays on one board and never points at itself.
    const boardOf = new Map<string, string>(demoTasks.map((task) => [task.id, task.boardId]));
    for (const [taskId, dependsOnTaskId] of demoTaskDependencies) {
      expect(taskId).not.toBe(dependsOnTaskId);
      expect(boardOf.get(taskId)).toBeDefined();
      expect(boardOf.get(taskId)).toBe(boardOf.get(dependsOnTaskId));
    }
  });
});
