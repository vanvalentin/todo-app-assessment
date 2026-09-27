import { http, HttpResponse } from "msw";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@ksat/contracts";
import { BOARD_ID, ada, buildBoard, buildMember, buildTask } from "../../test/fixtures";
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

const notStarted = buildTask({ id: "01900000-0000-7000-8000-000000000401", sequence: 1 });
const completed = buildTask({
  id: "01900000-0000-7000-8000-000000000402",
  sequence: 2,
  name: "Map local cafe workspace network",
  status: "COMPLETED",
  priority: "LOW",
});

function useBoard(options: { tasks?: readonly Task[] } = {}) {
  server.use(
    http.get(BOARD_PATH, () => HttpResponse.json(buildBoard())),
    http.get(TASKS_PATH, () =>
      HttpResponse.json({ items: options.tasks ?? [notStarted, completed], nextCursor: null }),
    ),
    http.get(MEMBERS_PATH, () => HttpResponse.json({ items: [buildMember()], nextCursor: null })),
  );
}

function renderBoard() {
  return renderRoutes(<Route path="/boards/:boardId" element={<TaskBoardPage />} />, {
    route: `/boards/${BOARD_ID}`,
  });
}
/** Resolves once the column exists, so scoped queries do not race the first load. */
async function column(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { level: 2, name, hidden: true });
  const region = heading.closest("section");
  if (region === null) throw new Error(`no column region for ${name}`);
  return region;
}

