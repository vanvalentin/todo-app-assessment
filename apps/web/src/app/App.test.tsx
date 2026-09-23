import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("web foundation placeholder", () => {
  it("renders an accessible, clearly scoped starting point", () => {
    render(<App />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ksat home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("heading", { level: 1, name: /calm foundation/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Web foundation is ready");
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute(
      "href",
      "#main-content",
    );
  });
});
