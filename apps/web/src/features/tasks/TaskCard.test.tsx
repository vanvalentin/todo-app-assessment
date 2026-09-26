import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { USER_IDS, buildTask } from "../../test/fixtures";
import { TaskCard } from "./TaskCard";

describe("TaskCard people and dates", () => {
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

  it("omits the people/date footer when both fields are empty", () => {
    render(<TaskCard task={buildTask({ assignee: null, dueDate: null })} />);
    expect(screen.queryByText("Unassigned")).not.toBeInTheDocument();
    expect(screen.queryByText(/Overdue/)).not.toBeInTheDocument();
  });
});
