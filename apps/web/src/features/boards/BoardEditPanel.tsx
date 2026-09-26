import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  updateBoardRequestSchema,
  type BoardSummary,
  type UpdateBoardRequest,
} from "@ksat/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ApiError, NetworkError } from "../../lib/api/client";
import { fetchBoard, updateBoard } from "../../lib/api/boards";
import { queryKeys } from "../../lib/api/queryKeys";
import styles from "./BoardEditPanel.module.scss";

interface BoardEditPanelProps {
  board: BoardSummary;
  onClose: () => void;
}

interface Status {
  tone: "success" | "error";
  message: string;
}

function updateErrorMessage(error: unknown): string {
  if (error instanceof NetworkError)
    return "We couldn’t reach Ksat. Check your connection and try again.";
  if (error instanceof ApiError) {
    if (error.status === 403) return "You don’t have permission to edit this board.";
    if (error.status === 404) return "This board is no longer available to you.";
    if (error.status === 409)
      return "This board changed while you were editing. The latest version is loaded below.";
  }
  return "We couldn’t save the board. Please try again.";
}

export function BoardEditPanel({ board, onClose }: BoardEditPanelProps) {
  const queryClient = useQueryClient();
  const nameId = useId();
  const descriptionId = useId();
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const form = useForm<UpdateBoardRequest>({
    resolver: zodResolver(updateBoardRequestSchema),
    defaultValues: {
      name: board.name,
      description: board.description ?? "",
      version: board.version,
    },
    mode: "onSubmit",
  });
  const mutation = useMutation({
    mutationFn: (values: UpdateBoardRequest) => updateBoard(board.id, values),
  });
  const isPending = mutation.isPending;
  const nameError = form.formState.errors.name?.message;
  const descriptionError = form.formState.errors.description?.message;
  const nameField = form.register("name");

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    setStatus(null);
    form.clearErrors();
    try {
      const updated = await mutation.mutateAsync(values);
      queryClient.setQueryData(queryKeys.board(board.id), updated);
      form.reset({
        name: updated.name,
        description: updated.description ?? "",
        version: updated.version,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.boards() });
      setStatus({ tone: "success", message: "Board details saved." });
    } catch (error) {
      if (error instanceof ApiError) {
        for (const issue of error.fieldErrors) {
          if (issue.path === "name" || issue.path === "description") {
            form.setError(issue.path, { message: issue.message });
          }
        }
        if (error.status === 409) {
          try {
            const latest = await queryClient.fetchQuery({
              queryKey: queryKeys.board(board.id),
              queryFn: () => fetchBoard(board.id),
              staleTime: 0,
            });
            form.reset({
              name: latest.name,
              description: latest.description ?? "",
              version: latest.version,
            });
            await queryClient.invalidateQueries({ queryKey: queryKeys.boards() });
          } catch {
            // Keep the conflict message if the recovery request is also unavailable.
          }
        }
      }
      setStatus({ tone: "error", message: updateErrorMessage(error) });
    }
  });

  return (
    <section className={styles.panel} id="edit-board-panel" aria-labelledby="edit-board-heading">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Board settings</p>
          <h2 className={styles.title} id="edit-board-heading">
            Edit board
          </h2>
        </div>
        <span className={styles.version} aria-label={`Editing version ${board.version}`}>
          v{board.version}
        </span>
      </div>
      <p className={styles.help} id="edit-board-help">
        Update the shared name and description. Your changes are checked against the version you
        opened.
      </p>
      <form
        className={styles.form}
        noValidate
        aria-busy={isPending}
        onSubmit={(event) => void onSubmit(event)}
      >
        <div className={styles.field}>
          <label htmlFor={nameId}>Board name</label>
          <input
            {...nameField}
            id={nameId}
            ref={(node) => {
              nameField.ref(node);
              nameInputRef.current = node;
            }}
            type="text"
            maxLength={120}
            autoComplete="off"
            disabled={isPending}
            aria-invalid={nameError === undefined ? "false" : "true"}
            aria-describedby={
              nameError === undefined ? "edit-board-help" : `edit-board-help ${nameId}-error`
            }
          />
          {nameError === undefined ? null : (
            <span className={styles.fieldError} id={`${nameId}-error`} role="alert">
              {nameError}
            </span>
          )}
        </div>
        <div className={styles.field}>
          <label htmlFor={descriptionId}>Description</label>
          <textarea
            {...form.register("description")}
            id={descriptionId}
            rows={4}
            maxLength={2000}
            disabled={isPending}
            aria-invalid={descriptionError === undefined ? "false" : "true"}
            aria-describedby={
              descriptionError === undefined
                ? "edit-board-help"
                : `edit-board-help ${descriptionId}-error`
            }
          />
          {descriptionError === undefined ? null : (
            <span className={styles.fieldError} id={`${descriptionId}-error`} role="alert">
              {descriptionError}
            </span>
          )}
        </div>
        <div className={styles.actions}>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </button>
          <button className={styles.primaryButton} type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
      {status === null ? null : (
        <p
          className={status.tone === "error" ? styles.errorStatus : styles.successStatus}
          role={status.tone === "error" ? "alert" : "status"}
          aria-live={status.tone === "error" ? "assertive" : "polite"}
        >
          {status.message}
        </p>
      )}
    </section>
  );
}
