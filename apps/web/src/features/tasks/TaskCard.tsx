import type { Task, TaskPriority } from "@ksat/contracts";
import statusCompleteIcon from "../../assets/tasks/status-complete.svg";
import { PRIORITY_LABELS } from "./taskBoard";
import styles from "./TaskCard.module.scss";

interface TaskCardProps {
  task: Task;
  /** Presentational copy rendered while dragging; the interactive title is omitted. */
  isOverlay?: boolean;
  isDragging?: boolean;
  /** Briefly highlights the card that just moved to this column. */
  isNewlyMoved?: boolean;
  /** Opens the task dialog. Omitted for the drag overlay copy. */
  onOpen?: ((task: Task) => void) | undefined;
}

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  HIGH: styles.priorityHigh,
  MEDIUM: styles.priorityMedium,
  LOW: styles.priorityLow,
};

/**
 * A task card. Clicking anywhere on it opens the task dialog, where the name,
 * column, priority, and deletion are handled; dragging it moves it between
 * columns. Only name, status, priority, sequence, and creator are in scope for
 * this slice, so the prototype's assignee, due date, dependency, attachment,
 * tag, and recurrence rows are omitted rather than filled with placeholder data.
 */
export function TaskCard({
  task,
  isOverlay = false,
  isDragging = false,
  isNewlyMoved = false,
  onOpen,
}: TaskCardProps) {
  const titleId = `task-title-${task.id}`;
  const isCompleted = task.status === "COMPLETED";
  const className = [
    styles.card,
    isCompleted ? styles.cardCompleted : "",
    isNewlyMoved ? styles.cardMoved : "",
  ]
    .filter((value) => value !== "")
    .join(" ");

  return (
    <article
      className={className}
      aria-labelledby={titleId}
      data-dragging={isDragging ? "true" : undefined}
      data-overlay={isOverlay ? "true" : undefined}
    >
      <div className={styles.cardTop}>
        {isCompleted ? (
          <span className={styles.completedBadge}>
            <img src={statusCompleteIcon} alt="" width={7.471} height={5.511} />
            Completed
          </span>
        ) : (
          <span className={`${styles.priorityChip} ${PRIORITY_CLASS[task.priority]}`}>
            {PRIORITY_LABELS[task.priority]}
          </span>
        )}
      </div>
      <h3 className={styles.title} id={titleId}>
        {isOverlay || onOpen === undefined ? (
          task.name
        ) : (
          <button
            className={styles.openButton}
            id={`task-open-${task.id}`}
            type="button"
            onClick={() => onOpen(task)}
          >
            {task.name}
          </button>
        )}
      </h3>
      <p className={styles.meta}>
        <span className={styles.sequence}>#{task.sequence}</span>
        <span className={styles.creator}>{task.createdBy.name}</span>
      </p>
    </article>
  );
}
