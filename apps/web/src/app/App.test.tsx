import { http, HttpResponse } from "msw";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { BOARD_ID, ada, buildBoard } from "../test/fixtures";
import { server } from "../test/server";

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
  session: { current: null as { user: unknown } | null },
}));

vi.mock("../features/auth/authClient", () => ({
  authClient: {
    useSession: mocks.useSession,
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: mocks.signOut,
  },
}));

function useBoards() {
  server.use(
    http.get("/api/v1/boards", () =>
      HttpResponse.json({ items: [buildBoard()], nextCursor: null }),
    ),
    http.get(`/api/v1/boards/${BOARD_ID}`, () => HttpResponse.json(buildBoard())),
  );
}

describe("App routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.current = null;
    mocks.useSession.mockImplementation(() => ({
      data: mocks.session.current,
      error: undefined,
      isPending: false,
    }));
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("forwards the workspace root to the boards list", async () => {
    mocks.session.current = { user: ada };
    useBoards();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Boards" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/boards");
  });

  it("sends anonymous visitors to the login screen with a redirect target", async () => {
    window.history.pushState({}, "", `/boards/${BOARD_ID}/members`);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Welcome to the Collective" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(window.location.search).toBe(
      `?redirect=${encodeURIComponent(`/boards/${BOARD_ID}/members`)}`,
    );
  });

  it("keeps a restored session on the protected page", async () => {
    mocks.session.current = { user: ada };
    useBoards();
    window.history.pushState({}, "", "/boards");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Boards" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/boards");
  });

  it("renders a deliberate gate while the session is restored", () => {
    mocks.useSession.mockReturnValue({ data: undefined, error: undefined, isPending: true });
    window.history.pushState({}, "", "/boards");

    render(<App />);

    expect(screen.getByText("Restoring your session…")).toBeInTheDocument();
  });

  it("routes a board to the Kanban board and keeps board settings separate", async () => {
    mocks.session.current = { user: ada };
    server.use(
      http.get("/api/v1/boards", () =>
        HttpResponse.json({ items: [buildBoard()], nextCursor: null }),
      ),
      http.get(`/api/v1/boards/${BOARD_ID}`, () => HttpResponse.json(buildBoard())),
      http.get(`/api/v1/boards/${BOARD_ID}/tasks`, () =>
        HttpResponse.json({ items: [], nextCursor: null }),
      ),
    );

    window.history.pushState({}, "", `/boards/${BOARD_ID}`);
    const board = render(<App />);
    expect(
      await screen.findByRole("heading", { level: 2, name: "Not Started" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New Task" })).toHaveLength(2);
    board.unmount();

    window.history.pushState({}, "", `/boards/${BOARD_ID}/settings`);
    render(<App />);
    expect(await screen.findByText("[ board settings ]")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open task board" })).toHaveAttribute(
      "href",
      `/boards/${BOARD_ID}`,
    );
  });

  it("renders a not-found page for unknown routes", () => {
    window.history.pushState({}, "", "/nope");

    render(<App />);

    expect(screen.getByRole("heading", { name: "We couldn’t find that page" })).toBeInTheDocument();
  });
});
