import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { activeTaskStatusSchema, type ActiveTaskStatus, type Task } from "@ksat/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import archiveIcon from "../../assets/tasks/archive-toggle.svg";
import settingsIcon from "../../assets/boards/board-settings.svg";
import newTaskPlus from "../../assets/tasks/new-task-plus.svg";
import searchIcon from "../../assets/tasks/board-search.svg";
import chevronIcon from "../../assets/tasks/select-chevron.svg";
import { AppShell } from "../../components/AppShell/AppShell";
import { Toast, type ToastTone } from "../../components/Toast/Toast";
import { fetchBoard } from "../../lib/api/boards";
import { ApiError } from "../../lib/api/client";
import { queryKeys } from "../../lib/api/queryKeys";
import { fetchBoardTasks } from "../../lib/api/tasks";
import { TaskCard } from "./TaskCard";
import { TaskColumn } from "./TaskColumn";
import { TaskDeleteDialog } from "./TaskDeleteDialog";
import { TaskDialog, type TaskDialogValues } from "./TaskDialog";
import {
  TASK_COLUMNS,
  columnTitle,
  groupTasksByStatus,
  taskBoardErrorMessage,
  taskMutationErrorMessage,
} from "./taskBoard";
import { useTaskMutations } from "./useTaskMutations";
import styles from "./TaskBoardPage.module.scss";

interface TaskNotice {
  /** Restarts the toast countdown for each new message. */
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: string;
}

