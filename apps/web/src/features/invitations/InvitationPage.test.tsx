import { http, HttpResponse } from "msw";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOARD_ID,
  INVITATION_TOKEN,
  ada,
  buildBoard,
  buildInvitationPreview,
  maya,
} from "../../test/fixtures";
import { Route, renderRoutes } from "../../test/renderWithProviders";
import { server } from "../../test/server";
import { InvitationPage } from "./InvitationPage";

const mocks = vi.hoisted(() => ({ useSession: vi.fn(), signOut: vi.fn() }));

vi.mock("../../features/auth/authClient", () => ({
  authClient: {
    useSession: mocks.useSession,
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: mocks.signOut,
  },
}));

const PREVIEW_PATH = `/api/v1/invitations/${INVITATION_TOKEN}`;
const ACCEPT_PATH = `${PREVIEW_PATH}/accept`;
const ROUTE = `/invitations/${INVITATION_TOKEN}`;

function usePreview() {
  server.use(http.get(PREVIEW_PATH, () => HttpResponse.json(buildInvitationPreview())));
}

function renderInvitationPage() {
  return renderRoutes(
    <>
      <Route path="/invitations/:token" element={<InvitationPage />} />
      <Route path="/boards/:boardId" element={<p>Board overview destination</p>} />
    </>,
    { route: ROUTE },
  );
}

