import { http, HttpResponse } from "msw";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@ksat/contracts";
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
  );
}

function renderBoard() {
  return renderRoutes(<Route path="/boards/:boardId" element={<TaskBoardPage />} />, {
    route: `/boards/${BOARD_ID}`,
  });
}
/** Resolves once the column exists, so scoped queries do not race the first load. */
async function column(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { level: 2, name });
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

describe("TaskBoardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ data: { user: ada }, error: undefined, isPending: false });
  });

  it("renders the Figma columns with domain labels and inert deferred controls", async () => {
    useBoard();
    renderBoard();

    expect(
      await screen.findByRole("heading", { name: "Tokyo Zine Fair 2027" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Not Started" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "In Progress" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Completed" })).toBeInTheDocument();
    expect(screen.getByText("STAGE 01")).toBeInTheDocument();
    expect(screen.getByText("STAGE 02")).toBeInTheDocument();
    expect(screen.getByText("DONE")).toBeInTheDocument();

    expect(screen.getByRole("searchbox", { name: "Search tasks" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Assignee: All" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Priority: All" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Sort: Due date" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled();

    // The board header links to the settings screen as a labelled control.
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      `/boards/${BOARD_ID}/settings`,
    );

    expect(within(await column("Not Started")).getByText("Medium Priority")).toBeInTheDocument();
    expect(
      within(await column("Completed")).getByText("Map local cafe workspace network"),
    ).toBeInTheDocument();
    expect(
      within(await column("Completed")).getByText("Completed", { selector: "span" }),
    ).toBeInTheDocument();

    // Cards carry no overflow menu; the card itself opens the task dialog.
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Task actions for/ })).not.toBeInTheDocument();

    // Later-phase card metadata must not be invented.
    expect(screen.queryByText(/Depends on/)).not.toBeInTheDocument();
    expect(screen.queryByText(/attachments/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cadence:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Apr /)).not.toBeInTheDocument();
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
    fireEvent.change(within(dialog).getByLabelText("Column"), { target: { value: "IN_PROGRESS" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save task" }));

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
    fireEvent.change(within(dialog).getByLabelText("Column"), { target: { value: "COMPLETED" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save task" }));

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
});
