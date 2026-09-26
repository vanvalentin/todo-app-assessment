import type { BoardMember, BoardRole, PendingInvitation } from "@ksat/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import searchIcon from "../../assets/members/roster-search.svg";
import { Avatar } from "../../components/Avatar/Avatar";
import { RoleChip } from "../../components/RoleChip/RoleChip";
import { ApiError, NetworkError } from "../../lib/api/client";
import { revokeInvitation } from "../../lib/api/invitations";
import { queryKeys } from "../../lib/api/queryKeys";
import { formatDate, formatExpiry } from "../../lib/format";
import styles from "./RosterSection.module.scss";

export type RosterRoleFilter = "ALL" | BoardRole;

const ROLE_FILTERS: ReadonlyArray<{ value: RosterRoleFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "ADMIN", label: "Admins" },
  { value: "MANAGER", label: "Managers" },
  { value: "CONTRIBUTOR", label: "Contributors" },
];

function parseRoleFilter(value: string | null): RosterRoleFilter {
  const match = ROLE_FILTERS.find((filter) => filter.value === value);
  return match?.value ?? "ALL";
}

function matchesSearch(term: string, ...candidates: string[]): boolean {
  if (term.length === 0) return true;
  const needle = term.trim().toLowerCase();
  return candidates.some((candidate) => candidate.toLowerCase().includes(needle));
}