describe("InvitationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ data: null, error: undefined, isPending: false });
  });

  it("previews the invitation for a signed-out visitor and offers sign in or sign up", async () => {
    usePreview();

    renderInvitationPage();

    expect(
      await screen.findByRole("heading", { name: "Tokyo Zine Fair 2027" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("maya@example.test").length).toBeGreaterThan(0);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in to accept" })).toHaveAttribute(
      "href",
      `/login?mode=sign-in&redirect=${encodeURIComponent(ROUTE)}`,
    );
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      `/login?mode=sign-up&redirect=${encodeURIComponent(ROUTE)}`,
    );
    expect(screen.queryByRole("button", { name: "Accept invitation" })).not.toBeInTheDocument();
  });

  it("refuses to accept an invitation for a different signed-in address", async () => {
    usePreview();
    mocks.useSession.mockReturnValue({ data: { user: ada }, error: undefined, isPending: false });

    renderInvitationPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This invitation was sent to maya@example.test",
    );
    expect(screen.queryByRole("button", { name: "Accept invitation" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use a different account" }));

    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it("surfaces a sign-out error without clearing the active session cache", async () => {
    usePreview();
    mocks.useSession.mockReturnValue({ data: { user: ada }, error: undefined, isPending: false });
    mocks.signOut.mockResolvedValue({
      error: { code: "SIGN_OUT_FAILED", status: 503 },
      session: null,
    });

    const { queryClient } = renderInvitationPage();
    queryClient.setQueryData(["identity-cache"], "keep-me");

    fireEvent.click(await screen.findByRole("button", { name: "Use a different account" }));

    expect(
      await screen.findByText("We couldn’t switch accounts. Please try again."),
    ).toBeInTheDocument();
    expect(queryClient.getQueryData(["identity-cache"])).toBe("keep-me");
    expect(screen.getByRole("button", { name: "Use a different account" })).toBeEnabled();
  });

  it("disables account switching while sign-out is pending", async () => {
    usePreview();
    mocks.useSession.mockReturnValue({ data: { user: ada }, error: undefined, isPending: false });
    let resolveSignOut:
      | ((value: { error: { code: string; status: number }; session: null }) => void)
      | undefined;
    mocks.signOut.mockReturnValue(
      new Promise((resolve) => {
        resolveSignOut = resolve;
      }),
    );

    const { queryClient } = renderInvitationPage();
    queryClient.setQueryData(["identity-cache"], "keep-me");
    const switchButton = await screen.findByRole("button", { name: "Use a different account" });

    fireEvent.click(switchButton);

    expect(await screen.findByRole("button", { name: "Switching accounts…" })).toBeDisabled();
    resolveSignOut?.({ error: { code: "SIGN_OUT_FAILED", status: 503 }, session: null });

    expect(
      await screen.findByText("We couldn’t switch accounts. Please try again."),
    ).toBeInTheDocument();
    expect(queryClient.getQueryData(["identity-cache"])).toBe("keep-me");
  });

  it("shows the switch-account failure after a rejected sign-out", async () => {
    usePreview();
    mocks.useSession.mockReturnValue({ data: { user: ada }, error: undefined, isPending: false });
    mocks.signOut.mockRejectedValue(new Error("network failure"));

    const { queryClient } = renderInvitationPage();
    queryClient.setQueryData(["identity-cache"], "keep-me");

    fireEvent.click(await screen.findByRole("button", { name: "Use a different account" }));

    expect(
      await screen.findByText("We couldn’t switch accounts. Please try again."),
    ).toBeInTheDocument();
    expect(queryClient.getQueryData(["identity-cache"])).toBe("keep-me");
    expect(screen.getByRole("button", { name: "Use a different account" })).toBeEnabled();
  });

  it("explains an expired invitation instead of offering a retry", async () => {
    server.use(
      http.get(PREVIEW_PATH, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Gone",
            status: 410,
            code: "INVITATION_EXPIRED",
            requestId: "req-3",
          },
          { status: 410 },
        ),
      ),
    );

    renderInvitationPage();

    expect(await screen.findByText("This invitation has expired")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("explains an unknown invitation token", async () => {
    server.use(
      http.get(PREVIEW_PATH, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Not found",
            status: 404,
            code: "INVITATION_NOT_FOUND",
            requestId: "req-4",
          },
          { status: 404 },
        ),
      ),
    );

    renderInvitationPage();

    expect(await screen.findByText("We couldn’t find this invitation")).toBeInTheDocument();
  });

  it("retries a transient preview failure", async () => {
    let attempts = 0;
    server.use(
      http.get(PREVIEW_PATH, () => {
        attempts += 1;
        if (attempts === 1) return HttpResponse.error();
        return HttpResponse.json(buildInvitationPreview());
      }),
    );

    renderInvitationPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t reach Ksat");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByRole("heading", { name: "Tokyo Zine Fair 2027" }),
    ).toBeInTheDocument();
  });

  it("accepts the invitation for the invited address and opens the board", async () => {
    usePreview();
    mocks.useSession.mockReturnValue({ data: { user: maya }, error: undefined, isPending: false });
    server.use(
      http.post(ACCEPT_PATH, () =>
        HttpResponse.json({
          boardId: BOARD_ID,
          boardName: buildBoard().name,
          role: "CONTRIBUTOR",
          joinedAt: "2027-02-22T09:00:00.000Z",
          alreadyMember: false,
        }),
      ),
    );

    renderInvitationPage();

    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));

    expect(await screen.findByText("Board overview destination")).toBeInTheDocument();
  });

  it("replaces a successful preview with the terminal state from a 410 accept", async () => {
    usePreview();
    mocks.useSession.mockReturnValue({ data: { user: maya }, error: undefined, isPending: false });
    server.use(
      http.post(ACCEPT_PATH, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Gone",
            status: 410,
            code: "INVITATION_REVOKED",
            requestId: "req-6",
          },
          { status: 410 },
        ),
      ),
    );

    renderInvitationPage();

    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));

    expect(await screen.findByText("This invitation was revoked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept invitation" })).not.toBeInTheDocument();
  });

  it("reports an acceptance failure without losing the invitation details", async () => {
    usePreview();
    mocks.useSession.mockReturnValue({ data: { user: maya }, error: undefined, isPending: false });
    server.use(
      http.post(ACCEPT_PATH, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Too many requests",
            status: 429,
            code: "RATE_LIMITED",
            requestId: "req-5",
          },
          { status: 429 },
        ),
      ),
    );

    renderInvitationPage();

    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
    expect(screen.getByRole("heading", { name: "Tokyo Zine Fair 2027" })).toBeInTheDocument();
  });
});
