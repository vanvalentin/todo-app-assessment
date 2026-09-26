import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AppShell } from "../../components/AppShell/AppShell";
import { Avatar } from "../../components/Avatar/Avatar";
import { RoleChip, roleLabel } from "../../components/RoleChip/RoleChip";
import { ApiError, NetworkError } from "../../lib/api/client";
import { acceptInvitation, fetchInvitationPreview } from "../../lib/api/invitations";
import { queryKeys } from "../../lib/api/queryKeys";
import { formatExpiry } from "../../lib/format";
import { authClient } from "../auth/authClient";
import { useSession } from "../auth/useSession";
import styles from "./InvitationPage.module.scss";

interface TerminalState {
  heading: string;
  description: string;
}

/** Terminal invitation states: retrying cannot change the outcome. */
function terminalState(error: unknown): TerminalState | null {
  if (!(error instanceof ApiError)) return null;
  switch (error.code) {
    case "INVITATION_NOT_FOUND":
      return {
        heading: "We couldn’t find this invitation",
        description:
          "The link may be incomplete, or the invitation may have been removed. Ask a board manager to send a new invitation.",
      };
    case "INVITATION_EXPIRED":
      return {
        heading: "This invitation has expired",
        description:
          "Invitation links are valid for a limited window. Ask a board manager for a fresh invitation.",
      };
    case "INVITATION_REVOKED":
      return {
        heading: "This invitation was revoked",
        description:
          "A board manager replaced or cancelled this invitation. The newest invitation email is the one to use.",
      };
    case "INVITATION_ALREADY_ACCEPTED":
      return {
        heading: "This invitation was already accepted",
        description:
          "Sign in with the invited email address and open the board from your boards list.",
      };
    case "INVITATION_UNAVAILABLE":
      return {
        heading: "This invitation is no longer available",
        description: "Ask a board manager to send a new invitation.",
      };
    default:
      return null;
  }
}

function retryMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return "We couldn’t reach Ksat. Check your connection and try again.";
  }
  if (error instanceof ApiError && error.status === 429) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  return "We couldn’t load this invitation. Please retry.";
}

