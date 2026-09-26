import { useState } from "react";
import type { Task } from "@ksat/contracts";
import { taskMutationErrorMessage } from "./taskBoard";
import { useDialogKeyboard } from "./useDialogKeyboard";
import styles from "./TaskDeleteDialog.module.scss";

interface TaskDeleteDialogProps {
  task: Task;
  onClose: () => void;
  onConfirm: () => Promise<unknown>;
}

/** Deleting is immediate and permanent in this slice, so it always asks first. */
export function TaskDeleteDialog({ task, onClose, onConfirm }: TaskDeleteDialogProps) {
  const { dialogRef, handleKeyDown, isBusy, setIsBusy } = useDialogKeyboard(onClose);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setError(null);
    setIsBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (failure) {
      setError(taskMutationErrorMessage(failure));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-task-heading"
        aria-describedby="delete-task-help"
        onKeyDown={handleKeyDown}
      >
        <h2 className={styles.title} id="delete-task-heading">
          Delete this task?
        </h2>
        <p className={styles.help} id="delete-task-help">
          “{task.name}” will be removed from the board. This cannot be undone.
        </p>
        {error === null ? null : (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button
            className={styles.secondary}
            type="button"
            onClick={onClose}
            disabled={isBusy}
            autoFocus
          >
            Keep task
          </button>
          <button
            className={styles.danger}
            type="button"
            onClick={() => void confirm()}
            disabled={isBusy}
          >
            {isBusy ? "Deleting…" : "Delete task"}
          </button>
        </div>
      </section>
    </div>
  );
}
