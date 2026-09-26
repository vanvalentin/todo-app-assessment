import { zodResolver } from "@hookform/resolvers/zod";
import {
  activeTaskStatusSchema,
  taskPrioritySchema,
  TASK_NAME_MAX_LENGTH,
  type ActiveTaskStatus,
  type Task,
  type TaskPriority,
} from "@ksat/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "../../lib/api/client";
import { PRIORITY_LABELS, TASK_COLUMNS, taskMutationErrorMessage } from "./taskBoard";
import { useDialogKeyboard } from "./useDialogKeyboard";
import styles from "./TaskDialog.module.scss";

const taskFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the task a name.")
    .max(TASK_NAME_MAX_LENGTH, `Keep the name under ${TASK_NAME_MAX_LENGTH} characters.`),
  status: activeTaskStatusSchema,
  priority: taskPrioritySchema,
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

export interface TaskDialogValues {
  readonly name: string;
  readonly status: ActiveTaskStatus;
  readonly priority: TaskPriority;
}

interface TaskDialogProps {
  /** Editing an existing task; omitted while creating a new one. */
  task?: Task;
  /** Column preselected when creating from a specific column. */
  initialStatus?: ActiveTaskStatus;
  onClose: () => void;
  onSubmit: (values: TaskDialogValues) => Promise<unknown>;
  /** Editing only: hands deletion to the confirmation dialog. */
  onRequestDelete?: (() => void) | undefined;
}

/**
 * Create and edit dialog. This slice owns name, status, and priority only; the full
 * Figma task modals add assignee, reporter, and dates in the next slice.
 */
export function TaskDialog({
  task,
  initialStatus = "NOT_STARTED",
  onClose,
  onSubmit,
  onRequestDelete,
}: TaskDialogProps) {
  const titleId = useId();
  const nameId = useId();
  const statusId = useId();
  const priorityId = useId();
  const helpId = useId();
  const { dialogRef, handleKeyDown, isBusy, setIsBusy } = useDialogKeyboard(onClose);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isEditing = task !== undefined;
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      name: task?.name ?? "",
      status: task?.status === "ARCHIVED" || task === undefined ? initialStatus : task.status,
      priority: task?.priority ?? "MEDIUM",
    },
  });
  const nameField = form.register("name");
  const nameError = form.formState.errors.name?.message;
  const statusError = form.formState.errors.status?.message;
  const priorityError = form.formState.errors.priority?.message;

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const submit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    form.clearErrors();
    setIsBusy(true);
    try {
      await onSubmit(values);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        for (const issue of error.fieldErrors) {
          if (issue.path === "name" || issue.path === "status" || issue.path === "priority") {
            form.setError(issue.path, { message: issue.message });
          }
        }
      }
      setSubmitError(taskMutationErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  });

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={helpId}
        onKeyDown={handleKeyDown}
      >
        <p className={styles.eyebrow}>{isEditing ? "Task detail" : "New task"}</p>
        <h2 className={styles.title} id={titleId}>
          {isEditing ? "Edit task" : "Create a task"}
        </h2>
        <p className={styles.help} id={helpId}>
          {isEditing
            ? "Name, column, and priority. Changes are checked against the version you opened."
            : "Tasks start in the column you choose and keep their board sequence number."}
        </p>
        <form
          className={styles.form}
          noValidate
          aria-busy={isBusy}
          onSubmit={(event) => void submit(event)}
        >
          <div className={styles.field}>
            <label htmlFor={nameId}>Task name</label>
            <input
              {...nameField}
              id={nameId}
              ref={(node) => {
                nameField.ref(node);
                nameInputRef.current = node;
              }}
              type="text"
              maxLength={TASK_NAME_MAX_LENGTH}
              autoComplete="off"
              disabled={isBusy}
              aria-invalid={nameError === undefined ? "false" : "true"}
              aria-describedby={nameError === undefined ? helpId : `${helpId} ${nameId}-error`}
            />
            {nameError === undefined ? null : (
              <span className={styles.fieldError} id={`${nameId}-error`} role="alert">
                {nameError}
              </span>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor={statusId}>Column</label>
            <select {...form.register("status")} id={statusId} disabled={isBusy}>
              {TASK_COLUMNS.map((column) => (
                <option key={column.status} value={column.status}>
                  {column.title}
                </option>
              ))}
            </select>
            {statusError === undefined ? null : (
              <span className={styles.fieldError} role="alert">
                {statusError}
              </span>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor={priorityId}>Priority</label>
            <select {...form.register("priority")} id={priorityId} disabled={isBusy}>
              {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
            {priorityError === undefined ? null : (
              <span className={styles.fieldError} role="alert">
                {priorityError}
              </span>
            )}
          </div>
          {submitError === null ? null : (
            <p className={styles.submitError} role="alert">
              {submitError}
            </p>
          )}
          <div className={styles.actions}>
            {isEditing && onRequestDelete !== undefined ? (
              <button
                className={styles.danger}
                type="button"
                onClick={onRequestDelete}
                disabled={isBusy}
              >
                Delete task
              </button>
            ) : null}
            <div className={styles.actionGroup}>
              <button
                className={styles.secondary}
                type="button"
                onClick={onClose}
                disabled={isBusy}
              >
                Cancel
              </button>
              <button className={styles.primary} type="submit" disabled={isBusy}>
                {isBusy ? "Saving…" : isEditing ? "Save task" : "Create task"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
