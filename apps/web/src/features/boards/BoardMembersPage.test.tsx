import type { BoardRole } from "@ksat/contracts";
import { http, HttpResponse } from "msw";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOARD_ID,
  USER_IDS,
  ada,
  buildBoard,
  buildMember,
  buildPendingInvitation,
} from "../../test/fixtures";
import { Route, renderRoutes } from "../../test/renderWithProviders";
import { server } from "../../test/server";
import { BoardMembersPage } from "./BoardMembersPage";

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
const MEMBERS_PATH = `${BOARD_PATH}/members`;
const INVITATIONS_PATH = `${BOARD_PATH}/invitations`;
const ROSTER = [
  buildMember({
    userId: USER_IDS.ada,
    role: "ADMIN",
    user: {
      id: USER_IDS.ada,
      name: "Ada Lovelace",
      avatarSeed: "ada-seed",
      email: "ada@example.test",
    },
  }),
  buildMember({
    userId: USER_IDS.grace,
    role: "MANAGER",
    user: {
      id: USER_IDS.grace,
      name: "Grace Hopper",
      avatarSeed: "grace-seed",
      email: "grace@example.test",
    },
  }),
  buildMember({
    userId: USER_IDS.linus,
    role: "CONTRIBUTOR",
    user: {
      id: USER_IDS.linus,
      name: "Linus Torvalds",
      avatarSeed: "linus-seed",
      email: "linus@example.test",
    },
  }),
];

function useBoard(role: BoardRole) {
  server.use(
    http.get(BOARD_PATH, () => HttpResponse.json(buildBoard({ role, memberCount: ROSTER.length }))),
  );
}

function useRoster() {
  server.use(http.get(MEMBERS_PATH, () => HttpResponse.json({ items: ROSTER, nextCursor: null })));
}

function usePendingInvitations(items = [buildPendingInvitation()]) {
  server.use(http.get(INVITATIONS_PATH, () => HttpResponse.json({ items, nextCursor: null })));
}

function createdInvitation(email: string, emailDelivery: "SENT" | "FAILED" = "SENT") {
  return {
    id: "01900000-0000-7000-8000-000000000301",
    boardId: BOARD_ID,
    email,
    role: "CONTRIBUTOR",
    invitedById: USER_IDS.ada,
    expiresAt: "2027-03-01T09:00:00.000Z",
    createdAt: "2027-02-22T09:00:00.000Z",
    emailDelivery,
  };
}

function renderMembersPage(route: string = `/boards/${BOARD_ID}/members`) {
  return renderRoutes(
    <>
      <Route path="/boards/:boardId" element={<p>Board overview destination</p>} />
      <Route path="/boards/:boardId/members" element={<BoardMembersPage />} />
    </>,
    { route },
  );
}

async function inviteForm() {
  return {
    email: await screen.findByLabelText("Email address"),
    role: await screen.findByLabelText("Assigned role"),
    submit: await screen.findByRole("button", { name: /Send Invite/ }),
  };
}

