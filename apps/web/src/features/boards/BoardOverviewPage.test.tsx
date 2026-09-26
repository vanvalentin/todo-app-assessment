import { http, HttpResponse } from "msw";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOARD_ID, ada, buildBoard } from "../../test/fixtures";
import { Route, renderRoutes } from "../../test/renderWithProviders";
import { server } from "../../test/server";
import { queryKeys } from "../../lib/api/queryKeys";
import { BoardOverviewPage } from "./BoardOverviewPage";

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

function useBoard(role: "ADMIN" | "MANAGER" | "CONTRIBUTOR" = "ADMIN") {
  server.use(http.get(BOARD_PATH, () => HttpResponse.json(buildBoard({ role }))));
}

function renderBoard() {
  return renderRoutes(<Route path="/boards/:boardId/settings" element={<BoardOverviewPage />} />, {
    route: `/boards/${BOARD_ID}/settings`,
  });
}

function openEditor() {
  fireEvent.click(screen.getByRole("button", { name: "Edit board" }));
  return {
    name: screen.getByLabelText("Board name"),
    description: screen.getByLabelText("Description"),
    save: screen.getByRole("button", { name: "Save changes" }),
  };
}

describe("BoardOverviewPage board editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ data: { user: ada }, error: undefined, isPending: false });
  });

  it("shows editing only to admins", async () => {
    useBoard("ADMIN");
    const first = renderBoard();
    expect(await screen.findByRole("button", { name: "Edit board" })).toBeInTheDocument();

    first.unmount();
    useBoard("MANAGER");
    renderBoard();
    expect(
      await screen.findByRole("heading", { name: "Tokyo Zine Fair 2027" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit board" })).not.toBeInTheDocument();
  });

  it("validates fields and cancels without sending a mutation", async () => {
    let patchRequests = 0;
    useBoard("ADMIN");
    server.use(
      http.patch(BOARD_PATH, () => {
        patchRequests += 1;
        return HttpResponse.json(buildBoard({ name: "Should not save", version: 2 }));
      }),
    );
    renderBoard();
    expect(await screen.findByRole("button", { name: "Edit board" })).toBeInTheDocument();
    const form = openEditor();
    fireEvent.change(form.name, { target: { value: "   " } });
    fireEvent.click(form.save);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.change(form.name, { target: { value: "Draft name" } });
    const editButton = screen.getByRole("button", { name: "Edit board" });
    expect(editButton).toHaveAttribute("aria-expanded", "true");
    expect(form.name).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("edit-board-help"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Edit board" })).not.toBeInTheDocument();
    await waitFor(() => expect(editButton).toHaveFocus());
    expect(editButton).toHaveAttribute("aria-expanded", "false");
    expect(patchRequests).toBe(0);
  });

  it("saves, announces success, and updates the board detail cache and header", async () => {
    useBoard("ADMIN");
    const updated = buildBoard({
      name: "Renamed board",
      description: "New description",
      version: 2,
    });
    let submitted: unknown;
    server.use(
      http.patch(BOARD_PATH, async ({ request }) => {
        submitted = await request.json();
        return HttpResponse.json(updated);
      }),
    );
    const rendered = renderBoard();
    expect(await screen.findByRole("button", { name: "Edit board" })).toBeInTheDocument();
    const form = openEditor();
    fireEvent.change(form.name, { target: { value: "  Renamed board  " } });
    fireEvent.change(form.description, { target: { value: "New description" } });
    fireEvent.click(form.save);
    expect(await screen.findByRole("status")).toHaveTextContent("Board details saved.");
    expect(await screen.findByRole("heading", { name: "Renamed board" })).toBeInTheDocument();
    expect(submitted).toEqual({
      name: "Renamed board",
      description: "New description",
      version: 1,
    });
    expect(rendered.queryClient.getQueryData(queryKeys.board(BOARD_ID))).toEqual(updated);
  });

  it("disables the form while saving and announces API errors", async () => {
    useBoard("ADMIN");
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.patch(BOARD_PATH, async () => {
        await pending;
        return HttpResponse.json(buildBoard({ name: "Saved", version: 2 }));
      }),
    );
    renderBoard();
    expect(await screen.findByRole("button", { name: "Edit board" })).toBeInTheDocument();
    const form = openEditor();
    fireEvent.click(form.save);
    await waitFor(() => expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled());
    expect(form.name).toBeDisabled();
    release?.();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Board details saved."),
    );
    server.use(
      http.patch(BOARD_PATH, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Forbidden",
            status: 403,
            code: "BOARD_ADMIN_REQUIRED",
            requestId: "req-1",
          },
          { status: 403 },
        ),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("don’t have permission");
  });

  it("refetches the latest board after a version conflict", async () => {
    let reads = 0;
    useBoard("ADMIN");
    server.use(
      http.get(BOARD_PATH, () => {
        reads += 1;
        return HttpResponse.json(
          reads === 1 ? buildBoard() : buildBoard({ name: "Latest board", version: 2 }),
        );
      }),
      http.patch(BOARD_PATH, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            code: "BOARD_VERSION_CONFLICT",
            requestId: "req-2",
          },
          { status: 409 },
        ),
      ),
    );
    renderBoard();
    expect(await screen.findByRole("button", { name: "Edit board" })).toBeInTheDocument();
    const form = openEditor();
    fireEvent.change(form.name, { target: { value: "Outdated edit" } });
    fireEvent.click(form.save);
    expect(await screen.findByRole("alert")).toHaveTextContent("changed while you were editing");
    expect(await screen.findByDisplayValue("Latest board")).toBeInTheDocument();
    expect(reads).toBeGreaterThan(1);
  });
});
