import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("../features/auth/authClient", () => ({
  authClient: {
    useSession: () => ({ data: null, error: undefined, isPending: false }),
    signIn: { email: vi.fn() },
    signOut: vi.fn(),
    signUp: { email: vi.fn() },
  },
}));

describe("App", () => {
  it("renders the identity entry point", () => {
    render(<App />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Welcome to the Collective" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Create account" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
