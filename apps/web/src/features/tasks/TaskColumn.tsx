import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useEffect, useRef } from "react";
import type { Task } from "@ksat/contracts";
import { TaskCard } from "./TaskCard";
import type { TaskColumnDefinition } from "./taskBoard";
import styles from "./TaskColumn.module.scss";

const TONE_CLASS = {
  neutral: styles.toneNeutral,
  progress: styles.toneProgress,
  complete: styles.toneComplete,
} as const;

interface TaskColumnProps {
  column: TaskColumnDefinition;
  tasks: readonly Task[];
  movedTaskId: string | null;
  onOpen: (task: Task) => void;
}

interface DraggableCardProps {
  task: Task;
  isNewlyMoved: boolean;
  onOpen: (task: Task) => void;
}

/**
 * Pointer dragging is enabled with a distance threshold, so a single click still
 * opens the task dialog. A click that ends a drag is suppressed, and keyboard users
 * change a task's column through the dialog's column field instead of dragging.
 */
function DraggableCard({ task, isNewlyMoved, onOpen }: DraggableCardProps) {
  // The overlay is the card that follows the pointer, so the original is left
  // untransformed: it stays in its column, dimmed, as the place the card left.
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const wasDragged = useRef(false);

  useEffect(() => {
    if (isDragging) wasDragged.current = true;
  }, [isDragging]);

  return (
    <div
      className={styles.draggable}
      ref={setNodeRef}
      {...listeners}
      onPointerDownCapture={() => {
        wasDragged.current = false;
      }}
      onClickCapture={(event) => {
        if (!wasDragged.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <TaskCard task={task} isDragging={isDragging} isNewlyMoved={isNewlyMoved} onOpen={onOpen} />
    </div>
  );
}

export function TaskColumn({ column, tasks, movedTaskId, onOpen }: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  const headingId = `column-heading-${column.status}`;

  return (
    <section
      className={styles.column}
      ref={setNodeRef}
      aria-labelledby={headingId}
      data-over={isOver ? "true" : undefined}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={`${styles.dot} ${TONE_CLASS[column.tone]}`} aria-hidden="true" />
          <h2 className={styles.title} id={headingId}>
            {column.title}
          </h2>
          <span className={styles.count} aria-hidden="true">
            {String(tasks.length).padStart(2, "0")}
          </span>
        </div>
        <span className={`${styles.stage} ${TONE_CLASS[column.tone]}`} aria-hidden="true">
          {column.stage}
        </span>
      </header>
      <p className="visually-hidden">
        {tasks.length} {tasks.length === 1 ? "task" : "tasks"} loaded in {column.title}.
      </p>
      <ul className={styles.cards}>
        {tasks.map((task) => (
          <li className={styles.cardItem} key={task.id}>
            <DraggableCard task={task} isNewlyMoved={movedTaskId === task.id} onOpen={onOpen} />
          </li>
        ))}
      </ul>
      {tasks.length === 0 ? <p className={styles.empty}>No tasks in this column yet.</p> : null}
    </section>
  );
}
