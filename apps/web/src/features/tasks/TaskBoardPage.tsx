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
import {
  activeTaskStatusSchema,
  taskBlockingFilterSchema,
  taskDueFilterSchema,
  taskPrioritySchema,
  taskSortSchema,
  taskStatusSchema,
  type Task,
  type TaskStatus,
} from "@ksat/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import archiveIcon from "../../assets/tasks/archive-toggle.svg";
import settingsIcon from "../../assets/boards/board-settings.svg";
import newTaskPlus from "../../assets/tasks/new-task-plus.svg";
import searchIcon from "../../assets/tasks/board-search.svg";
import { AppShell } from "../../components/AppShell/AppShell";
import { Select } from "../../components/Select/Select";
import { Toast, type ToastTone } from "../../components/Toast/Toast";
import { useSession } from "../auth/useSession";
import { fetchBoard } from "../../lib/api/boards";
import { ApiError } from "../../lib/api/client";
import { queryKeys } from "../../lib/api/queryKeys";
import { fetchBoardTasks } from "../../lib/api/tasks";
import { TaskCard } from "./TaskCard";
import { TaskColumn } from "./TaskColumn";
import { TaskDeleteDialog } from "./TaskDeleteDialog";
import { TaskModal } from "./TaskModal";
import {
  columnTitle,
  groupTasksByStatus,
  taskBoardErrorMessage,
  taskMutationErrorMessage,
  visibleColumns,
} from "./taskBoard";
import { useBoardMembers } from "./useBoardMembers";
import { useTaskBoardSearch } from "./useTaskBoardSearch";
import { useTaskMutations, type TaskEditValues } from "./useTaskMutations";
import styles from "./TaskBoardPage.module.scss";

const ALL_VALUE = "__all__";

interface FilterSelectProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (value: string) => void;
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <Select
      label={label}
      value={value || ALL_VALUE}
      options={options}
      onChange={(next) => onChange(next === ALL_VALUE ? "" : next)}
    />
  );
}
interface TaskNotice {
  /** Restarts the toast countdown for each new message. */
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: string;
}