describe("BoardMembersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ data: { user: ada }, error: undefined, isPending: false });
  });

  it("shows contributors the roster without any invitation capability", async () => {
    let invitationRequests = 0;
    useBoard("CONTRIBUTOR");
    useRoster();
    server.use(
      http.get(INVITATIONS_PATH, () => {
        invitationRequests += 1;
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );

    renderMembersPage();

    expect(await screen.findByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Invite New Member" })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Only board admins and managers can invite members/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Invite Member/ })).not.toBeInTheDocument();
    expect(invitationRequests).toBe(0);
  });

  it("lets a manager invite a manager or contributor but never an admin", async () => {
    useBoard("MANAGER");
    useRoster();
    usePendingInvitations();

    renderMembersPage();

    const form = await inviteForm();
    expect(form).toBeTruthy();

    const options = within(form.role)
      .getAllByRole<HTMLOptionElement>("option")
      .map((option) => option.textContent);
    expect(options).toEqual(["Manager", "Contributor"]);
  });

  it("lets an admin invite another admin", async () => {
    useBoard("ADMIN");
    useRoster();
    usePendingInvitations();

    renderMembersPage();

    const form = await inviteForm();
    const options = within(form.role)
      .getAllByRole<HTMLOptionElement>("option")
      .map((option) => option.value);
    expect(options).toEqual(["ADMIN", "MANAGER", "CONTRIBUTOR"]);
  });

  it("submits a normalized invitation and refreshes the invitations list", async () => {
    let invitationListRequests = 0;
    let submitted: unknown = null;
    useBoard("ADMIN");
    useRoster();
    server.use(
      http.get(INVITATIONS_PATH, () => {
        invitationListRequests += 1;
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
      http.post(INVITATIONS_PATH, async ({ request }) => {
        submitted = await request.json();
        return HttpResponse.json(createdInvitation("new@example.test"), { status: 201 });
      }),
    );

    renderMembersPage();

    const form = await inviteForm();
    fireEvent.change(form.email, { target: { value: "  New@Example.test " } });
    fireEvent.click(form.submit);

    expect(
      await screen.findByText("Invitation sent to new@example.test as Contributor."),
    ).toBeInTheDocument();
    expect(submitted).toEqual({ email: "new@example.test", role: "CONTRIBUTOR" });
    await waitFor(() => expect(invitationListRequests).toBeGreaterThan(1));
    expect(form.email).toHaveValue("");
  });

  it("reports an undelivered invitation without claiming it failed", async () => {
    useBoard("ADMIN");
    useRoster();
    server.use(
      http.get(INVITATIONS_PATH, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.post(INVITATIONS_PATH, () =>
        HttpResponse.json(createdInvitation("new@example.test", "FAILED"), { status: 201 }),
      ),
    );

    renderMembersPage();

    const form = await inviteForm();
    fireEvent.change(form.email, { target: { value: "new@example.test" } });
    fireEvent.click(form.submit);

    expect(
      await screen.findByText(/the email could not be handed to the mail service/),
    ).toBeInTheDocument();
    expect(screen.getByText(/The invitation stays valid/)).toBeInTheDocument();
  });

  it("maps ALREADY_MEMBER to a safe inline error", async () => {
    useBoard("ADMIN");
    useRoster();
    server.use(
      http.get(INVITATIONS_PATH, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.post(INVITATIONS_PATH, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            code: "ALREADY_MEMBER",
            requestId: "req-9",
          },
          { status: 409 },
        ),
      ),
    );

    renderMembersPage();

    const form = await inviteForm();
    fireEvent.change(form.email, { target: { value: "grace@example.test" } });
    fireEvent.click(form.submit);

    expect(
      await screen.findByText("That person is already a member of this board."),
    ).toBeInTheDocument();
  });

  it("places API field validation errors next to the field", async () => {
    useBoard("ADMIN");
    useRoster();
    server.use(
      http.get(INVITATIONS_PATH, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.post(INVITATIONS_PATH, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Validation error",
            status: 400,
            code: "VALIDATION_ERROR",
            requestId: "req-10",
            errors: [{ path: "email", message: "Enter a valid email address." }],
          },
          { status: 400 },
        ),
      ),
    );

    renderMembersPage();

    const form = await inviteForm();
    fireEvent.change(form.email, { target: { value: "curator@example.test" } });
    fireEvent.click(form.submit);

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
  });

  it("filters the roster from URL search parameters", async () => {
    useBoard("ADMIN");
    useRoster();
    usePendingInvitations();

    const { unmount } = renderMembersPage(`/boards/${BOARD_ID}/members?role=ADMIN`);

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByText("Grace Hopper")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Admins (1 loaded)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    unmount();

    renderMembersPage(`/boards/${BOARD_ID}/members?q=grace`);

    expect(await screen.findByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Filter loaded members and invitations by name or email"),
    ).toHaveValue("grace");
  });

  it("loads pending invitations independently from the member roster", async () => {
    useBoard("MANAGER");
    useRoster();
    const firstInvitation = buildPendingInvitation({
      id: "01900000-0000-7000-8000-000000000211",
      email: "first@example.test",
    });
    const secondInvitation = buildPendingInvitation({
      id: "01900000-0000-7000-8000-000000000212",
      email: "second@example.test",
    });
    server.use(
      http.get(INVITATIONS_PATH, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        return HttpResponse.json(
          cursor === null
            ? { items: [firstInvitation], nextCursor: "invitations-2" }
            : { items: [secondInvitation], nextCursor: null },
        );
      }),
    );

    renderMembersPage();

    expect(await screen.findByText("first@example.test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more invitations" })).toBeInTheDocument();
    expect(screen.getByText(/at least 1 pending invitation loaded/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more invitations" }));

    expect(await screen.findByText("second@example.test")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more invitations" })).not.toBeInTheDocument();
    expect(screen.getByText(/and 2 pending invitations/)).toBeInTheDocument();
  });

  it("scopes search and empty copy to loaded member pages", async () => {
    useBoard("ADMIN");
    usePendingInvitations([]);
    server.use(
      http.get(MEMBERS_PATH, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        return HttpResponse.json(
          cursor === null
            ? { items: [ROSTER[0]], nextCursor: "members-2" }
            : { items: [ROSTER[2]], nextCursor: null },
        );
      }),
    );

    renderMembersPage(`/boards/${BOARD_ID}/members?q=linus`);

    expect(
      await screen.findByText(
        "No loaded members or pending invitations match this filter. Load more to search the rest of the roster.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/More records are available/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more members" }));

    expect(await screen.findByText("Linus Torvalds")).toBeInTheDocument();
  });

  it("lists pending invitations with a sent state for managers", async () => {
    useBoard("MANAGER");
    useRoster();
    usePendingInvitations();

    renderMembersPage();

    expect(await screen.findByText("sofia.chen@example.test")).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText(/Invited by Ada Lovelace/)).toBeInTheDocument();
    expect(screen.getByText(/and 1 pending invitation/)).toBeInTheDocument();
    expect(screen.getByText(/Role changes, member removal/)).toBeInTheDocument();
  });

  it("lets managers confirm and cancel non-admin invitations", async () => {
    useBoard("MANAGER");
    useRoster();
    let invitations = [buildPendingInvitation()];
    let cancelledId: string | undefined;
    server.use(
      http.get(INVITATIONS_PATH, () => HttpResponse.json({ items: invitations, nextCursor: null })),
      http.delete(`${INVITATIONS_PATH}/:invitationId`, ({ params }) => {
        cancelledId = String(params.invitationId);
        invitations = invitations.filter((invitation) => invitation.id !== cancelledId);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderMembersPage();

    const cancel = await screen.findByRole("button", {
      name: "Cancel invitation for sofia.chen@example.test",
    });
    fireEvent.click(cancel);
    expect(screen.getByText("Cancel this invitation?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Invitation for sofia.chen@example.test cancelled.",
    );
    expect(cancelledId).toBe(buildPendingInvitation().id);
    await waitFor(() =>
      expect(screen.queryByText("sofia.chen@example.test")).not.toBeInTheDocument(),
    );
  });

  it("does not let managers cancel admin invitations", async () => {
    useBoard("MANAGER");
    useRoster();
    usePendingInvitations([buildPendingInvitation({ role: "ADMIN" })]);

    renderMembersPage();

    expect(await screen.findByText("sofia.chen@example.test")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel invitation/ })).not.toBeInTheDocument();
  });

  it("reports a missing board as a not-found state", async () => {
    // The roster request is still in flight when the board 404s; keep it answered.
    useRoster();
    server.use(
      http.get(BOARD_PATH, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Not found",
            status: 404,
            code: "BOARD_NOT_FOUND",
            requestId: "req-11",
          },
          { status: 404 },
        ),
      ),
    );

    renderMembersPage();

    expect(await screen.findByText("We couldn’t find that board")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to boards" })).toHaveAttribute("href", "/boards");
  });
});