export function InvitationPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const returnPath = `/invitations/${token}`;

  const previewQuery = useQuery({
    queryKey: queryKeys.invitation(token),
    queryFn: ({ signal }) => fetchInvitationPreview(token, signal),
    enabled: token.length > 0,
  });
  const acceptMutation = useMutation({
    mutationFn: () => acceptInvitation(token),
  });
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const [switchAccountError, setSwitchAccountError] = useState<string | null>(null);

  const preview = previewQuery.data;
  const closed = terminalState(previewQuery.error) ?? terminalState(acceptMutation.error);
  const signedInEmail = session?.user.email.toLowerCase() ?? null;
  const emailMatches = preview !== undefined && signedInEmail === preview.email.toLowerCase();

  const handleAccept = async () => {
    try {
      const result = await acceptMutation.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: queryKeys.boards() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.board(result.boardId) });
      await navigate(`/boards/${result.boardId}`, { replace: true });
    } catch {
      // The mutation error is rendered below the details.
    }
  };

  const handleSwitchAccount = async () => {
    setSwitchAccountError(null);
    setIsSwitchingAccount(true);
    try {
      const response = await authClient.signOut();
      if (response.error !== null) {
        setSwitchAccountError("We couldn’t switch accounts. Please try again.");
        return;
      }
      queryClient.clear();
    } catch {
      setSwitchAccountError("We couldn’t switch accounts. Please try again.");
    } finally {
      setIsSwitchingAccount(false);
    }
  };

  if (closed !== null || token.length === 0) {
    return (
      <AppShell>
        <section className={styles.statePanel} aria-labelledby="invitation-closed-heading">
          <p className={styles.stateEyebrow}>Invitation</p>
          <h1 className={styles.stateTitle} id="invitation-closed-heading">
            {closed?.heading ?? "We couldn’t find this invitation"}
          </h1>
          <p className={styles.stateText}>
            {closed?.description ??
              "The invitation link is incomplete. Ask a board manager to send a new invitation."}
          </p>
          <Link className={styles.stateAction} to="/boards">
            Go to boards
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className={styles.page}>
        {previewQuery.isPending ? (
          <div className={styles.card} role="status" aria-live="polite">
            <span className="visually-hidden">Loading invitation…</span>
            <span className={styles.skeletonTitle} aria-hidden="true" />
            <span className={styles.skeletonLine} aria-hidden="true" />
          </div>
        ) : null}

        {previewQuery.isError ? (
          <section className={styles.card} aria-labelledby="invitation-error-heading">
            <p className={styles.eyebrow}>Invitation</p>
            <h1 className={styles.title} id="invitation-error-heading">
              We couldn’t load this invitation
            </h1>
            <p className={styles.text} role="alert">
              {retryMessage(previewQuery.error)}
            </p>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={previewQuery.isFetching}
              onClick={() => void previewQuery.refetch()}
            >
              {previewQuery.isFetching ? "Retrying…" : "Retry"}
            </button>
          </section>
        ) : null}

        {preview ? (
          <section className={styles.card} aria-labelledby="invitation-heading">
            <p className={styles.eyebrow}>Board invitation</p>
            <h1 className={styles.title} id="invitation-heading">
              {preview.boardName}
            </h1>
            <p className={styles.text}>
              You have been invited to join this board as <strong>{roleLabel(preview.role)}</strong>
              .
            </p>

            <dl className={styles.details}>
              <div className={styles.detailRow}>
                <dt>Role</dt>
                <dd>
                  <RoleChip role={preview.role} />
                </dd>
              </div>
              <div className={styles.detailRow}>
                <dt>Invited by</dt>
                <dd className={styles.inviter}>
                  <Avatar
                    seed={preview.invitedBy.avatarSeed}
                    name={preview.invitedBy.name}
                    size={28}
                    decorative
                  />
                  {preview.invitedBy.name}
                </dd>
              </div>
              <div className={styles.detailRow}>
                <dt>Invited email</dt>
                <dd className={styles.email}>{preview.email}</dd>
              </div>
              <div className={styles.detailRow}>
                <dt>Expires</dt>
                <dd>{formatExpiry(preview.expiresAt)}</dd>
              </div>
            </dl>

            {session === null ? (
              <div className={styles.actions}>
                <p className={styles.actionText}>
                  Sign in as <strong>{preview.email}</strong> or create an account with that address
                  to accept this invitation.
                </p>
                <div className={styles.buttonRow}>
                  <Link
                    className={styles.primaryButton}
                    to={`/login?mode=sign-in&redirect=${encodeURIComponent(returnPath)}`}
                  >
                    Log in to accept
                  </Link>
                  <Link
                    className={styles.secondaryButton}
                    to={`/login?mode=sign-up&redirect=${encodeURIComponent(returnPath)}`}
                  >
                    Create an account
                  </Link>
                </div>
              </div>
            ) : null}

            {session !== null && !emailMatches ? (
              <div className={styles.actions}>
                <p className={styles.warning} role="alert">
                  This invitation was sent to {preview.email}, but you are signed in as{" "}
                  {session.user.email}. Invitations can only be accepted by the invited address.
                </p>
                {switchAccountError !== null ? (
                  <p className={styles.error} role="alert">
                    {switchAccountError}
                  </p>
                ) : null}
                <div className={styles.buttonRow}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    disabled={isSwitchingAccount}
                    onClick={() => void handleSwitchAccount()}
                  >
                    {isSwitchingAccount ? "Switching accounts…" : "Use a different account"}
                  </button>
                </div>
              </div>
            ) : null}

            {session !== null && emailMatches ? (
              <div className={styles.actions}>
                {acceptMutation.isError ? (
                  <p className={styles.error} role="alert">
                    {acceptMutation.error instanceof ApiError && acceptMutation.error.status === 429
                      ? "Too many attempts. Please wait a moment and try again."
                      : "We couldn’t join you to this board. Please try again."}
                  </p>
                ) : null}
                <button
                  className={styles.primaryButton}
                  type="button"
                  disabled={acceptMutation.isPending}
                  onClick={() => void handleAccept()}
                >
                  {acceptMutation.isPending ? "Joining…" : "Accept invitation"}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
