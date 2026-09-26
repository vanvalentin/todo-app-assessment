import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import {
  TASK_NAME_MAX_LENGTH,
  type ActiveTaskStatus,
  type CreateTaskRequestInput,
  type Task,
  type TaskPriority,
  type UserPreview,
} from "@ksat/contracts";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import closeIcon from "../../assets/tasks/close.svg";
import expandIcon from "../../assets/tasks/expand.svg";
import trashIcon from "../../assets/tasks/trash.svg";
import { ApiError } from "../../lib/api/client";
import { fetchTask } from "../../lib/api/tasks";
import type { TaskEditValues } from "./useTaskMutations";
import { AssigneePill, DueDatePill, PriorityPill, ReporterPill, StatusPill } from "./PropertyPills";
import { taskMutationErrorMessage } from "./taskBoard";
import { useBoardMembers, withKnownPerson } from "./useBoardMembers";
import styles from "./TaskModal.module.scss";

const nameFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the task a name.")
    .max(TASK_NAME_MAX_LENGTH, `Keep the name under ${TASK_NAME_MAX_LENGTH} characters.`),
});
type NameFormValues = z.infer<typeof nameFormSchema>;

export interface TaskModalProps {
  readonly boardId: string;
  readonly boardName: string;
  readonly currentUser: UserPreview;
  /** Editing an existing task; omitted while creating a new one. */
  readonly task?: Task;
  /** Column preselected when creating from a specific column. */
  readonly initialStatus?: ActiveTaskStatus;
  readonly onClose: () => void;
  readonly onCreate: (values: CreateTaskRequestInput) => Promise<unknown>;
  readonly onSave: (values: TaskEditValues) => Promise<unknown>;
  /** Editing only: hands deletion to the confirmation dialog. */
  readonly onRequestDelete?: (() => void) | undefined;
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The designed create/edit modal (Figma `1:1045`, `1:479`). Description, tags,
 * dependencies, and attachments are later-phase content and are omitted rather than
 * rendered disabled, matching how phase 4a handled data that did not exist yet.
 */
export function TaskModal({
  boardId,
  boardName,
  currentUser,
  task,
  initialStatus = "NOT_STARTED",
  onClose,
  onCreate,
  onSave,
  onRequestDelete,
}: TaskModalProps) {
  const isEditing = task !== undefined;
  const titleId = useId();
  const nameId = useId();
  const helpId = useId();
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createMore, setCreateMore] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [baselineTask, setBaselineTask] = useState<Task | undefined>(task);
  const [assigneeError, setAssigneeError] = useState<string | null>(null);
  const [reporterError, setReporterError] = useState<string | null>(null);

