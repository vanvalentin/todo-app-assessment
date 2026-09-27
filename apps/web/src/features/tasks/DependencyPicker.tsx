import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { TASK_DEPENDENCIES_MAX, type TaskReference, type TaskStatus } from "@ksat/contracts";
import { useEffect, useId, useState } from "react";
import dependencyIcon from "../../assets/tasks/dependency-link.svg";
import { queryKeys } from "../../lib/api/queryKeys";
import { fetchBoardTasks } from "../../lib/api/tasks";
import { columnTitle } from "./taskBoard";
import styles from "./DependencyPicker.module.scss";

const SEARCH_DEBOUNCE_MS = 200;

interface DependencyPickerProps {
  readonly boardId: string;
  /** The task being edited; omitted while creating. It is never offered as its own prerequisite. */
  readonly taskId?: string | undefined;
  readonly value: readonly TaskReference[];
  readonly onChange: (next: readonly TaskReference[]) => void;
  readonly error?: string | null;
  readonly disabled?: boolean;
}

/** Status as text, so completion is never conveyed by colour alone. */
function statusLabel(status: TaskStatus): string {
  return columnTitle(status);
}

/**
 * Chooses same-board prerequisites. Selected tasks are listed with a labelled remove
 * button; the popover searches the board (including archived tasks) and toggles
 * candidates with native checkboxes, so it is fully keyboard operable. Cycles are
 * validated by the API, which reports them against this field.
 */
export function DependencyPicker({
  boardId,
  taskId,
  value,
  onChange,
  error = null,
  disabled = false,
}: DependencyPickerProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const labelId = useId();
  const helpId = useId();
  const errorId = useId();
  const searchId = useId();
  const selectedIds = new Set(value.map((reference) => reference.id));
  const atLimit = value.length >= TASK_DEPENDENCIES_MAX;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedTerm(term.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [term]);

  const candidates = useQuery({
    queryKey: queryKeys.dependencyCandidates(boardId, debouncedTerm),
    queryFn: ({ signal }) =>
      fetchBoardTasks(
        boardId,
        {
          includeArchived: true,
          sort: "NAME",
          ...(debouncedTerm === "" ? {} : { q: debouncedTerm }),
        },
        { signal },
      ),
    enabled: open,
    staleTime: 15_000,
  });
  const options = (candidates.data?.items ?? []).filter((task) => task.id !== taskId);

  const toggle = (reference: TaskReference, checked: boolean) => {
    if (checked) {
      onChange([...value, reference].sort((left, right) => left.sequence - right.sequence));
    } else {
      onChange(value.filter((item) => item.id !== reference.id));
    }
  };

  return (
    <section className={styles.field} aria-labelledby={labelId}>
      <div className={styles.header}>
        <h3 className={styles.label} id={labelId}>
          Depends on
        </h3>
        <Popover.Root
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setTerm("");
          }}
        >
          <Popover.Trigger
            className={styles.addButton}
            disabled={disabled}
            aria-invalid={error === null ? undefined : "true"}
            aria-describedby={error === null ? helpId : `${helpId} ${errorId}`}
          >
            Add dependency
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className={styles.popover}
              sideOffset={6}
              align="end"
              aria-label="Choose dependencies"
              // The popover is portaled but still React-bubbles into the modal form;
              // searching is not an edit, so it must not mark the task dirty.
              onChange={(event) => event.stopPropagation()}
            >
              <label className={styles.searchLabel} htmlFor={searchId}>
                Search tasks on this board
              </label>
              <input
                className={styles.search}
                id={searchId}
                type="search"
                value={term}
                autoComplete="off"
                placeholder="Name or #number"
                onChange={(event) => setTerm(event.target.value)}
              />
              {atLimit ? (
                <p className={styles.note}>
                  A task can depend on at most {TASK_DEPENDENCIES_MAX} tasks.
                </p>
              ) : null}
              <div className={styles.results} aria-busy={candidates.isFetching}>
                {candidates.isPending ? (
                  <p className={styles.note}>Searching…</p>
                ) : candidates.isError ? (
                  <div className={styles.note} role="alert">
                    Couldn’t load tasks.{" "}
                    <button
                      className={styles.retry}
                      type="button"
                      onClick={() => void candidates.refetch()}
                    >
                      Retry
                    </button>
                  </div>
                ) : options.length === 0 ? (
                  <p className={styles.note}>No other tasks match.</p>
                ) : (
                  <ul className={styles.options}>
                    {options.map((task) => {
                      const checked = selectedIds.has(task.id);
                      const reference: TaskReference = {
                        id: task.id,
                        sequence: task.sequence,
                        name: task.name,
                        status: task.status,
                      };
                      return (
                        <li key={task.id}>
                          <label className={styles.option}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!checked && atLimit}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggle(reference, event.target.checked);
                              }}
                            />
                            <span className={styles.sequence}>#{task.sequence}</span>
                            <span className={styles.optionName}>{task.name}</span>
                            <span className={styles.status}>{statusLabel(task.status)}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <p className={styles.help} id={helpId}>
        Every dependency must be Completed before this task can move to In Progress or Completed.
        Archived dependencies don’t block it.
      </p>
      {value.length === 0 ? (
        <p className={styles.empty}>No dependencies.</p>
      ) : (
        <ul className={styles.selected} aria-labelledby={labelId}>
          {value.map((reference) => (
            <li key={reference.id} className={styles.chip}>
              <img src={dependencyIcon} alt="" width={10} height={5} />
              <span className={styles.sequence}>#{reference.sequence}</span>
              <span className={styles.chipName}>{reference.name}</span>
              <span className={styles.status}>{statusLabel(reference.status)}</span>
              <button
                className={styles.remove}
                type="button"
                disabled={disabled}
                aria-label={`Remove dependency #${reference.sequence} ${reference.name}`}
                onClick={() => toggle(reference, false)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {error === null ? null : (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
