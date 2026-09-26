import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";

const DISMISS = "Dismiss notification";

describe("Toast", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the confirmation outside the page's own layout in a polite live region", () => {
    render(
      <div data-testid="board">
        <Toast message="Moved “Curate prints” to Completed." onDismiss={vi.fn()} tone="success" />
      </div>,
    );

    const message = screen.getByText("Moved “Curate prints” to Completed.");
    expect(message.closest("[data-testid='board']")).toBeNull();
    expect(screen.getByRole("status")).toContainElement(message);
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("keeps both live regions mounted while showing nothing", () => {
    render(<Toast message="" onDismiss={vi.fn()} tone="success" />);

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: DISMISS })).not.toBeInTheDocument();
  });

  it("auto-dismisses a confirmation after five seconds", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="Deleted “Curate prints”." onDismiss={onDismiss} tone="success" />);

    act(() => vi.advanceTimersByTime(4_999));
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("holds the countdown while the reader hovers it, then resumes", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="Saved “Curate prints”." onDismiss={onDismiss} tone="success" />);

    const toast = screen.getByRole("status").firstElementChild;
    if (toast === null) throw new Error("no toast element");

    act(() => vi.advanceTimersByTime(2_000));
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(10_000));
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(2_999));
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("keeps a rejection on screen in an assertive region until it is dismissed", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="Your change was not saved." onDismiss={onDismiss} tone="error" />);

    act(() => vi.advanceTimersByTime(60_000));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Your change was not saved.");

    fireEvent.click(screen.getByRole("button", { name: DISMISS }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