function initialsFrom(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

interface RosterSectionProps {
  boardId: string;
  members: readonly BoardMember[];
  isMembersPending: boolean;
  membersError: unknown;
  hasMoreMembers: boolean;
  isLoadingMoreMembers: boolean;
  onLoadMoreMembers: () => void;
  onRetryMembers: () => void;
  hasMoreInvitations: boolean;
  isLoadingMoreInvitations: boolean;
  onLoadMoreInvitations: () => void;
  pendingInvitations: readonly PendingInvitation[];
  isInvitationsPending: boolean;
  invitationsError: unknown;
  /** Managers and admins see the pending invitation list and its states. */
  canManage: boolean;
  canManageAdminInvitations: boolean;
  currentUserId: string;
}

export function RosterSection({
  boardId,
  members,
  isMembersPending,
  membersError,
  hasMoreMembers,
  isLoadingMoreMembers,
  onLoadMoreMembers,
  onRetryMembers,
  hasMoreInvitations,
  isLoadingMoreInvitations,
  onLoadMoreInvitations,
  pendingInvitations,
  isInvitationsPending,
  invitationsError,
  canManage,
  canManageAdminInvitations,
  currentUserId,
}: RosterSectionProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [confirmingInvitationId, setConfirmingInvitationId] = useState<string | null>(null);
  const [revokeStatus, setRevokeStatus] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const revokeStatusRef = useRef<HTMLParagraphElement | null>(null);
  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) => revokeInvitation(boardId, invitationId),
  });
  const searchId = useId();
  const search = searchParams.get("q") ?? "";
  const roleFilter = parseRoleFilter(searchParams.get("role"));

  const counts = useMemo(() => {
    const byRole: Record<RosterRoleFilter, number> = {
      ALL: members.length,
      ADMIN: 0,
      MANAGER: 0,
      CONTRIBUTOR: 0,
    };
    for (const member of members) byRole[member.role] += 1;
    return byRole;
  }, [members]);

  const visibleMembers = members.filter(
    (member) =>
      (roleFilter === "ALL" || member.role === roleFilter) &&
      matchesSearch(search, member.user.name, member.user.email),
  );
  const visibleInvitations = canManage
    ? pendingInvitations.filter(
        (invitation) =>
          (roleFilter === "ALL" || invitation.role === roleFilter) &&
          matchesSearch(search, invitation.email, invitation.invitedBy.name),
      )
    : [];
  const isFiltered = roleFilter !== "ALL" || search.trim().length > 0;
  const hasResults = visibleMembers.length > 0 || visibleInvitations.length > 0;
  const hasMoreRecords = hasMoreMembers || (canManage && hasMoreInvitations);
  const pendingSummary = hasMoreInvitations
    ? `at least ${pendingInvitations.length} pending ${pendingInvitations.length === 1 ? "invitation" : "invitations"} loaded`
    : `${pendingInvitations.length} pending ${pendingInvitations.length === 1 ? "invitation" : "invitations"}`;

  useEffect(() => {
    if (revokeStatus) revokeStatusRef.current?.focus();
  }, [revokeStatus]);

  const cancelInvitation = async (invitation: PendingInvitation) => {
    setRevokeStatus(null);
    try {
      await revokeMutation.mutateAsync(invitation.id);
      setConfirmingInvitationId(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.boardInvitations(boardId) });
      setRevokeStatus({
        tone: "success",
        message: `Invitation for ${invitation.email} cancelled.`,
      });
    } catch (error) {
      const message =
        error instanceof NetworkError
          ? "We couldn’t reach Ksat. Check your connection and try again."
          : error instanceof ApiError && error.code === "INVITATION_NOT_PENDING"
            ? "This invitation was accepted before it could be cancelled. Refresh the roster."
            : error instanceof ApiError && error.status === 403
              ? "You no longer have permission to cancel this invitation."
              : error instanceof ApiError && error.status === 404
                ? "This invitation is no longer available. Refresh the roster."
                : "We couldn’t cancel this invitation. Please try again.";
      setRevokeStatus({ tone: "error", message });
    }
  };

  const updateParams = (next: { q?: string; role?: RosterRoleFilter }) => {
    const params = new URLSearchParams(searchParams);
    if (next.q !== undefined) {
      if (next.q.length === 0) params.delete("q");
      else params.set("q", next.q);
    }
    if (next.role !== undefined) {
      if (next.role === "ALL") params.delete("role");
      else params.set("role", next.role);
    }
    setSearchParams(params, { replace: true });
  };

  return (
    <section className={styles.section} aria-labelledby="roster-heading">
      <header className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle} id="roster-heading">
            Active Roster &amp; Permissions
          </h2>
          <p className={styles.sectionText}>
            Members and their assigned roles for this board. Counts and filters cover records loaded
            so far. Roles are read-only in this phase.
          </p>
        </div>
        <span className={styles.sectionTag} aria-hidden="true">
          [ sec // roster ]
        </span>
      </header>

      <div className={styles.filters}>
        <div className={styles.searchField}>
          <label className="visually-hidden" htmlFor={searchId}>
            Filter loaded members and invitations by name or email
          </label>
          <input
            id={searchId}
            type="search"
            placeholder="Filter loaded roster by name or email…"
            value={search}
            onChange={(event) => updateParams({ q: event.target.value })}
          />
          <img className={styles.searchIcon} src={searchIcon} alt="" width={13.5} height={13.5} />
        </div>

        <div className={styles.roleFilters} role="group" aria-label="Filter roster by role">
          {ROLE_FILTERS.map((filter) => (
            <button
              className={roleFilter === filter.value ? styles.filterChipActive : styles.filterChip}
              key={filter.value}
              type="button"
              aria-pressed={roleFilter === filter.value}
              onClick={() => updateParams({ role: filter.value })}
            >
              {filter.label} ({counts[filter.value]} loaded)
            </button>
          ))}
        </div>
      </div>

      {isMembersPending ? (
        <div className={styles.loading} role="status" aria-live="polite">
          <span className="visually-hidden">Loading members…</span>
          {[0, 1, 2].map((key) => (
            <span className={styles.skeletonRow} key={key} aria-hidden="true" />
          ))}
        </div>
      ) : null}

      {membersError !== null && membersError !== undefined ? (
        <div className={styles.errorPanel}>
          <p className={styles.errorText} role="alert">
            We couldn’t load the member roster. Please retry.
          </p>
          <button className={styles.retryButton} type="button" onClick={onRetryMembers}>
            Retry
          </button>
        </div>
      ) : null}

      {!isMembersPending && membersError === null ? (
        <>
          {hasResults ? (
            <ul className={styles.roster}>
              {visibleMembers.map((member) => (
                <li className={styles.row} key={member.userId}>
                  <Avatar
                    seed={member.user.avatarSeed}
                    name={member.user.name}
                    size={40}
                    decorative
                  />
                  <div className={styles.identity}>
                    <p className={styles.name}>
                      {member.user.name}
                      {member.userId === currentUserId ? (
                        <span className={styles.youBadge}>You</span>
                      ) : null}
                    </p>
                    <p className={styles.email}>{member.user.email}</p>
                  </div>
                  <p className={styles.meta}>
                    <span className={styles.metaLabel}>Joined cohort</span>
                    {formatDate(member.joinedAt)}
                  </p>
                  <RoleChip role={member.role} />
                </li>
              ))}

              {visibleInvitations.map((invitation) => (
                <li className={`${styles.row} ${styles.pendingRow}`} key={invitation.id}>
                  <span className={styles.pendingAvatar} aria-hidden="true">
                    {initialsFrom(invitation.email)}
                  </span>
                  <div className={styles.identity}>
                    <p className={styles.name}>
                      {invitation.email}
                      <span className={styles.sentBadge}>Sent</span>
                    </p>
                    <p className={styles.email}>
                      Invited by {invitation.invitedBy.name} · Expires{" "}
                      {formatExpiry(invitation.expiresAt)}
                    </p>
                  </div>
                  <p className={styles.meta}>
                    <span className={styles.metaLabel}>Status</span>
                    Waiting for acceptance
                  </p>
                  <RoleChip role={invitation.role} />
                  {canManageAdminInvitations || invitation.role !== "ADMIN" ? (
                    <div className={styles.invitationActions}>
                      {confirmingInvitationId === invitation.id ? (
                        <>
                          <span className={styles.confirmText}>Cancel this invitation?</span>
                          <button
                            className={styles.dangerButton}
                            type="button"
                            disabled={revokeMutation.isPending}
                            onClick={() => void cancelInvitation(invitation)}
                          >
                            {revokeMutation.isPending ? "Cancelling…" : "Yes, cancel"}
                          </button>
                          <button
                            className={styles.keepButton}
                            type="button"
                            disabled={revokeMutation.isPending}
                            onClick={() => setConfirmingInvitationId(null)}
                          >
                            Keep
                          </button>
                        </>
                      ) : (
                        <button
                          className={styles.cancelInviteButton}
                          type="button"
                          aria-label={`Cancel invitation for ${invitation.email}`}
                          onClick={() => {
                            setRevokeStatus(null);
                            setConfirmingInvitationId(invitation.id);
                          }}
                        >
                          Cancel invite
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.emptyPanel}>
              <p className={styles.emptyText}>
                {isFiltered
                  ? hasMoreRecords
                    ? "No loaded members or pending invitations match this filter. Load more to search the rest of the roster."
                    : "No members or pending invitations match this filter."
                  : "No members yet."}
              </p>
              {isFiltered ? (
                <button
                  className={styles.clearButton}
                  type="button"
                  onClick={() => updateParams({ q: "", role: "ALL" })}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          )}
        </>
      ) : null}

      {revokeStatus === null ? null : (
        <p
          ref={revokeStatusRef}
          className={revokeStatus.tone === "error" ? styles.revokeError : styles.revokeSuccess}
          role={revokeStatus.tone === "error" ? "alert" : "status"}
          tabIndex={-1}
        >
          {revokeStatus.message}
        </p>
      )}

      {isInvitationsPending && canManage ? (
        <p className={styles.notice} role="status">
          Loading pending invitations…
        </p>
      ) : null}

      {invitationsError !== null && invitationsError !== undefined && canManage ? (
        <p className={styles.notice} role="alert">
          Pending invitations are unavailable right now. The active roster above is unaffected.
        </p>
      ) : null}

      {hasMoreRecords ? (
        <p className={styles.notice} role="status">
          More records are available. Load more to include them in searches and counts.
        </p>
      ) : null}

      {hasMoreMembers || hasMoreInvitations ? (
        <div className={styles.loadMoreRow}>
          {hasMoreMembers ? (
            <button
              className={styles.clearButton}
              type="button"
              disabled={isLoadingMoreMembers}
              onClick={onLoadMoreMembers}
            >
              {isLoadingMoreMembers ? "Loading members…" : "Load more members"}
            </button>
          ) : null}
          {hasMoreInvitations ? (
            <button
              className={styles.clearButton}
              type="button"
              disabled={isLoadingMoreInvitations}
              onClick={onLoadMoreInvitations}
            >
              {isLoadingMoreInvitations ? "Loading invitations…" : "Load more invitations"}
            </button>
          ) : null}
        </div>
      ) : null}

      <footer className={styles.rosterFooter}>
        <p className={styles.footerCount}>
          {isFiltered
            ? `Showing ${visibleMembers.length} of ${members.length} loaded active members`
            : `Showing ${members.length} loaded active ${members.length === 1 ? "member" : "members"}`}
          {canManage ? ` and ${pendingSummary}` : ""}
        </p>
        <p className={styles.footerNote}>
          Role changes, member removal, and invitation resend arrive in a later phase.
        </p>
      </footer>
    </section>
  );
}
