import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Link, useParams } from "react-router";
import exportIcon from "../../assets/members/export-roster.svg";
import inviteMemberIcon from "../../assets/members/invite-member.svg";
import { AppShell } from "../../components/AppShell/AppShell";
import { RoleChip } from "../../components/RoleChip/RoleChip";
import { ApiError, NetworkError } from "../../lib/api/client";
import { fetchBoard, fetchBoardMembers } from "../../lib/api/boards";
import { fetchPendingInvitations } from "../../lib/api/invitations";
import { queryKeys } from "../../lib/api/queryKeys";
import { useSession } from "../auth/useSession";
import { InviteMemberSection } from "./InviteMemberSection";
import { RosterSection } from "./RosterSection";
import styles from "./BoardMembersPage.module.scss";

const ROLE_GUIDE = [
  {
    role: "ADMIN",
    tag: "[ full access ]",
    description:
      "Full board access: manages members and invitations and performs destructive board operations.",
  },
  {
    role: "MANAGER",
    tag: "[ members & invites ]",
    description: "Manages members, invitations, and board settings.",
  },
  {
    role: "CONTRIBUTOR",
    tag: "[ task work ]",
    description: "Creates and updates tasks, including status, proofs, and comments.",
  },
] as const;

export function BoardMembersPage() {
  const { boardId = "" } = useParams();
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const { session } = useSession();

  const boardQuery = useQuery({
    queryKey: queryKeys.board(boardId),
    queryFn: ({ signal }) => fetchBoard(boardId, signal),
    enabled: boardId.length > 0,
  });
  const board = boardQuery.data;
  const role = board?.role ?? null;
  const canManage = role === "ADMIN" || role === "MANAGER";
  const canInviteAdmin = role === "ADMIN";

  const membersQuery = useInfiniteQuery({
    queryKey: queryKeys.boardMembers(boardId),
    queryFn: ({ pageParam, signal }) => fetchBoardMembers(boardId, { cursor: pageParam, signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: boardId.length > 0,
  });
  const invitationsQuery = useInfiniteQuery({
    queryKey: queryKeys.boardInvitations(boardId),
    queryFn: ({ pageParam, signal }) =>
      fetchPendingInvitations(boardId, { cursor: pageParam, signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // Contributors may not read the invitation list at all.
    enabled: boardId.length > 0 && canManage,
  });

  const members = membersQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const pendingInvitations = invitationsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const notFound = boardQuery.isError && (boardQuery.error as ApiError).status === 404;

  if (notFound) {
    return (
      <AppShell>
        <section className={styles.statePanel} aria-labelledby="members-not-found-heading">
          <p className={styles.stateEyebrow}>Board unavailable</p>
          <h1 className={styles.stateTitle} id="members-not-found-heading">
            We couldn’t find that board
          </h1>
          <p className={styles.stateText}>
            Member management is only available to members of the board, and non-members see no
            difference between a missing board and one they cannot open.
          </p>
          <Link className={styles.stateAction} to="/boards">
            Back to boards
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link to="/boards">Boards</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/boards/${boardId}`}>{board?.name ?? "Board"}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Members</span>
        </nav>

        {boardQuery.isPending ? (
          <div className={styles.loading} role="status" aria-live="polite">
            <span className="visually-hidden">Loading board members…</span>
            <span className={styles.skeletonHeading} aria-hidden="true" />
            <span className={styles.skeletonPanel} aria-hidden="true" />
          </div>
        ) : null}

        {boardQuery.isError && !notFound ? (
          <section className={styles.statePanel} aria-labelledby="members-error-heading">
            <p className={styles.stateEyebrow}>Board unavailable</p>
            <h1 className={styles.stateTitle} id="members-error-heading">
              We couldn’t load this board
            </h1>
            <p className={styles.stateText} role="alert">
              {boardQuery.error instanceof NetworkError
                ? "We couldn’t reach Ksat. Check your connection and try again."
                : "Membership settings could not be loaded. Please retry."}
            </p>
            <button
              className={styles.stateAction}
              type="button"
              disabled={boardQuery.isFetching}
              onClick={() => void boardQuery.refetch()}
            >
              {boardQuery.isFetching ? "Retrying…" : "Retry"}
            </button>
          </section>
        ) : null}

        {board ? (
          <>
            <header className={styles.pageHeader}>
              <div>
                <h1 className={styles.pageTitle}>Board Members</h1>
                <span className={styles.sectionTag} aria-hidden="true">
                  [ access &amp; permissions ]
                </span>
                <p className={styles.subtitle}>
                  Manage team access and invite collaborators to {board.name}.
                </p>
              </div>
              {canManage ? (
                <div className={styles.headerActions}>
                  <button
                    className={styles.deferredButton}
                    type="button"
                    disabled
                    aria-label="Export roster — available in a later phase"
                    title="Roster export arrives in a later phase."
                  >
                    <img src={exportIcon} alt="" width={10.667} height={10.667} />
                    <span>Export Roster</span>
                  </button>
                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={() => emailInputRef.current?.focus()}
                  >
                    <img src={inviteMemberIcon} alt="" width={14.667} height={10.667} />
                    <span>Invite Member</span>
                  </button>
                </div>
              ) : null}
            </header>

            <div className={styles.layout}>
              <aside className={styles.sidebar}>
                <section className={styles.card} aria-labelledby="cohort-heading">
                  <div className={styles.cardTop}>
                    <h2 className={styles.cardTitle} id="cohort-heading">
                      Cohort summary
                    </h2>
                    <span className={styles.countPill}>
                      {board.memberCount} {board.memberCount === 1 ? "member" : "members"}
                    </span>
                  </div>
                  <p className={styles.bigCount}>
                    {board.memberCount} {board.memberCount === 1 ? "Member" : "Members"}
                  </p>
                  <p className={styles.pendingCount}>
                    {canManage
                      ? invitationsQuery.hasNextPage
                        ? `${pendingInvitations.length}+ Pending (loaded)`
                        : `${pendingInvitations.length} Pending`
                      : "Invitations are managed by admins and managers"}
                  </p>
                  <p className={styles.cardText}>
                    Everyone listed here can open this board. Roles decide who can invite and
                    administer.
                  </p>
                </section>

                <section className={styles.card} aria-labelledby="roles-heading">
                  <div className={styles.cardTop}>
                    <h2 className={styles.cardTitle} id="roles-heading">
                      Roles &amp; hierarchy
                    </h2>
                    <span className={styles.cardTag}>[ guidelines ]</span>
                  </div>
                  <ul className={styles.roleList}>
                    {ROLE_GUIDE.map((entry) => (
                      <li className={styles.roleItem} key={entry.role}>
                        <div className={styles.roleHead}>
                          <RoleChip role={entry.role} />
                          <span className={styles.roleTag} aria-hidden="true">
                            {entry.tag}
                          </span>
                        </div>
                        <p className={styles.roleText}>{entry.description}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              </aside>

              <div className={styles.main}>
                {canManage ? (
                  <InviteMemberSection
                    boardId={boardId}
                    canInviteAdmin={canInviteAdmin}
                    emailInputRef={emailInputRef}
                  />
                ) : (
                  <section className={styles.card} aria-labelledby="invite-readonly-heading">
                    <h2 className={styles.cardTitle} id="invite-readonly-heading">
                      Invitations
                    </h2>
                    <p className={styles.cardText}>
                      Only board admins and managers can invite members. Ask an admin if someone is
                      missing from the roster.
                    </p>
                  </section>
                )}

                <RosterSection
                  boardId={boardId}
                  members={members}
                  isMembersPending={membersQuery.isPending}
                  membersError={membersQuery.isError ? membersQuery.error : null}
                  hasMoreMembers={membersQuery.hasNextPage}
                  isLoadingMoreMembers={membersQuery.isFetchingNextPage}
                  onLoadMoreMembers={() => void membersQuery.fetchNextPage()}
                  onRetryMembers={() => void membersQuery.refetch()}
                  hasMoreInvitations={invitationsQuery.hasNextPage}
                  isLoadingMoreInvitations={invitationsQuery.isFetchingNextPage}
                  onLoadMoreInvitations={() => void invitationsQuery.fetchNextPage()}
                  pendingInvitations={pendingInvitations}
                  isInvitationsPending={invitationsQuery.isPending && canManage}
                  invitationsError={
                    invitationsQuery.isError && canManage ? invitationsQuery.error : null
                  }
                  canManage={canManage}
                  canManageAdminInvitations={role === "ADMIN"}
                  currentUserId={session?.user.id ?? ""}
                />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
