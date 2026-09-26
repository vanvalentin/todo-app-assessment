import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createInvitationRequestSchema, type CreateInvitationRequest } from "@ksat/contracts";
import { useId, useState, type RefObject } from "react";
import { useForm, useWatch } from "react-hook-form";
import sendIcon from "../../assets/members/send-invite.svg";
import selectChevron from "../../assets/members/role-select-chevron.svg";
import { roleDescription, roleLabel } from "../../components/RoleChip/RoleChip";
import { ApiError, NetworkError } from "../../lib/api/client";
import { createInvitation } from "../../lib/api/invitations";
import { queryKeys } from "../../lib/api/queryKeys";
import styles from "./InviteMemberSection.module.scss";

interface InviteMemberSectionProps {
  boardId: string;
  /** Only admins may grant the admin role; managers never see the option. */
  canInviteAdmin: boolean;
  emailInputRef: RefObject<HTMLInputElement | null>;
}

interface Status {
  tone: "success" | "warning" | "error";
  message: string;
}

function invitationErrorStatus(error: unknown): Status {
  if (error instanceof NetworkError) {
    return {
      tone: "error",
      message: "We couldn’t reach Ksat. Check your connection and try again.",
    };
  }
  if (error instanceof ApiError) {
    if (error.code === "ALREADY_MEMBER") {
      return { tone: "error", message: "That person is already a member of this board." };
    }
    if (error.code === "ADMIN_ROLE_REQUIRED") {
      return { tone: "error", message: "Only admins may invite another admin." };
    }
    if (error.status === 403) {
      return {
        tone: "error",
        message: "You don’t have permission to invite members to this board.",
      };
    }
    if (error.status === 429) {
      return {
        tone: "error",
        message: "Too many invitations sent. Please wait a little and try again.",
      };
    }
    if (error.status === 404) {
      return { tone: "error", message: "This board is no longer available to you." };
    }
  }
  return { tone: "error", message: "We couldn’t send that invitation. Please try again." };
}

export function InviteMemberSection({
  boardId,
  canInviteAdmin,
  emailInputRef,
}: InviteMemberSectionProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status | null>(null);
  const emailId = useId();
  const roleId = useId();
  const form = useForm<CreateInvitationRequest>({
    resolver: zodResolver(createInvitationRequestSchema),
    defaultValues: { email: "", role: "CONTRIBUTOR" },
    mode: "onSubmit",
  });
  const mutation = useMutation({
    mutationFn: (values: CreateInvitationRequest) => createInvitation(boardId, values),
  });
  const emailField = form.register("email");
  // useWatch keeps the hint reactive without registering a form-level subscription.
  const selectedRole = useWatch({ control: form.control, name: "role" });
  const emailError = form.formState.errors.email?.message;
  const roleError = form.formState.errors.role?.message;
  const isPending = mutation.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    setStatus(null);
    try {
      const result = await mutation.mutateAsync(values);
      form.reset({ email: "", role: values.role });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.boardInvitations(boardId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.boardMembers(boardId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
      ]);
      setStatus(
        result.emailDelivery === "SENT"
          ? {
              tone: "success",
              message: `Invitation sent to ${result.email} as ${roleLabel(result.role)}.`,
            }
          : {
              tone: "warning",
              message: `The ${roleLabel(result.role)} invitation for ${result.email} is saved, but the email could not be handed to the mail service. The invitation stays valid; ask an admin to resend it once email delivery is available.`,
            },
      );
    } catch (error) {
      if (error instanceof ApiError) {
        for (const issue of error.fieldErrors) {
          if (issue.path === "email" || issue.path === "role") {
            form.setError(issue.path, { message: issue.message });
          }
        }
        if (error.code === "ADMIN_ROLE_REQUIRED") {
          form.setError("role", { message: "Only admins may invite another admin." });
        }
      }
      setStatus(invitationErrorStatus(error));
    }
  });

  return (
    <section className={styles.section} aria-labelledby="invite-heading">
      <header className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle} id="invite-heading">
            Invite New Member
          </h2>
          <p className={styles.sectionText}>
            Send an email invitation with an assigned role. The link stays valid for the configured
            invitation window, and the invitation appears below until the recipient accepts it.
          </p>
        </div>
        <span className={styles.sectionTag} aria-hidden="true">
          [ sec // invite ]
        </span>
      </header>

      <form
        className={styles.form}
        noValidate
        aria-busy={isPending}
        onSubmit={(event) => void onSubmit(event)}
      >
        <div className={styles.field}>
          <label htmlFor={emailId}>Email address</label>
          <input
            {...emailField}
            id={emailId}
            ref={(node) => {
              emailField.ref(node);
              emailInputRef.current = node;
            }}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="curator@example.com"
            disabled={isPending}
            aria-invalid={emailError === undefined ? "false" : "true"}
            aria-describedby={emailError === undefined ? undefined : `${emailId}-error`}
          />
          {emailError === undefined ? null : (
            <span className={styles.fieldError} id={`${emailId}-error`} role="alert">
              {emailError}
            </span>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor={roleId}>Assigned role</label>
          <div className={styles.selectWrapper}>
            <select
              {...form.register("role")}
              id={roleId}
              disabled={isPending}
              aria-invalid={roleError === undefined ? "false" : "true"}
              aria-describedby={roleError === undefined ? `${roleId}-hint` : `${roleId}-error`}
            >
              {canInviteAdmin ? <option value="ADMIN">Admin</option> : null}
              <option value="MANAGER">Manager</option>
              <option value="CONTRIBUTOR">Contributor</option>
            </select>
            <img
              className={styles.selectChevron}
              src={selectChevron}
              alt=""
              width={18}
              height={18}
            />
          </div>
          {roleError === undefined ? (
            <span className={styles.fieldHint} id={`${roleId}-hint`}>
              {roleDescription(selectedRole)}{" "}
              {canInviteAdmin
                ? "Admins hold destructive board rights."
                : "Only admins can grant the admin role."}
            </span>
          ) : (
            <span className={styles.fieldError} id={`${roleId}-error`} role="alert">
              {roleError}
            </span>
          )}
        </div>

        <button className={styles.submitButton} type="submit" disabled={isPending}>
          <img src={sendIcon} alt="" width={12.667} height={10.667} />
          <span>{isPending ? "Sending…" : "Send Invite"}</span>
        </button>
      </form>

      {status === null ? null : (
        <p
          className={`${styles.status} ${status.tone === "success" ? styles.statusSuccess : ""} ${
            status.tone === "warning" ? styles.statusWarning : ""
          } ${status.tone === "error" ? styles.statusError : ""}`}
          role={status.tone === "error" ? "alert" : "status"}
          aria-live={status.tone === "error" ? "assertive" : "polite"}
        >
          {status.message}
        </p>
      )}
    </section>
  );
}
