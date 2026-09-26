import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequireSession } from "../../app/RequireSession";
import { ada } from "../../test/fixtures";
import { Route, renderRoutes } from "../../test/renderWithProviders";
import { AppShell } from "./AppShell";

const mocks = vi.hoisted(() => ({ useSession: vi.fn(), signOut: vi.fn() }));

vi.mock("../../features/auth/authClient", () => ({
  authClient: {
    useSession: mocks.useSession,
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: mocks.signOut,
  },
}));

function renderShell() {
  return renderRoutes(
    <>
      <Route
        path="/boards"
        element={
          <RequireSession>
            <AppShell>
              <p>Shell content</p>
            </AppShell>
          </RequireSession>
        }
      />
      <Route path="/login" element={<p>Login destination</p>} />
    </>,
    { route: "/boards" },
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockImplementation(() => ({
      data: { user: ada },
      error: undefined,
      isPending: false,
    }));
    mocks.signOut.mockResolvedValue({ error: null, session: null });
  });

  it("renders the editorial header with an inert deferred control", () => {
    renderShell();

    expect(screen.getByRole("link", { name: /Ksat/ })).toHaveAttribute("href", "/boards");
    expect(screen.getByRole("link", { name: "Boards" })).toBeInTheDocument();
    expect(screen.getByText("My Tasks")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: /New Task/ })).toBeDisabled();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });

  it("opens the account menu with the keyboard and signs out with the cache cleared", async () => {
    const { queryClient } = renderShell();
    const trigger = screen.getByRole("button", { name: /Account menu for Ada Lovelace/ });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).not.toHaveAttribute("aria-haspopup");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByText("ada@example.test")).toBeInTheDocument();

    const signOut = screen.getByRole("button", { name: "Sign out" });
    signOut.focus();
    expect(signOut).toHaveFocus();

    fireEvent.click(signOut);

    expect(await screen.findByText("Login destination")).toBeInTheDocument();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("closes the account menu with Escape and returns focus", () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: /Account menu for Ada Lovelace/ });

    fireEvent.click(trigger);
    expect(screen.getByText("ada@example.test")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
