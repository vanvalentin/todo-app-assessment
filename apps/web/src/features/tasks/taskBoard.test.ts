import { describe, expect, it } from "vitest";
import type { Task } from "@ksat/contracts";
import { buildTask } from "../../test/fixtures";
import {
  columnTitle,
  describeDueDate,
  dueDateMatchesFilter,
  groupTasksByStatus,
  localToday,
  matchesTaskFilters,
  visibleColumns,
} from "./taskBoard";

describe("visibleColumns", () => {
  it("omits Archived unless requested", () => {
    expect(visibleColumns(false).map((column) => column.status)).toEqual([
      "NOT_STARTED",
      "IN_PROGRESS",
      "COMPLETED",
    ]);
    expect(visibleColumns(true).map((column) => column.status)).toEqual([
      "NOT_STARTED",
      "IN_PROGRESS",
      "COMPLETED",
      "ARCHIVED",
    ]);
  });
});

describe("columnTitle", () => {
  it("names every status, including Archived", () => {
    expect(columnTitle("NOT_STARTED")).toBe("Not Started");
    expect(columnTitle("ARCHIVED")).toBe("Archived");
  });
});

describe("groupTasksByStatus", () => {
  it("partitions tasks into all four buckets while preserving arrival order", () => {
    const tasks: Task[] = [
      buildTask({ id: "1", sequence: 3, status: "IN_PROGRESS" }),
      buildTask({ id: "2", sequence: 1, status: "NOT_STARTED" }),
      buildTask({ id: "3", sequence: 2, status: "ARCHIVED" }),
      buildTask({ id: "4", sequence: 5, status: "NOT_STARTED" }),
    ];
    const grouped = groupTasksByStatus(tasks);
    expect(grouped.NOT_STARTED.map((task) => task.id)).toEqual(["2", "4"]);
    expect(grouped.IN_PROGRESS.map((task) => task.id)).toEqual(["1"]);
    expect(grouped.ARCHIVED.map((task) => task.id)).toEqual(["3"]);
    expect(grouped.COMPLETED).toEqual([]);
  });
});

describe("localToday", () => {
  it("formats the given date as YYYY-MM-DD in local time", () => {
    expect(localToday(new Date(2027, 3, 5))).toBe("2027-04-05");
  });
});

describe("describeDueDate", () => {
  it("labels overdue, due-today, and upcoming dates with text, not colour alone", () => {
    const now = new Date("2027-04-18T12:00:00");
    expect(describeDueDate("2027-04-16", now)).toMatchObject({
      tone: "overdue",
      badge: "2d overdue",
    });
    expect(describeDueDate("2027-04-18", now)).toMatchObject({ tone: "today", badge: "Due today" });
    expect(describeDueDate("2027-04-21", now)).toMatchObject({
      tone: "upcoming",
      badge: "3d left",
    });
    expect(describeDueDate(null, now)).toBeNull();
  });
});

describe("dueDateMatchesFilter", () => {
  const today = "2027-04-18";

  it("resolves OVERDUE, TODAY, NEXT_7_DAYS, and NONE against the given today", () => {
    expect(dueDateMatchesFilter("2027-04-17", "OVERDUE", today)).toBe(true);
    expect(dueDateMatchesFilter("2027-04-18", "OVERDUE", today)).toBe(false);
    expect(dueDateMatchesFilter("2027-04-18", "TODAY", today)).toBe(true);
    expect(dueDateMatchesFilter("2027-04-19", "TODAY", today)).toBe(false);
    // NEXT_7_DAYS spans today..today+6 inclusive, matching the API's own bucket.
    expect(dueDateMatchesFilter("2027-04-18", "NEXT_7_DAYS", today)).toBe(true);
    expect(dueDateMatchesFilter("2027-04-24", "NEXT_7_DAYS", today)).toBe(true);
    expect(dueDateMatchesFilter("2027-04-25", "NEXT_7_DAYS", today)).toBe(false);
    expect(dueDateMatchesFilter(null, "NONE", today)).toBe(true);
    expect(dueDateMatchesFilter("2027-04-18", "NONE", today)).toBe(false);
    expect(dueDateMatchesFilter(null, "OVERDUE", today)).toBe(false);
  });
});

describe("matchesTaskFilters", () => {
  const task = buildTask({
    name: "Curate photo prints",
    sequence: 12,
    status: "IN_PROGRESS",
    priority: "HIGH",
    assignee: { id: "member-1", name: "Grace Hopper", avatarSeed: "grace-seed" },
    dueDate: "2027-04-18",
  });

  it("excludes ARCHIVED tasks unless includeArchived is set", () => {
    const archived = buildTask({ status: "ARCHIVED" });
    expect(matchesTaskFilters(archived, { includeArchived: false })).toBe(false);
    expect(matchesTaskFilters(archived, { includeArchived: true })).toBe(true);
  });

  it("filters by status, priority, and assignee", () => {
    expect(matchesTaskFilters(task, { includeArchived: false, status: "IN_PROGRESS" })).toBe(true);
    expect(matchesTaskFilters(task, { includeArchived: false, status: "COMPLETED" })).toBe(false);
    expect(matchesTaskFilters(task, { includeArchived: false, priority: "HIGH" })).toBe(true);
    expect(matchesTaskFilters(task, { includeArchived: false, priority: "LOW" })).toBe(false);
    expect(matchesTaskFilters(task, { includeArchived: false, assignee: "member-1" })).toBe(true);
    expect(matchesTaskFilters(task, { includeArchived: false, assignee: "someone-else" })).toBe(
      false,
    );
    expect(matchesTaskFilters(task, { includeArchived: false, assignee: "none" })).toBe(false);
    const unassigned = buildTask({ assignee: null });
    expect(matchesTaskFilters(unassigned, { includeArchived: false, assignee: "none" })).toBe(true);
  });

  it("filters by a due bucket only once today is supplied", () => {
    expect(
      matchesTaskFilters(task, { includeArchived: false, due: "TODAY", today: "2027-04-18" }),
    ).toBe(true);
    expect(
      matchesTaskFilters(task, { includeArchived: false, due: "OVERDUE", today: "2027-04-18" }),
    ).toBe(false);
    // Without today, a due filter cannot be resolved and is treated as not excluding.
    expect(matchesTaskFilters(task, { includeArchived: false, due: "OVERDUE" })).toBe(true);
  });

  it("matches a search term against the name or an exact sequence", () => {
    expect(matchesTaskFilters(task, { includeArchived: false, q: "photo" })).toBe(true);
    expect(matchesTaskFilters(task, { includeArchived: false, q: "PHOTO" })).toBe(true);
    expect(matchesTaskFilters(task, { includeArchived: false, q: "#12" })).toBe(true);
    expect(matchesTaskFilters(task, { includeArchived: false, q: "12" })).toBe(true);
    expect(matchesTaskFilters(task, { includeArchived: false, q: "nope" })).toBe(false);
  });
});
