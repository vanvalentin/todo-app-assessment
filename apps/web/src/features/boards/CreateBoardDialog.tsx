import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createBoardRequestSchema, type CreateBoardRequest } from "@ksat/contracts";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { ApiError, NetworkError } from "../../lib/api/client";
import { createBoard } from "../../lib/api/boards";
import { queryKeys } from "../../lib/api/queryKeys";
import styles from "./CreateBoardDialog.module.scss";

interface CreateBoardDialogProps {
  onClose: () => void;
}

function createErrorMessage(error: unknown): string {
  if (error instanceof NetworkError)
    return "We couldn’t reach Ksat. Check your connection and try again.";
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has expired. Please sign in again.";
    if (error.status === 429) return "You’ve created several boards recently. Try again later.";
  }
  return "We couldn’t create the board. Please try again.";
}

export function CreateBoardDialog({ onClose }: CreateBoardDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const titleId = useId();
  const descriptionId = useId();
  const helpId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<CreateBoardRequest>({
    resolver: zodResolver(createBoardRequestSchema),
    defaultValues: { name: "", description: "" },
  });
  const mutation = useMutation({ mutationFn: (input: CreateBoardRequest) => createBoard(input) });
  const nameField = form.register("name");
  const nameError = form.formState.errors.name?.message;
  const descriptionError = form.formState.errors.description?.message;

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !mutation.isPending) {
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), textarea:not([disabled])",
      ) ?? [],
    );
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onSubmit = form.handleSubmit(async (input) => {
    setSubmitError(null);
    form.clearErrors();
    try {
      const board = await mutation.mutateAsync(input);
      queryClient.setQueryData(queryKeys.board(board.id), board);
      await queryClient.invalidateQueries({ queryKey: queryKeys.boards() });
      navigate(`/boards/${board.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const issue of error.fieldErrors) {
          if (issue.path === "name" || issue.path === "description") {
            form.setError(issue.path, { message: issue.message });
          }
        }
      }
      setSubmitError(createErrorMessage(error));
    }
  });

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        onKeyDown={handleDialogKeyDown}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={helpId}
      >
        <p className={styles.eyebrow}>New workspace</p>
        <h2 className={styles.title} id={titleId}>
          Create a board
        </h2>
        <p className={styles.help} id={helpId}>
          Start with a name and optional description. You’ll become the board administrator.
        </p>
        <form
          className={styles.form}
          noValidate
          aria-busy={mutation.isPending}
          onSubmit={(event) => void onSubmit(event)}
        >
          <div className={styles.field}>
            <label htmlFor={`${titleId}-name`}>Board name</label>
            <input
              {...nameField}
              id={`${titleId}-name`}
              ref={(node) => {
                nameField.ref(node);
                nameRef.current = node;
              }}
              type="text"
              maxLength={120}
              autoComplete="off"
              disabled={mutation.isPending}
              aria-invalid={nameError === undefined ? "false" : "true"}
              aria-describedby={
                nameError === undefined ? helpId : `${helpId} ${titleId}-name-error`
              }
            />
            {nameError === undefined ? null : (
              <span className={styles.fieldError} id={`${titleId}-name-error`} role="alert">
                {nameError}
              </span>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor={descriptionId}>
              Description <span>(optional)</span>
            </label>
            <textarea
              {...form.register("description")}
              id={descriptionId}
              rows={4}
              maxLength={2000}
              disabled={mutation.isPending}
              aria-invalid={descriptionError === undefined ? "false" : "true"}
              aria-describedby={
                descriptionError === undefined ? helpId : `${helpId} ${descriptionId}-error`
              }
            />
            {descriptionError === undefined ? null : (
              <span className={styles.fieldError} id={`${descriptionId}-error`} role="alert">
                {descriptionError}
              </span>
            )}
          </div>
          {submitError === null ? null : (
            <p className={styles.submitError} role="alert">
              {submitError}
            </p>
          )}
          <div className={styles.actions}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancel
            </button>
            <button className={styles.primaryButton} type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create board"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