/** Column ids arrive from droppable ids, so they are validated rather than asserted. */
function activeStatusOf(value: unknown): ActiveTaskStatus | null {
  const parsed = activeTaskStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function TaskBoardPage() {
  const { boardId = "" } = useParams();
  const boardQuery = useQuery({
    queryKey: queryKeys.board(boardId),
    queryFn: ({ signal }) => fetchBoard(boardId, signal),
    enabled: boardId.length > 0,
  });
  const tasksQuery = useInfiniteQuery({
    queryKey: queryKeys.boardTasks(boardId),
    queryFn: ({ pageParam, signal }) => fetchBoardTasks(boardId, { cursor: pageParam, signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: boardId.length > 0,
  });
  const { createMutation, updateMutation, deleteMutation } = useTaskMutations(boardId);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [notice, setNotice] = useState<TaskNotice | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [movedTaskId, setMovedTaskId] = useState<string | null>(null);
  const noticeIdRef = useRef(0);
  /** Set from the clicked control so focus returns to whichever CTA opened the dialog. */
  const createTriggerRef = useRef<HTMLElement | null>(null);
  const newTaskRef = useRef<HTMLButtonElement | null>(null);
  const movedTimerRef = useRef<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(
    () => () => {
      if (movedTimerRef.current !== null) window.clearTimeout(movedTimerRef.current);
    },
    [],
  );

  const board = boardQuery.data;
  const tasks = tasksQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const grouped = groupTasksByStatus(tasks);
  const draggedTask = tasks.find((task) => task.id === draggingId) ?? null;
  const isNotFound =
    boardQuery.isError && boardQuery.error instanceof ApiError && boardQuery.error.status === 404;

  const openCreate = (trigger: HTMLElement | null) => {
    createTriggerRef.current = trigger;
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    requestAnimationFrame(() => createTriggerRef.current?.focus());
  };

  /**
   * Status feedback floats outside the board in a toast, so it never displaces the
   * columns and is announced through the toast's live region.
   */
  const notify = useCallback((tone: ToastTone, message: string) => {
    noticeIdRef.current += 1;
    setNotice({ id: noticeIdRef.current, tone, message });
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  /** Highlights the card that just landed in its new column. */
  const flagMovedTask = (taskId: string) => {
    setMovedTaskId(taskId);
    if (movedTimerRef.current !== null) window.clearTimeout(movedTimerRef.current);
    movedTimerRef.current = window.setTimeout(() => setMovedTaskId(null), 1_500);
  };

  const moveTask = async (task: Task, status: ActiveTaskStatus) => {
    dismissNotice();
    try {
      await updateMutation.mutateAsync({
        task,
        name: task.name,
        status,
        priority: task.priority,
      });
      flagMovedTask(task.id);
      notify("success", `Moved “${task.name}” to ${columnTitle(status)}.`);
    } catch (error) {
      notify("error", taskMutationErrorMessage(error));
    }
  };

  const submitEdit = async (task: Task, values: TaskDialogValues) => {
    await updateMutation.mutateAsync({ task, ...values });
    if (values.status === task.status) {
      notify("success", `Saved “${values.name}”.`);
      return;
    }
    flagMovedTask(task.id);
    notify("success", `Moved “${values.name}” to ${columnTitle(values.status)}.`);
  };

  const closeEdit = () => {
    const task = editing;
    setEditing(null);
    // The card may sit in a different column now, so restore focus by its stable id.
    if (task !== null) {
      requestAnimationFrame(() => document.getElementById(`task-open-${task.id}`)?.focus());
    }
  };

  const closeDelete = () => {
    setPendingDelete(null);
    requestAnimationFrame(() => newTaskRef.current?.focus());
  };

  const handleDragStart = (event: DragStartEvent) => setDraggingId(String(event.active.id));

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingId(null);
    const status = activeStatusOf(event.over?.id);
    if (status === null) return;
    const task = tasks.find((candidate) => candidate.id === String(event.active.id));
    if (!task || task.status === status) return;
    void moveTask(task, status);
  };

  if (isNotFound) {
    return (
      <AppShell>
        <section className={styles.statePanel} aria-labelledby="task-board-not-found-heading">
          <p className={styles.stateEyebrow}>Board unavailable</p>
          <h1 className={styles.stateTitle} id="task-board-not-found-heading">
            We couldn’t find that board
          </h1>
          <p className={styles.stateText}>
            The board may have been removed, or your membership may have ended. Only board members
            can open a board.
          </p>
          <Link className={styles.stateAction} to="/boards">
            Back to boards
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell onNewTask={(trigger) => openCreate(trigger)}>
      <div className={styles.page}>
        {boardQuery.isPending ? (
          <div className={styles.loading} role="status" aria-live="polite">
            <span className="visually-hidden">Loading the board…</span>
            <div className={styles.skeletonHeader} aria-hidden="true">
              <div className={styles.skeletonTitle} />
              <div className={styles.skeletonLine} />
            </div>
          </div>
        ) : null}

        {boardQuery.isError && !isNotFound ? (
          <section className={styles.statePanel} aria-labelledby="task-board-error-heading">
            <p className={styles.stateEyebrow}>Board unavailable</p>
            <h1 className={styles.stateTitle} id="task-board-error-heading">
              We couldn’t load this board
            </h1>
            <p className={styles.stateText} role="alert">
              {taskBoardErrorMessage(boardQuery.error)}
            </p>
            <button
              className={styles.stateAction}
              type="button"
              disabled={boardQuery.isFetching}
              onClick={() => void boardQuery.refetch()}
            >
              {boardQuery.isFetching ? "Retrying…" : "Retry"}
            </button>
          </section>
        ) : null}

        {board ? (
          <>
            <header className={styles.pageHeader}>
              <div className={styles.headerTop}>
                <div>
                  <h1 className={styles.pageTitle}>{board.name}</h1>
                  <p className={styles.description}>
                    {board.description ?? "No description has been added to this board yet."}
                  </p>
                </div>
                <Link className={styles.settingsButton} to={`/boards/${board.id}/settings`}>
                  <img src={settingsIcon} alt="" width={15.075} height={15} />
                  <span>Settings</span>
                </Link>
              </div>
            </header>

            <section className={styles.controls} aria-label="Board controls">
              <div className={styles.searchField}>
                <img src={searchIcon} alt="" width={13.5} height={13.5} />
                <input
                  type="search"
                  placeholder="Search tasks… [ / ]"
                  aria-label="Search tasks"
                  aria-describedby="board-deferred-controls"
                  disabled
                />
              </div>
              <div className={styles.controlGroup}>
                {["Assignee: All", "Priority: All", "Sort: Due date"].map((label) => (
                  <span className={styles.selectShell} key={label}>
                    <select aria-label={label} aria-describedby="board-deferred-controls" disabled>
                      <option>{label}</option>
                    </select>
                    <img src={chevronIcon} alt="" width={18} height={18} />
                  </span>
                ))}
                <button
                  className={styles.archiveToggle}
                  type="button"
                  aria-describedby="board-deferred-controls"
                  disabled
                >
                  <img src={archiveIcon} alt="" width={11.667} height={11.667} />
                  <span>Archive</span>
                </button>
                <button
                  ref={newTaskRef}
                  className={styles.newTask}
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={createOpen}
                  onClick={(event) => openCreate(event.currentTarget)}
                >
                  <img src={newTaskPlus} alt="" width={8.167} height={8.167} />
                  <span>New Task</span>
                </button>
              </div>
              <p className="visually-hidden" id="board-deferred-controls">
                Search, assignee and priority filters, sorting, and the archive column arrive in a
                later delivery phase. Archive stays hidden until then.
              </p>
            </section>

            {tasksQuery.isError ? (
              <section className={styles.statePanel} aria-labelledby="tasks-error-heading">
                <h2 className={styles.stateTitle} id="tasks-error-heading">
                  We couldn’t load these tasks
                </h2>
                <p className={styles.stateText} role="alert">
                  {taskBoardErrorMessage(tasksQuery.error)}
                </p>
                <button
                  className={styles.stateAction}
                  type="button"
                  disabled={tasksQuery.isFetching}
                  onClick={() => void tasksQuery.refetch()}
                >
                  {tasksQuery.isFetching ? "Retrying…" : "Retry"}
                </button>
              </section>
            ) : null}

            {tasksQuery.isPending ? (
              <div className={styles.columns} role="status" aria-live="polite">
                <span className="visually-hidden">Loading tasks…</span>
                {TASK_COLUMNS.map((column) => (
                  <div className={styles.columnSkeleton} key={column.status} aria-hidden="true">
                    <div className={styles.skeletonColumnHeader} />
                    <div className={styles.skeletonCard} />
                    <div className={styles.skeletonCard} />
                  </div>
                ))}
              </div>
            ) : null}

            {!tasksQuery.isPending && !tasksQuery.isError ? (
              <>
                {tasks.length === 0 ? (
                  <section className={styles.emptyBoard} aria-labelledby="tasks-empty-heading">
                    <h2 className={styles.stateTitle} id="tasks-empty-heading">
                      No tasks on this board yet
                    </h2>
                    <p className={styles.stateText}>
                      Create the first task, then move it from Not Started through In Progress to
                      Completed.
                    </p>
                  </section>
                ) : null}
                <DndContext
                  // Auto-scroll stays off: holding a card near a viewport edge used to
                  // scroll the page under the pointer instead of the board. A card can
                  // now be carried anywhere on screen without the layout moving.
                  autoScroll={false}
                  collisionDetection={closestCenter}
                  sensors={sensors}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragCancel={() => setDraggingId(null)}
                >
                  <div className={styles.columns}>
                    {TASK_COLUMNS.map((column) => (
                      <TaskColumn
                        column={column}
                        key={column.status}
                        movedTaskId={movedTaskId}
                        tasks={grouped[column.status]}
                        onOpen={setEditing}
                      />
                    ))}
                  </div>
                  {/* The overlay is never animated back to the source card: after a move the
                      card lives in another column, so an arrival highlight marks the real drop. */}
                  <DragOverlay dropAnimation={null}>
                    {draggedTask === null ? null : <TaskCard task={draggedTask} isOverlay />}
                  </DragOverlay>
                </DndContext>
                {tasksQuery.hasNextPage ? (
                  <div className={styles.loadMore}>
                    <button
                      className={styles.loadMoreButton}
                      type="button"
                      disabled={tasksQuery.isFetchingNextPage}
                      onClick={() => void tasksQuery.fetchNextPage()}
                    >
                      {tasksQuery.isFetchingNextPage ? "Loading…" : "Load more tasks"}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {createOpen ? (
        <TaskDialog
          onClose={closeCreate}
          onSubmit={(values: TaskDialogValues) => createMutation.mutateAsync(values)}
        />
      ) : null}
      {editing === null ? null : (
        <TaskDialog
          task={editing}
          onClose={closeEdit}
          onRequestDelete={() => {
            setPendingDelete(editing);
            setEditing(null);
          }}
          onSubmit={(values) => submitEdit(editing, values)}
        />
      )}
      {pendingDelete === null ? null : (
        <TaskDeleteDialog
          task={pendingDelete}
          onClose={closeDelete}
          onConfirm={async () => {
            await deleteMutation.mutateAsync(pendingDelete);
            notify("success", `Deleted “${pendingDelete.name}”.`);
          }}
        />
      )}
      {/* Portaled to the document body, so confirmations float clear of the board. */}
      <Toast
        key={notice?.id}
        message={notice?.message ?? ""}
        onDismiss={dismissNotice}
        tone={notice?.tone ?? "success"}
      />
    </AppShell>
  );
}