/** Column ids arrive from droppable ids, so they are validated rather than asserted. */
function statusOf(value: unknown): TaskStatus | null {
  const parsed = taskStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** True while an editable text control (or an open dialog) should own the keystroke. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function TaskBoardPage() {
  const { boardId = "" } = useParams();
  const { session } = useSession();
  const currentUser = session
    ? {
        id: session.user.id,
        name: session.user.name,
        avatarSeed: session.user.avatarSeed ?? session.user.id,
      }
    : null;
  const search = useTaskBoardSearch(currentUser?.id ?? null);
  const { members } = useBoardMembers(boardId, boardId.length > 0);
  const boardQuery = useQuery({
    queryKey: queryKeys.board(boardId),
    queryFn: ({ signal }) => fetchBoard(boardId, signal),
    enabled: boardId.length > 0,
  });
  const tasksQuery = useInfiniteQuery({
    queryKey: queryKeys.boardTasks(boardId, search.filters),
    queryFn: ({ pageParam, signal }) =>
      fetchBoardTasks(boardId, search.filters, { cursor: pageParam, signal }),
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
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(
    () => () => {
      if (movedTimerRef.current !== null) window.clearTimeout(movedTimerRef.current);
    },
    [],
  );

  const isDialogOpen = createOpen || editing !== null || pendingDelete !== null;

  // "/" focuses search, matching the placeholder hint, unless a text control or a
  // dialog already owns keyboard input.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || isDialogOpen || isEditableTarget(event.target)) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDialogOpen]);

  const board = boardQuery.data;
  const tasks = tasksQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const grouped = groupTasksByStatus(tasks);
  const columns = visibleColumns(search.includeArchived);
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

  const moveTask = async (task: Task, status: TaskStatus) => {
    dismissNotice();
    try {
      await updateMutation.mutateAsync({
        task,
        name: task.name,
        status,
        priority: task.priority,
        assignee: task.assignee,
        dueDate: task.dueDate,
        description: task.description,
        dependsOn: task.dependsOn,
        schedule:
          task.recurrence?.schedule === null || task.recurrence?.schedule === undefined
            ? null
            : {
                rrule: task.recurrence.schedule.rrule,
                timezone: task.recurrence.schedule.timezone,
                startLocal: task.recurrence.schedule.startLocal,
                enabled: task.recurrence.schedule.enabled,
              },
      });
      if (status === "ARCHIVED") {
        notify("success", `Archived \u201c${task.name}\u201d.`);
      } else if (task.status === "ARCHIVED") {
        flagMovedTask(task.id);
        notify("success", `Restored \u201c${task.name}\u201d to ${columnTitle(status)}.`);
      } else {
        flagMovedTask(task.id);
        notify("success", `Moved \u201c${task.name}\u201d to ${columnTitle(status)}.`);
      }
    } catch (error) {
      notify("error", taskMutationErrorMessage(error));
    }
  };

  const submitEdit = async (values: TaskEditValues) => {
    await updateMutation.mutateAsync(values);
    if (values.status === values.task.status) {
      notify("success", `Saved \u201c${values.name}\u201d.`);
      return;
    }
    if (values.status === "ARCHIVED") {
      notify("success", `Archived \u201c${values.name}\u201d.`);
      return;
    }
    if (values.task.status === "ARCHIVED") {
      notify("success", `Restored \u201c${values.name}\u201d to ${columnTitle(values.status)}.`);
      return;
    }
    flagMovedTask(values.task.id);
    notify("success", `Moved \u201c${values.name}\u201d to ${columnTitle(values.status)}.`);
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
    const status = statusOf(event.over?.id);
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
              {boardQuery.isFetching ? "Retrying\u2026" : "Retry"}
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
                  ref={searchInputRef}
                  type="search"
                  placeholder="Search tasks… [ / ]"
                  aria-label="Search tasks"
                  value={search.searchInput}
                  onChange={(event) => search.setSearchInput(event.target.value)}
                />
              </div>
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
              <div className={styles.controlGroup}>
                <FilterSelect
                  label="Filter by assignee"
                  value={search.assignee}
                  onChange={search.setAssignee}
                  options={[
                    { value: ALL_VALUE, label: "Assignee: All" },
                    { value: "me", label: "Assignee: Me" },
                    { value: "none", label: "Assignee: Unassigned" },
                    ...members.map((member) => ({
                      value: member.id,
                      label: `Assignee: ${member.name}`,
                    })),
                  ]}
                />
                <FilterSelect
                  label="Filter by priority"
                  value={search.priority}
                  onChange={(value) => {
                    if (value === "") search.setPriority("");
                    else {
                      const parsed = taskPrioritySchema.safeParse(value);
                      if (parsed.success) search.setPriority(parsed.data);
                    }
                  }}
                  options={[
                    { value: ALL_VALUE, label: "Priority: All" },
                    { value: "HIGH", label: "Priority: High" },
                    { value: "MEDIUM", label: "Priority: Medium" },
                    { value: "LOW", label: "Priority: Low" },
                  ]}
                />
                <FilterSelect
                  label="Filter by status"
                  value={search.status}
                  onChange={(value) => {
                    if (value === "") search.setStatus("");
                    else {
                      const parsed = activeTaskStatusSchema.safeParse(value);
                      if (parsed.success) search.setStatus(parsed.data);
                    }
                  }}
                  options={[
                    { value: ALL_VALUE, label: "Status: All" },
                    { value: "NOT_STARTED", label: "Status: Not Started" },
                    { value: "IN_PROGRESS", label: "Status: In Progress" },
                    { value: "COMPLETED", label: "Status: Completed" },
                  ]}
                />
                <FilterSelect
                  label="Filter by blocking state"
                  value={search.blocking}
                  onChange={(value) => {
                    if (value === "") search.setBlocking("");
                    else {
                      const parsed = taskBlockingFilterSchema.safeParse(value);
                      if (parsed.success) search.setBlocking(parsed.data);
                    }
                  }}
                  options={[
                    { value: ALL_VALUE, label: "Blocking: All" },
                    { value: "BLOCKED", label: "Blocking: Blocked" },
                    { value: "UNBLOCKED", label: "Blocking: Unblocked" },
                  ]}
                />
                <FilterSelect
                  label="Filter by due date"
                  value={search.due}
                  onChange={(value) => {
                    if (value === "") search.setDue("");
                    else {
                      const parsed = taskDueFilterSchema.safeParse(value);
                      if (parsed.success) search.setDue(parsed.data);
                    }
                  }}
                  options={[
                    { value: ALL_VALUE, label: "Due: Any" },
                    { value: "OVERDUE", label: "Due: Overdue" },
                    { value: "TODAY", label: "Due: Today" },
                    { value: "NEXT_7_DAYS", label: "Due: Next 7 days" },
                    { value: "NONE", label: "Due: No due date" },
                  ]}
                />
                <FilterSelect
                  label="Sort tasks by"
                  value={search.sort}
                  onChange={(value) => {
                    const parsed = taskSortSchema.safeParse(value);
                    if (parsed.success) search.setSort(parsed.data);
                  }}
                  options={[
                    { value: "DUE_DATE", label: "Sort: Due date" },
                    { value: "PRIORITY", label: "Sort: Priority" },
                    { value: "NEWEST", label: "Sort: Newest" },
                    { value: "OLDEST", label: "Sort: Oldest" },
                    { value: "NAME", label: "Sort: Name (A–Z)" },
                  ]}
                />

                <button
                  className={styles.archiveToggle}
                  type="button"
                  aria-pressed={search.includeArchived}
                  onClick={search.toggleArchived}
                >
                  <img src={archiveIcon} alt="" width={11.667} height={11.667} />
                  <span>{search.includeArchived ? "Hide archived" : "Show archived"}</span>
                </button>
                {search.hasActiveFilters ? (
                  <button
                    className={styles.clearFilters}
                    type="button"
                    onClick={search.clearFilters}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
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
                  {tasksQuery.isFetching ? "Retrying\u2026" : "Retry"}
                </button>
              </section>
            ) : null}

            {tasksQuery.isPending ? (
              <div className={styles.columns} role="status" aria-live="polite">
                <span className="visually-hidden">Loading tasks…</span>
                {columns.map((column) => (
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
                      {search.hasActiveFilters
                        ? "No tasks match these filters"
                        : "No tasks on this board yet"}
                    </h2>
                    <p className={styles.stateText}>
                      {search.hasActiveFilters
                        ? "Try a different search term, or clear the filters to see every task."
                        : "Create the first task, then move it from Not Started through In Progress to Completed."}
                    </p>
                    {search.hasActiveFilters ? (
                      <button
                        className={styles.stateAction}
                        type="button"
                        onClick={search.clearFilters}
                      >
                        Clear filters
                      </button>
                    ) : null}
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
                    {columns.map((column) => (
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
                      {tasksQuery.isFetchingNextPage ? "Loading\u2026" : "Load more tasks"}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {createOpen && board && currentUser ? (
        <TaskModal
          boardId={board.id}
          boardName={board.name}
          onClose={closeCreate}
          onCreate={(values) => createMutation.mutateAsync(values)}
          onUploadError={(message) => notify("error", message)}
          onSave={submitEdit}
        />
      ) : null}
      {editing === null || !board || !currentUser ? null : (
        <TaskModal
          boardId={board.id}
          boardName={board.name}
          task={editing}
          onClose={closeEdit}
          onRequestDelete={() => {
            setPendingDelete(editing);
            setEditing(null);
          }}
          onCreate={(values) => createMutation.mutateAsync(values)}
          onSave={submitEdit}
        />
      )}
      {pendingDelete === null ? null : (
        <TaskDeleteDialog
          task={pendingDelete}
          onClose={closeDelete}
          onConfirm={async () => {
            await deleteMutation.mutateAsync(pendingDelete);
            notify("success", `Deleted \u201c${pendingDelete.name}\u201d.`);
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