/** The whole card is clickable through a stretched title button named after the task. */
function taskButton(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

async function openTask(name: string): Promise<HTMLElement> {
  fireEvent.click(taskButton(name));
  return screen.findByRole("dialog");
}

async function choosePill(dialog: HTMLElement, label: string, option: string): Promise<void> {
  const user = userEvent.setup();
  await user.click(within(dialog).getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("TaskBoardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ data: { user: ada }, error: undefined, isPending: false });
  });

  it("offers two board-scoped New Task controls and an empty state", async () => {
    useBoard({ tasks: [] });
    renderBoard();

    expect(
      await screen.findByRole("heading", { name: "No tasks on this board yet" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/No tasks in this column yet\./)).toHaveLength(3);
    const newTaskButtons = screen.getAllByRole("button", { name: "New Task" });
    expect(newTaskButtons).toHaveLength(2);
    for (const button of newTaskButtons) expect(button).toBeEnabled();
  });

  it("reports a board that is unavailable without leaking why", async () => {
    server.use(
      http.get(TASKS_PATH, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(MEMBERS_PATH, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(BOARD_PATH, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "BOARD NOT FOUND",
            status: 404,
            detail: "The board was not found.",
            instance: BOARD_PATH,
            code: "BOARD_NOT_FOUND",
            requestId: "test",
          },
          { status: 404, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    renderBoard();

    expect(
      await screen.findByRole("heading", { name: "We couldn’t find that board" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to boards" })).toHaveAttribute("href", "/boards");
  });

  it("retries a failed task list", async () => {
    let attempts = 0;
    server.use(
      http.get(BOARD_PATH, () => HttpResponse.json(buildBoard())),
      http.get(MEMBERS_PATH, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(TASKS_PATH, () => {
        attempts += 1;
        if (attempts === 1) return HttpResponse.error();
        return HttpResponse.json({ items: [notStarted], nextCursor: null });
      }),
    );
    renderBoard();

    expect(
      await screen.findByRole("heading", { name: "We couldn’t load these tasks" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await within(await column("Not Started")).findByText(notStarted.name),
    ).toBeInTheDocument();
  });

  it("moves a task optimistically when its column changes in the dialog", async () => {
    let release: () => void = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    let patched: unknown = null;
    useBoard({ tasks: [notStarted] });
    server.use(
      http.patch(TASK_PATTERN, async ({ request }) => {
        patched = await request.json();
        await blocked;
        return HttpResponse.json({ ...notStarted, status: "IN_PROGRESS", version: 2 });
      }),
    );
    renderBoard();
    await within(await column("Not Started")).findByText(notStarted.name);

    const dialog = await openTask(notStarted.name);
    expect(within(dialog).getByLabelText("Task name")).toHaveValue(notStarted.name);
    await choosePill(dialog, "Status", "In Progress");
    fireEvent.click(within(dialog).getByRole("button", { name: /Save changes/ }));

    // The optimistic edit is visible before the request settles.
    expect(
      await within(await column("In Progress")).findByText(notStarted.name),
    ).toBeInTheDocument();
    expect(
      within(await column("Not Started")).queryByText(notStarted.name),
    ).not.toBeInTheDocument();

    release();
    const toast = await screen.findByText(`Moved “${notStarted.name}” to In Progress.`);
    // The confirmation floats outside the board's own layout, so the columns never move.
    expect(toast.closest("main")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(
      screen.queryByText(`Moved “${notStarted.name}” to In Progress.`),
    ).not.toBeInTheDocument();
    expect(patched).toEqual({
      name: notStarted.name,
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      assigneeId: null,
      reporterId: notStarted.reporter.id,
      dueDate: null,
      version: 1,
    });
  });

  it("rolls a rejected move back and surfaces the conflict in the dialog", async () => {
    useBoard({ tasks: [notStarted] });
    server.use(
      http.patch(TASK_PATTERN, () =>
        HttpResponse.json(
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
        ),
      ),
    );
    renderBoard();
    await within(await column("Not Started")).findByText(notStarted.name);

    const dialog = await openTask(notStarted.name);
    await choosePill(dialog, "Status", "Completed");
    fireEvent.click(within(dialog).getByRole("button", { name: /Save changes/ }));

    expect(
      await within(dialog).findByText(/Someone else changed this task first/),
    ).toBeInTheDocument();
    expect(within(await column("Not Started")).getByText(notStarted.name)).toBeInTheDocument();
    expect(within(await column("Completed")).queryByText(notStarted.name)).not.toBeInTheDocument();
  });

  it("deletes a task from its dialog and keeps it when the request fails", async () => {
    let deletedUrl: string | null = null;
    useBoard({ tasks: [notStarted] });
    server.use(
      http.delete(TASK_PATTERN, ({ request }) => {
        const url = new URL(request.url);
        deletedUrl = `${url.pathname}${url.search}`;
        return HttpResponse.error();
      }),
    );
    renderBoard();
    await within(await column("Not Started")).findByText(notStarted.name);

    const editDialog = await openTask(notStarted.name);
    fireEvent.click(within(editDialog).getByRole("button", { name: "Delete task" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/cannot be undone/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(within(confirm).getByRole("button", { name: "Delete task" }));
    expect(await within(confirm).findByText(/Your change was not saved/)).toBeInTheDocument();
    expect(deletedUrl).toBe(`/api/v1/tasks/${notStarted.id}?version=1`);

    fireEvent.click(within(confirm).getByRole("button", { name: "Keep task" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(within(await column("Not Started")).getByText(notStarted.name)).toBeInTheDocument();
  });

  it("removes a confirmed deletion and announces it", async () => {
    let stored: readonly Task[] = [notStarted];
    useBoard({ tasks: [notStarted] });
    server.use(
      http.get(TASKS_PATH, () => HttpResponse.json({ items: stored, nextCursor: null })),
      http.delete(TASK_PATTERN, () => {
        stored = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderBoard();
    await within(await column("Not Started")).findByText(notStarted.name);

    const editDialog = await openTask(notStarted.name);
    fireEvent.click(within(editDialog).getByRole("button", { name: "Delete task" }));
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete task" }));

    expect(await screen.findByText(`Deleted “${notStarted.name}”.`)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(notStarted.name)).not.toBeInTheDocument());
  });

  it("closes the edit dialog with Escape and returns focus to the card", async () => {
    useBoard({ tasks: [notStarted] });
    renderBoard();
    await within(await column("Not Started")).findByText(notStarted.name);

    const dialog = await openTask(notStarted.name);
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(taskButton(notStarted.name)).toHaveFocus());
  });

  it("sends the selected priority filter to the API and reflects the filtered results", async () => {
    let lastQuery = "";
    server.use(
      http.get(BOARD_PATH, () => HttpResponse.json(buildBoard())),
      http.get(MEMBERS_PATH, () => HttpResponse.json({ items: [buildMember()], nextCursor: null })),
      http.get(TASKS_PATH, ({ request }) => {
        const url = new URL(request.url);
        lastQuery = url.search;
        const priority = url.searchParams.get("priority");
        const items = priority === "HIGH" ? [] : [notStarted, completed];
        return HttpResponse.json({ items, nextCursor: null });
      }),
    );
    renderBoard();
    await within(await column("Not Started")).findByText(notStarted.name);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by priority" }), "HIGH");

    await waitFor(() => expect(lastQuery).toContain("priority=HIGH"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by priority" }), "");
    expect(
      await within(await column("Not Started")).findByText(notStarted.name),
    ).toBeInTheDocument();
  });

  it("cancels a stale search so an earlier response never overwrites a later one", async () => {
    server.use(
      http.get(BOARD_PATH, () => HttpResponse.json(buildBoard())),
      http.get(MEMBERS_PATH, () => HttpResponse.json({ items: [buildMember()], nextCursor: null })),
      http.get(TASKS_PATH, async ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get("q");
        if (q === "map") {
          await new Promise((resolve) => window.setTimeout(resolve, 300));
          return HttpResponse.json({ items: [completed], nextCursor: null });
        }
        if (q === "curate") return HttpResponse.json({ items: [notStarted], nextCursor: null });
        return HttpResponse.json({ items: [notStarted, completed], nextCursor: null });
      }),
    );
    renderBoard();
    await within(await column("Not Started")).findByText(notStarted.name);

    const user = userEvent.setup({ delay: null });
    const search = screen.getByRole("searchbox", { name: "Search tasks" });
    await user.type(search, "map");
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    await user.clear(search);
    await user.type(search, "curate");
    await waitFor(() => expect(search).toHaveValue("curate"), { timeout: 1000 });
    await new Promise((resolve) => window.setTimeout(resolve, 350));

    expect(
      await within(await column("Not Started")).findByText(notStarted.name),
    ).toBeInTheDocument();
    expect(within(await column("Completed")).queryByText(completed.name)).not.toBeInTheDocument();

    // The stale "map" response resolves later; it must not replace the "curate" results.
    expect(within(await column("Not Started")).getByText(notStarted.name)).toBeInTheDocument();
    expect(within(await column("Completed")).queryByText(completed.name)).not.toBeInTheDocument();
  });

  it("shows the Archived column only when toggled, and archives/restores through the modal", async () => {
    const archivedTask = buildTask({
      id: "01900000-0000-7000-8000-000000000403",
      sequence: 3,
      name: "Old booth plan",
      status: "ARCHIVED",
    });
    const byId = new Map<string, Task>([
      [notStarted.id, notStarted],
      [archivedTask.id, archivedTask],
    ]);
    server.use(
      http.get(BOARD_PATH, () => HttpResponse.json(buildBoard())),
      http.get(MEMBERS_PATH, () => HttpResponse.json({ items: [buildMember()], nextCursor: null })),
      http.get(TASKS_PATH, ({ request }) => {
        const url = new URL(request.url);
        const includeArchived = url.searchParams.get("includeArchived") === "true";
        const items = [...byId.values()].filter(
          (item) => includeArchived || item.status !== "ARCHIVED",
        );
        return HttpResponse.json({ items, nextCursor: null });
      }),
      http.patch(TASK_PATTERN, async ({ request, params }) => {
        const taskId = String(params.taskId);
        const existing = byId.get(taskId);
        if (!existing) return new HttpResponse(null, { status: 404 });
        const body = (await request.json()) as { status: Task["status"] };
        const updated = { ...existing, status: body.status, version: existing.version + 1 };
        byId.set(taskId, updated);
        return HttpResponse.json(updated);
      }),
    );
    renderBoard();
    await within(await column("Not Started")).findByText(notStarted.name);
    expect(screen.queryByRole("heading", { level: 2, name: "Archived" })).not.toBeInTheDocument();

    const dialog = await openTask(notStarted.name);
    fireEvent.click(within(dialog).getByRole("button", { name: "Archive task" }));

    expect(await screen.findByText(`Archived \u201c${notStarted.name}\u201d.`)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Show archived" }));
    const archivedColumn = await column("Archived");
    expect(await within(archivedColumn).findByText(archivedTask.name)).toBeInTheDocument();

    fireEvent.click(within(archivedColumn).getByRole("button", { name: archivedTask.name }));
    const editDialog = await screen.findByRole("dialog", {}, { timeout: 2000 });
    await choosePill(editDialog, "Status", "In Progress");
    fireEvent.click(within(editDialog).getByRole("button", { name: /Save changes/ }));

    expect(
      await screen.findByText(`Restored \u201c${archivedTask.name}\u201d to In Progress.`),
    ).toBeInTheDocument();
  });
});
