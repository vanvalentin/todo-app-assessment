import { http, HttpResponse } from "msw";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOARD_ID, USER_IDS, ada, buildBoard } from "../../test/fixtures";
import { Route, renderRoutes, renderWithProviders } from "../../test/renderWithProviders";
import { server } from "../../test/server";
import { BoardsPage } from "./BoardsPage";

const mocks = vi.hoisted(() => ({ useSession: vi.fn(), signOut: vi.fn() }));

vi.mock("../../features/auth/authClient", () => ({
  authClient: {
    useSession: mocks.useSession,
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: mocks.signOut,
  },
}));

const BOARDS_PATH = "/api/v1/boards";

function signedInAsAda() {
  mocks.useSession.mockReturnValue({ data: { user: ada }, error: undefined, isPending: false });
}

describe("BoardsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAda();
  });

  it("shows a deliberate loading state before the boards arrive", async () => {
    server.use(
      http.get(BOARDS_PATH, () => HttpResponse.json({ items: [buildBoard()], nextCursor: null })),
    );

    renderWithProviders(<BoardsPage />);

    expect(screen.getByText("Loading boards…")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Tokyo Zine Fair 2027" }),
    ).toBeInTheDocument();
  });

  it("renders each board with its role, owner, member preview and links", async () => {
    server.use(
      http.get(BOARDS_PATH, () =>
        HttpResponse.json({
          items: [buildBoard({ memberCount: 5 })],
          nextCursor: null,
        }),
      ),
    );

    renderWithProviders(<BoardsPage />);

    // The chip keeps the role readable without relying on its colour.
    expect(await screen.findByText("Admin")).toHaveTextContent("Role: Admin");
    expect(screen.getByRole("link", { name: "Tokyo Zine Fair 2027" })).toHaveAttribute(
      "href",
      `/boards/${BOARD_ID}`,
    );
    expect(
      screen.getByRole("link", { name: "Members and access for Tokyo Zine Fair 2027" }),
    ).toHaveAttribute("href", `/boards/${BOARD_ID}/members`);
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
    expect(screen.getByText("by Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Open Board/ })).toHaveLength(1);
  });

  it("creates a board from the empty state and navigates to it", async () => {
    let submitted: unknown;
    server.use(
      http.get(BOARDS_PATH, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.post(BOARDS_PATH, async ({ request }) => {
        submitted = await request.json();
        return HttpResponse.json(buildBoard({ name: "Release planning", description: null }), {
          status: 201,
        });
      }),
    );

    renderRoutes(
      <>
        <Route path="/boards" element={<BoardsPage />} />
        <Route path="/boards/:boardId" element={<h1>Created board route</h1>} />
      </>,
      { route: "/boards" },
    );

    expect(await screen.findByText("Create your first board")).toBeInTheDocument();
    expect(screen.getByText(/ada@example.test/)).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: /Create a new board/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Create a board" })).toBeInTheDocument();
    expect(screen.getByLabelText("Board name")).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Create board" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Board name"), {
      target: { value: "  Release planning  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create board" }));

    expect(await screen.findByRole("heading", { name: "Created board route" })).toBeInTheDocument();
    expect(submitted).toEqual({ name: "Release planning", description: null });
  });

  it("supports cancellation with focus restoration and reports network failures", async () => {
    server.use(
      http.get(BOARDS_PATH, () => HttpResponse.json({ items: [buildBoard()], nextCursor: null })),
      http.post(BOARDS_PATH, () => HttpResponse.error()),
    );
    renderWithProviders(<BoardsPage />);

    const trigger = await screen.findByRole("button", { name: "Create New Board" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Create a board" });
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Create board" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText("Board name"), { target: { value: "New board" } });
    fireEvent.click(screen.getByRole("button", { name: "Create board" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn’t reach Ksat");
  });

  it("surfaces a load failure and retries on demand", async () => {
    let attempts = 0;
    server.use(
      http.get(BOARDS_PATH, () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json(
            {
              type: "about:blank",
              title: "Server error",
              status: 500,
              code: "INTERNAL_ERROR",
              requestId: "req-1",
            },
            { status: 500 },
          );
        }
        return HttpResponse.json({ items: [buildBoard()], nextCursor: null });
      }),
    );

    renderWithProviders(<BoardsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t load your boards");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Tokyo Zine Fair 2027" })).toBeInTheDocument(),
    );
    expect(attempts).toBe(2);
  });

  it("offers the next page when the API returns a cursor", async () => {
    server.use(
      http.get(BOARDS_PATH, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        return cursor === null
          ? HttpResponse.json({ items: [buildBoard()], nextCursor: "page-2" })
          : HttpResponse.json({
              items: [
                buildBoard({
                  id: "01900000-0000-7000-8000-000000000009",
                  name: "Studio Operations",
                  ownerId: USER_IDS.maya,
                  memberPreview: [],
                }),
              ],
              nextCursor: null,
            });
      }),
    );

    renderWithProviders(<BoardsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Load more boards" }));

    expect(await screen.findByRole("heading", { name: "Studio Operations" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more boards" })).not.toBeInTheDocument();
  });
});
