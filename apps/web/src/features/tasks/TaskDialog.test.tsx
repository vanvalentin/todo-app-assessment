import { http, HttpResponse } from "msw";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOARD_ID, ada, buildBoard, buildTask } from "../../test/fixtures";
import { Route, renderRoutes } from "../../test/renderWithProviders";
import { server } from "../../test/server";
import { TaskBoardPage } from "./TaskBoardPage";

const mocks = vi.hoisted(() => ({ useSession: vi.fn(), signOut: vi.fn() }));

vi.mock("../../features/auth/authClient", () => ({
  authClient: {
    useSession: mocks.useSession,
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: mocks.signOut,
  },
}));

const BOARD_PATH = `/api/v1/boards/${BOARD_ID}`;
const TASKS_PATH = `/api/v1/boards/${BOARD_ID}/tasks`;
const TASK_PATTERN = "/api/v1/tasks/:taskId";
const existing = buildTask({ id: "01900000-0000-7000-8000-000000000501" });

function renderBoard() {
  return renderRoutes(<Route path="/boards/:boardId" element={<TaskBoardPage />} />, {
    route: `/boards/${BOARD_ID}`,
  });
}

async function openCreateDialog(): Promise<{ dialog: HTMLElement; trigger: HTMLElement }> {
  const [trigger] = screen.getAllByRole("button", { name: "New Task" });
  if (trigger === undefined) throw new Error("no New Task control");
  fireEvent.click(trigger);
  return { dialog: await screen.findByRole("dialog"), trigger };
}

/** One click on the card opens the task dialog. */
async function openTaskDialog(name: string): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.findByRole("dialog");
}

describe("task create and edit dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ data: { user: ada }, error: undefined, isPending: false });
    server.use(
      http.get(BOARD_PATH, () => HttpResponse.json(buildBoard())),
      http.get(TASKS_PATH, () => HttpResponse.json({ items: [existing], nextCursor: null })),
    );
  });

  it("validates the name, then creates a task in the chosen column", async () => {
    let posted: unknown = null;
    const created = buildTask({
      id: "01900000-0000-7000-8000-000000000502",
      sequence: 2,
      status: "IN_PROGRESS",
    });
    server.use(
      http.post(TASKS_PATH, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    renderBoard();
    const { dialog } = await openCreateDialog();

    expect(within(dialog).getByLabelText("Task name")).toHaveFocus();
    expect(within(dialog).queryByRole("button", { name: "Delete task" })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Create task" }));
    expect(await within(dialog).findByText("Give the task a name.")).toBeInTheDocument();
    expect(posted).toBeNull();

    fireEvent.change(within(dialog).getByLabelText("Task name"), {
      target: { value: "  Write the studio newsletter  " },
    });
    fireEvent.change(within(dialog).getByLabelText("Column"), {
      target: { value: "IN_PROGRESS" },
    });
    fireEvent.change(within(dialog).getByLabelText("Priority"), { target: { value: "HIGH" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create task" }));

    await waitFor(() =>
      expect(posted).toEqual({
        name: "Write the studio newsletter",
        status: "IN_PROGRESS",
        priority: "HIGH",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("traps focus, closes on Escape, and returns focus to the trigger", async () => {
    renderBoard();
    const { dialog, trigger } = await openCreateDialog();

    const focusable = [
      within(dialog).getByLabelText("Task name"),
      within(dialog).getByLabelText("Column"),
      within(dialog).getByLabelText("Priority"),
      within(dialog).getByRole("button", { name: "Cancel" }),
      within(dialog).getByRole("button", { name: "Create task" }),
    ];
    const last = focusable.at(-1);
    if (last === undefined) throw new Error("no submit button");
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(focusable[0]).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("edits an existing task with its version and reports a conflict", async () => {
    let patched: unknown = null;
    server.use(
      http.patch(TASK_PATTERN, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json(
          {
            type: "about:blank",
            title: "TASK VERSION CONFLICT",
            status: 409,
            detail: "The task was changed by someone else.",
            instance: TASK_PATTERN,
            code: "TASK_VERSION_CONFLICT",
            requestId: "test",
          },
          { status: 409, headers: { "content-type": "application/problem+json" } },
        );
      }),
    );
    renderBoard();
    await screen.findByText(existing.name);
    const dialog = await openTaskDialog(existing.name);

    const nameField = within(dialog).getByLabelText("Task name");
    expect(nameField).toHaveValue(existing.name);
    expect(within(dialog).getByRole("button", { name: "Delete task" })).toBeInTheDocument();
    fireEvent.change(nameField, { target: { value: "Renamed by Ada" } });
    fireEvent.change(within(dialog).getByLabelText("Priority"), { target: { value: "LOW" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save task" }));

    expect(
      await within(dialog).findByText(/Someone else changed this task first/),
    ).toBeInTheDocument();
    expect(patched).toEqual({
      name: "Renamed by Ada",
      status: "NOT_STARTED",
      priority: "LOW",
      version: 1,
    });
  });

  it("saves an edit and shows the server's version afterwards", async () => {
    let saved = { ...existing };
    server.use(
      http.get(TASKS_PATH, () => HttpResponse.json({ items: [saved], nextCursor: null })),
      http.patch(TASK_PATTERN, () => {
        saved = { ...existing, name: "Renamed by Ada", version: 2 };
        return HttpResponse.json(saved);
      }),
    );
    renderBoard();
    await screen.findByText(existing.name);
    const dialog = await openTaskDialog(existing.name);

    fireEvent.change(within(dialog).getByLabelText("Task name"), {
      target: { value: "Renamed by Ada" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save task" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Renamed by Ada")).toBeInTheDocument();
    expect(await screen.findByText(`Saved “Renamed by Ada”.`)).toBeInTheDocument();
  });

  it("hands deletion from the edit dialog to the confirmation dialog", async () => {
    renderBoard();
    await screen.findByText(existing.name);
    const dialog = await openTaskDialog(existing.name);

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete task" }));

    const confirm = await screen.findByRole("alertdialog");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(confirm).getByText(new RegExp(existing.name))).toBeInTheDocument();
    expect(within(confirm).getByRole("button", { name: "Keep task" })).toHaveFocus();
  });
});
