import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("AuthScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ data: null, error: undefined, isPending: false });
    mocks.signUp.mockResolvedValue({ error: null, session: signedInSession });
    mocks.signIn.mockResolvedValue({ error: null, session: signedInSession });
    mocks.signOut.mockResolvedValue({ error: null, session: null });
  });

  it("renders the signup mode and switches to login", () => {
    render(<AuthScreen />);

    expect(screen.getByRole("heading", { name: "Welcome to the Collective" })).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Log in" }));

    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("moves between modes with arrow keys and exposes a radiogroup", () => {
    render(<AuthScreen />);
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
    render(<AuthScreen />);

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
    render(<AuthScreen />);
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
    render(<AuthScreen />);
    fireEvent.click(screen.getByRole("radio", { name: "Log in" }));
    fillSignInForm();

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't sign you in.");
  });

  it("shows a safe retry message when the auth service is unreachable", async () => {
    mocks.signIn.mockRejectedValue(new Error("internal network details"));
    render(<AuthScreen />);
    fireEvent.click(screen.getByRole("radio", { name: "Log in" }));
    fillSignInForm();

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't reach Ksat");
    expect(screen.getByRole("alert")).not.toHaveTextContent("internal network details");
  });

  it("shows the authenticated identity after a successful signup", async () => {
    render(<AuthScreen />);
    fillSignUpForm();

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByRole("heading", { name: "Welcome, Ada Lovelace." }),
    ).toBeInTheDocument();
    expect(mocks.signUp).toHaveBeenCalledWith({
      name: "Ada Lovelace",
      email: "ada@example.test",
      password: "a secure password",
    });
    expect(screen.getByText("ada@example.test")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Ada Lovelace's generated avatar" }),
    ).toBeInTheDocument();
  });

  it("toggles password visibility with a pressed state", () => {
    render(<AuthScreen />);
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

  it("restores an existing session and signs out", async () => {
    mocks.useSession.mockReturnValue({ data: signedInSession, error: undefined, isPending: false });
    render(<AuthScreen />);

    expect(screen.getByRole("heading", { name: "Welcome, Ada Lovelace." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByRole("heading", { name: "Welcome to the Collective" }),
    ).toBeInTheDocument();
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it("renders a deliberate session restoration state", () => {
    mocks.useSession.mockReturnValue({ data: undefined, error: undefined, isPending: true });
    render(<AuthScreen />);

    expect(screen.getByRole("status")).toHaveTextContent("Restoring your session");
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
  });
});
