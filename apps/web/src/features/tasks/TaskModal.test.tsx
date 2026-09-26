import { http, HttpResponse } from "msw";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOARD_ID, USER_IDS, ada, buildBoard, buildMember, buildTask } from "../../test/fixtures";
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
const MEMBERS_PATH = `/api/v1/boards/${BOARD_ID}/members`;
const TASK_PATTERN = "/api/v1/tasks/:taskId";
const existing = buildTask({ id: "01900000-0000-7000-8000-000000000501" });
const graceMember = buildMember({
  userId: USER_IDS.grace,
  role: "CONTRIBUTOR",
  user: {
    id: USER_IDS.grace,
    name: "Grace Hopper",
    avatarSeed: "grace-seed",
    email: "grace@example.test",
  },
});

function renderBoard() {
  return renderRoutes(<Route path="/boards/:boardId" element={<TaskBoardPage />} />, {
    route: `/boards/${BOARD_ID}`,
  });
}

async function openCreateModal() {
  const [trigger] = screen.getAllByRole("button", { name: "New Task" });
  if (!trigger) throw new Error("no New Task control");
  fireEvent.click(trigger);
  return { modal: await screen.findByRole("dialog"), trigger };
}

async function openTaskModal(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.findByRole("dialog");
}

async function choosePill(modal: HTMLElement, label: string, option: string) {
  const user = userEvent.setup();
  await user.click(within(modal).getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("TaskModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ data: { user: ada }, error: undefined, isPending: false });
    server.use(
      http.get(BOARD_PATH, () => HttpResponse.json(buildBoard())),
      http.get(TASKS_PATH, () => HttpResponse.json({ items: [existing], nextCursor: null })),
      http.get(MEMBERS_PATH, () =>
        HttpResponse.json({ items: [buildMember(), graceMember], nextCursor: null }),
      ),
    );
  });

  it("validates a create, then submits people, status, priority, and due date", async () => {
    let posted: unknown = null;
    const created = buildTask({
      id: "01900000-0000-7000-8000-000000000502",
      sequence: 2,
      name: "Write the studio newsletter",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assignee: { id: USER_IDS.grace, name: "Grace Hopper", avatarSeed: "grace-seed" },
      dueDate: "2027-04-18",
    });
    server.use(
      http.post(TASKS_PATH, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    renderBoard();
    const { modal } = await openCreateModal();

    expect(within(modal).getByLabelText("Task name")).toHaveFocus();
    fireEvent.click(within(modal).getByRole("button", { name: "Create task" }));
    expect(await within(modal).findByText("Give the task a name.")).toBeInTheDocument();

    fireEvent.change(within(modal).getByLabelText("Task name"), {
      target: { value: "  Write the studio newsletter  " },
    });
    await choosePill(modal, "Status", "In Progress");
    await choosePill(modal, "Priority", "High Priority");
    await choosePill(modal, "Assignee", "Grace Hopper (Contributor)");
    await userEvent.click(within(modal).getByRole("button", { name: "Due date" }));
    fireEvent.change(screen.getByLabelText("Due date", { selector: "input" }), {
      target: { value: "2027-04-18" },
    });
    fireEvent.click(within(modal).getByRole("button", { name: "Create task" }));

    await waitFor(() =>
      expect(posted).toEqual({
        name: "Write the studio newsletter",
        status: "IN_PROGRESS",
        priority: "HIGH",
        assigneeId: USER_IDS.grace,
        reporterId: USER_IDS.ada,
        dueDate: "2027-04-18",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("supports Create more and keeps selected people and date", async () => {
    const posted: unknown[] = [];
    server.use(
      http.post(TASKS_PATH, async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json(buildTask({ id: crypto.randomUUID() }), { status: 201 });
      }),
    );
    renderBoard();
    const { modal } = await openCreateModal();
    fireEvent.change(within(modal).getByLabelText("Task name"), { target: { value: "First" } });
    fireEvent.click(within(modal).getByRole("checkbox", { name: "Create more" }));
    fireEvent.click(within(modal).getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(within(modal).getByLabelText("Task name")).toHaveValue("");
    expect(within(modal).getByLabelText("Task name")).toHaveFocus();
    expect(within(modal).getByRole("combobox", { name: "Reporter" })).toHaveTextContent(
      "Ada Lovelace",
    );
  });

  it("marks non-member assignee errors on the pill", async () => {
    server.use(
      http.post(TASKS_PATH, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "TASK ASSIGNEE NOT MEMBER",
            status: 422,
            detail: "The assignee must be an active member of this board.",
            instance: TASKS_PATH,
            code: "TASK_ASSIGNEE_NOT_MEMBER",
            requestId: "test",
          },
          { status: 422, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    renderBoard();
    const { modal } = await openCreateModal();
    fireEvent.change(within(modal).getByLabelText("Task name"), { target: { value: "Task" } });
    await choosePill(modal, "Assignee", "Grace Hopper (Contributor)");
    fireEvent.click(within(modal).getByRole("button", { name: "Create task" }));

    expect(await within(modal).findByText(/Choose an active board member/)).toBeInTheDocument();
    expect(within(modal).getByRole("combobox", { name: "Assignee" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("reloads authoritative values and version after a 409 conflict", async () => {
    let patched: unknown = null;
    let attempts = 0;
    const latest = buildTask({ ...existing, name: "Latest server title", version: 2 });
    server.use(
      http.patch(TASK_PATTERN, async ({ request }) => {
        patched = await request.json();
        attempts += 1;
        if (attempts === 1) {
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
        }
        return HttpResponse.json({ ...latest, name: "Saved after reload", version: 3 });
      }),
      http.get(TASK_PATTERN, () => HttpResponse.json(latest)),
    );
    renderBoard();
    await screen.findByText(existing.name);
    const modal = await openTaskModal(existing.name);
    fireEvent.change(within(modal).getByLabelText("Task name"), {
      target: { value: "Local edit" },
    });
    fireEvent.click(within(modal).getByRole("button", { name: /Save changes/ }));
    expect(await within(modal).findByText(/Reload the latest values/)).toBeInTheDocument();

    fireEvent.click(within(modal).getByRole("button", { name: "Reload latest" }));
    await waitFor(() =>
      expect(within(modal).getByLabelText("Task name")).toHaveValue("Latest server title"),
    );
    fireEvent.change(within(modal).getByLabelText("Task name"), {
      target: { value: "Saved after reload" },
    });
    fireEvent.click(within(modal).getByRole("button", { name: /Save changes/ }));
    await waitFor(() => expect(attempts).toBe(2));
    expect(patched).toMatchObject({ version: 2, name: "Saved after reload" });
  });

  it("discards changes and returns focus to the card", async () => {
    renderBoard();
    await screen.findByText(existing.name);
    const modal = await openTaskModal(existing.name);
    fireEvent.change(within(modal).getByLabelText("Task name"), {
      target: { value: "Discard me" },
    });
    expect(within(modal).getByText("Unsaved changes")).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: existing.name })).toHaveFocus());
  });

  it("hands edit-modal deletion to the confirmation dialog", async () => {
    renderBoard();
    await screen.findByText(existing.name);
    const modal = await openTaskModal(existing.name);
    fireEvent.click(within(modal).getByRole("button", { name: "Delete task" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(confirm).getByText(new RegExp(existing.name))).toBeInTheDocument();
  });
});
