import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthScreen } from "./AuthScreen";

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("./authClient", () => ({
  authClient: {
    useSession: mocks.useSession,
    signIn: { email: mocks.signIn },
    signOut: mocks.signOut,
    signUp: { email: mocks.signUp },
  },
}));

const signedInSession = {
  user: {
    id: "user-1",
    name: "Ada Lovelace",
    email: "ada@example.test",
    image: null,
    avatarSeed: "ada-seed",
  },
};

function fillSignUpForm() {
  fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Ada Lovelace" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: " ADA@EXAMPLE.TEST " } });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "a secure password" },
  });
}

function fillSignInForm() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.test" } });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "a secure password" },
  });
}

function renderLogin(route = "/login") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/login" element={<AuthScreen />} />
          <Route path="/boards" element={<p>Boards destination</p>} />
          <Route path="/boards/:boardId/members" element={<p>Members destination</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AuthScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ data: null, error: undefined, isPending: false });
    mocks.signUp.mockResolvedValue({ error: null, session: signedInSession });
    mocks.signIn.mockResolvedValue({ error: null, session: signedInSession });
    mocks.signOut.mockResolvedValue({ error: null, session: null });
  });

  it("renders the signup mode and switches to login", () => {
    renderLogin();

    expect(screen.getByRole("heading", { name: "Welcome to the Collective" })).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Log in" }));

    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("preselects login when the login mode is requested", () => {
    renderLogin("/login?mode=sign-in&redirect=%2Fboards");

    expect(screen.getByRole("radio", { name: "Log in" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
  });

  it("moves between modes with arrow keys and exposes a radiogroup", () => {
    renderLogin();
    const group = screen.getByRole("radiogroup", { name: "Account access" });

    expect(screen.getByRole("radio", { name: "Create account" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Create account" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Log in" })).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(group, { key: "ArrowRight" });

    expect(screen.getByRole("radio", { name: "Log in" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Log in" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Create account" })).toHaveAttribute("tabindex", "-1");
  });

  it("shows validation messages for incomplete signup details", async () => {
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Use at least 12 characters.")).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("disables the form while a request is pending", async () => {
    let resolveRequest: (value: { error: null; session: typeof signedInSession }) => void = () =>
      undefined;
    mocks.signUp.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    renderLogin();
    fillSignUpForm();

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled());
    resolveRequest({ error: null, session: signedInSession });
  });

  it("maps an auth failure to a safe, mode-specific message", async () => {
    mocks.signIn.mockResolvedValue({
      error: { code: "INVALID_CREDENTIALS", status: 401 },
      session: null,
    });
    renderLogin();
    fireEvent.click(screen.getByRole("radio", { name: "Log in" }));
    fillSignInForm();

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't sign you in.");
  });

  it("shows a safe retry message when the auth service is unreachable", async () => {
    mocks.signIn.mockRejectedValue(new Error("internal network details"));
    renderLogin();
    fireEvent.click(screen.getByRole("radio", { name: "Log in" }));
    fillSignInForm();

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't reach Ksat");
    expect(screen.getByRole("alert")).not.toHaveTextContent("internal network details");
  });

  it("redirects to the boards list after a successful signup", async () => {
    renderLogin();
    fillSignUpForm();

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Boards destination")).toBeInTheDocument();
    expect(mocks.signUp).toHaveBeenCalledWith({
      name: "Ada Lovelace",
      email: "ada@example.test",
      password: "a secure password",
    });
  });

  it("returns to the requested destination after signing in", async () => {
    renderLogin("/login?mode=sign-in&redirect=%2Fboards%2Fboard-1%2Fmembers");
    fillSignInForm();

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Members destination")).toBeInTheDocument();
  });

  it.each([
    ["an external URL", "https%3A%2F%2Fevil.test"],
    ["a backslash path", "%2F%5Cevil.test"],
    ["an encoded external path", "%2F%252Fevil.test"],
    ["the login route itself", "%2Flogin"],
  ])("falls back to boards for %s", async (_label, redirect) => {
    renderLogin(`/login?mode=sign-in&redirect=${redirect}`);
    fillSignInForm();

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Boards destination")).toBeInTheDocument();
  });

  it("toggles password visibility with a pressed state", () => {
    renderLogin();
    const password = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });

    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(toggle);

    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("redirects a restored session instead of rendering the sign-in form", async () => {
    mocks.useSession.mockReturnValue({ data: signedInSession, error: undefined, isPending: false });

    renderLogin();

    expect(await screen.findByText("Boards destination")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Welcome to the Collective" }),
    ).not.toBeInTheDocument();
  });

  it("renders a deliberate session restoration state", () => {
    mocks.useSession.mockReturnValue({ data: undefined, error: undefined, isPending: true });

    renderLogin();

    expect(screen.getByRole("status")).toHaveTextContent("Restoring your session");
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
  });
});
