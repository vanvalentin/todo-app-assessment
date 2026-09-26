import { describe, expect, it } from "vitest";
import { assertDemoSeedAllowed, demoTasks } from "../src/seed.js";

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
    for (const sequences of perBoard.values()) {
      expect(new Set(sequences).size).toBe(sequences.length);
    }
  });
});
