import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { USER_IDS, buildTask } from "../../test/fixtures";
import { TaskCard } from "./TaskCard";

describe("TaskCard people and dates", () => {
  it("marks a generated occurrence as recurring even after the schedule moves forward", () => {
    render(
      <TaskCard
        task={buildTask({
          recurrence: {
            schedule: null,
            occurrence: {
              id: "01900000-0000-7000-8000-000000000399",
              scheduledAt: "2027-04-20T13:00:00.000Z",
              templateTaskId: "01900000-0000-7000-8000-000000000398",
              generatedTaskId: "01900000-0000-7000-8000-000000000301",
            },
          },
        })}
      />,
    );

    expect(screen.getByLabelText("Recurring task")).toHaveTextContent("Recurring");
    expect(screen.queryByText("Occurrence")).not.toBeInTheDocument();
  });

  it("renders the assignee and an explicit overdue cue", () => {
    render(
      <TaskCard
        task={buildTask({
          assignee: {
            id: USER_IDS.grace,
            name: "Grace Hopper",
            avatarSeed: "grace-seed",
          },
          dueDate: "2027-04-18",
        })}
        now={new Date("2027-04-21T12:00:00.000Z")}
      />,
    );

    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText(/Apr 18, 2027/)).toBeInTheDocument();
    expect(screen.getByText(/Overdue/)).toBeInTheDocument();
  });
});