  const [status, setStatus] = useState<ActiveTaskStatus>(
    task && task.status !== "ARCHIVED" ? task.status : initialStatus,
  );
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "MEDIUM");
  const [assignee, setAssignee] = useState<UserPreview | null>(task?.assignee ?? null);
  const [reporter, setReporter] = useState<UserPreview>(task?.reporter ?? currentUser);
  const [dueDate, setDueDate] = useState<string | null>(task?.dueDate ?? null);

  const { members } = useBoardMembers(boardId);
  const assigneeOptions = withKnownPerson(members, assignee);
  const reporterOptions = withKnownPerson(members, reporter);

  const form = useForm<NameFormValues>({
    resolver: zodResolver(nameFormSchema),
    defaultValues: { name: task?.name ?? "" },
  });
  const nameField = form.register("name");
  const nameError = form.formState.errors.name?.message;

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const markDirty = () => setIsDirty(true);

  const resetFormFrom = (latest: Task) => {
    setBaselineTask(latest);
    form.reset({ name: latest.name });
    setStatus(latest.status === "ARCHIVED" ? initialStatus : latest.status);
    setPriority(latest.priority);
    setAssignee(latest.assignee);
    setReporter(latest.reporter);
    setDueDate(latest.dueDate);
    setAssigneeError(null);
    setReporterError(null);
    setIsDirty(false);
  };

  const reloadLatest = async () => {
    if (!task) return;
    try {
      const latest = await fetchTask(task.id);
      resetFormFrom(latest);
      setSubmitError(null);
    } catch {
      // Leave the conflict message in place; the retry control stays available.
    }
  };

  const submit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    setAssigneeError(null);
    setReporterError(null);
    setIsBusy(true);
    try {
      if (isEditing && baselineTask) {
        await onSave({
          task: baselineTask,
          name: values.name,
          status,
          priority,
          assignee,
          reporter,
          dueDate,
        });
        onClose();
      } else {
        await onCreate({
          name: values.name,
          status,
          priority,
          assigneeId: assignee?.id ?? null,
          reporterId: reporter.id,
          dueDate,
        });
        if (createMore) {
          form.reset({ name: "" });
          setIsDirty(false);
          nameInputRef.current?.focus();
        } else {
          onClose();
        }
      }
    } catch (error) {
      if (error instanceof ApiError) {
        for (const issue of error.fieldErrors) {
          if (issue.path === "name") form.setError("name", { message: issue.message });
        }
        if (error.code === "TASK_ASSIGNEE_NOT_MEMBER") {
          setAssigneeError("Choose an active board member or leave the task unassigned.");
        }
        if (error.code === "TASK_REPORTER_NOT_MEMBER") {
          setReporterError("Choose an active board member as reporter.");
        }
      }
      setSubmitError(taskMutationErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  });

  const handleFormKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  };

  const breadcrumb = isEditing ? `Task #${task.sequence}` : "New task";

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !isBusy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={`${styles.content} ${isExpanded ? styles.contentExpanded : ""}`}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameInputRef.current?.focus();
          }}
          onEscapeKeyDown={(event) => isBusy && event.preventDefault()}
          onInteractOutside={(event) => isBusy && event.preventDefault()}
        >
          <Dialog.Title className={styles.visuallyHiddenTitle} id={titleId}>
            {isEditing ? `Edit task: ${task.name}` : "Create a task"}
          </Dialog.Title>
          <Dialog.Description className={styles.visuallyHiddenTitle} id={helpId}>
            {isEditing
              ? "Edit the task's name, status, priority, assignee, reporter, and due date."
              : "Create a task with a name, status, priority, assignee, reporter, and due date."}
          </Dialog.Description>

          <header className={styles.header}>
            <div className={styles.breadcrumb}>
              <span className={styles.breadcrumbChip}>Ksat</span>
              <span aria-hidden="true">/</span>
              <span>{boardName}</span>
              <span aria-hidden="true">/</span>
              <strong>{breadcrumb}</strong>
            </div>
            <div className={styles.headerRight}>
              {isEditing ? (
                <span className={styles.saveState} aria-live="polite">
                  {isDirty ? "Unsaved changes" : "Saved"}
                </span>
              ) : null}
              <button
                className={styles.iconButton}
                type="button"
                aria-label={isExpanded ? "Collapse" : "Expand"}
                aria-pressed={isExpanded}
                onClick={() => setIsExpanded((value) => !value)}
              >
                <img src={expandIcon} alt="" width={12} height={12} />
              </button>
              <Dialog.Close asChild>
                <button className={styles.iconButton} type="button" disabled={isBusy}>
                  <img src={closeIcon} alt="Close" width={12} height={12} />
                </button>
              </Dialog.Close>
            </div>
          </header>

          <form
            className={styles.form}
            noValidate
            aria-busy={isBusy}
            onChange={markDirty}
            onKeyDown={handleFormKeyDown}
            onSubmit={(event) => void submit(event)}
          >
            <div className={styles.titleField}>
              <label className="visually-hidden" htmlFor={nameId}>
                Task name
              </label>
              <input
                {...nameField}
                id={nameId}
                ref={(node) => {
                  nameField.ref(node);
                  nameInputRef.current = node;
                }}
                className={styles.titleInput}
                type="text"
                placeholder="Task name"
                maxLength={TASK_NAME_MAX_LENGTH}
                autoComplete="off"
                disabled={isBusy}
                aria-invalid={nameError === undefined ? "false" : "true"}
                aria-describedby={helpId}
              />
              {nameError === undefined ? null : (
                <span className={styles.fieldError} role="alert">
                  {nameError}
                </span>
              )}
            </div>

            <div className={styles.pillRow}>
              <StatusPill
                value={status}
                onChange={(next) => {
                  setStatus(next);
                  markDirty();
                }}
                disabled={isBusy}
              />
              <PriorityPill
                value={priority}
                onChange={(next) => {
                  setPriority(next);
                  markDirty();
                }}
                disabled={isBusy}
              />
              <AssigneePill
                value={assignee}
                members={assigneeOptions}
                onChange={(next) => {
                  setAssignee(next);
                  setAssigneeError(null);
                  markDirty();
                }}
                invalid={assigneeError !== null}
                disabled={isBusy}
              />
              <DueDatePill
                value={dueDate}
                onChange={(next) => {
                  setDueDate(next);
                  markDirty();
                }}
                disabled={isBusy}
              />
              <ReporterPill
                value={reporter}
                members={reporterOptions}
                onChange={(next) => {
                  setReporter(next);
                  setReporterError(null);
                  markDirty();
                }}
                invalid={reporterError !== null}
                disabled={isBusy}
              />
            </div>
            {assigneeError === null ? null : (
              <p className={styles.fieldError} role="alert">
                {assigneeError}
              </p>
            )}
            {reporterError === null ? null : (
              <p className={styles.fieldError} role="alert">
                {reporterError}
              </p>
            )}

            {submitError === null ? null : (
              <div className={styles.submitError} role="alert">
                <p>{submitError}</p>
                {isEditing ? (
                  <button
                    className={styles.reloadButton}
                    type="button"
                    onClick={() => void reloadLatest()}
                  >
                    Reload latest
                  </button>
                ) : null}
              </div>
            )}

            <div className={styles.footer}>
              {isEditing && task ? (
                <p className={styles.metaText}>
                  Created by {task.createdBy.name} · updated {formatUpdatedAt(task.updatedAt)}
                </p>
              ) : null}
              <div className={styles.footerTop}>
                {isEditing && task ? (
                  onRequestDelete === undefined ? (
                    <span />
                  ) : (
                    <button
                      className={styles.deleteButton}
                      type="button"
                      onClick={onRequestDelete}
                      disabled={isBusy}
                    >
                      <img src={trashIcon} alt="" width={12} height={12} />
                      Delete task
                    </button>
                  )
                ) : (
                  <label className={styles.createMore}>
                    <input
                      type="checkbox"
                      checked={createMore}
                      onChange={(event) => setCreateMore(event.target.checked)}
                      disabled={isBusy}
                    />
                    Create more
                  </label>
                )}
                <div className={styles.footerRight}>
                  {isEditing ? (
                    <Dialog.Close asChild>
                      <button className={styles.secondary} type="button" disabled={isBusy}>
                        Discard changes
                      </button>
                    </Dialog.Close>
                  ) : (
                    <Dialog.Close asChild>
                      <button className={styles.secondary} type="button" disabled={isBusy}>
                        Cancel
                      </button>
                    </Dialog.Close>
                  )}
                  <button className={styles.primary} type="submit" disabled={isBusy}>
                    {isBusy ? (
                      "Saving…"
                    ) : isEditing ? (
                      <>
                        Save changes <kbd className={styles.kbd}>Ctrl ↵</kbd>
                      </>
                    ) : (
                      "Create task"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
