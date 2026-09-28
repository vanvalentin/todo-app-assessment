import * as Dialog from "@radix-ui/react-dialog";
import { useId, useMemo, useState, type SyntheticEvent } from "react";
import {
  WEEKDAYS,
  WEEKDAY_NAMES,
  buildCustom,
  isValidTimezone,
  monthlyOptionLabel,
  parseCustom,
  timezoneGroups,
  type EndMode,
  type Frequency,
  type MonthlyMode,
  type Weekday,
} from "./recurrenceRules";
import { Select } from "../../components/Select/Select";
import styles from "./CustomRecurrenceDialog.module.scss";

interface CustomRecurrenceDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The task due date every option is derived from. */
  readonly dueDate: string;
  readonly rrule: string | null;
  readonly timezone: string;
  readonly onApply: (rrule: string, timezone: string) => void;
}

/**
 * Calendar-style custom repeat editor. It sits above the task dialog, so its change and
 * keyboard events stay here instead of marking the task dirty or triggering Ctrl+Enter save.
 */
export function CustomRecurrenceDialog(props: CustomRecurrenceDialogProps) {
  const isolate = (event: SyntheticEvent) => event.stopPropagation();
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} onChange={isolate} onKeyDown={isolate}>
          <CustomRecurrenceForm {...props} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const UNIT_OPTIONS: readonly (readonly [Frequency, string])[] = [
  ["DAILY", "day"],
  ["WEEKLY", "week"],
  ["MONTHLY", "month"],
  ["YEARLY", "year"],
];

function CustomRecurrenceForm({
  dueDate,
  rrule,
  timezone: initialTimezone,
  onApply,
  onOpenChange,
}: CustomRecurrenceDialogProps) {
  const ids = useId();
  const initial = useMemo(() => parseCustom(rrule, dueDate).recurrence, [rrule, dueDate]);
  const [frequency, setFrequency] = useState<Frequency>(initial.frequency);
  const [interval, setInterval] = useState(String(initial.interval));
  const [weekdays, setWeekdays] = useState<readonly Weekday[]>(initial.weekdays);
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>(initial.monthlyMode);
  const [end, setEnd] = useState<EndMode>(initial.end);
  const [until, setUntil] = useState(initial.until);
  const [count, setCount] = useState(String(initial.count));
  const [timezone, setTimezone] = useState(initialTimezone);
  const [error, setError] = useState<string | null>(null);
  const zoneGroups = useMemo(() => timezoneGroups(initialTimezone), [initialTimezone]);
  const intervalNumber = Number(interval);

  const toggleDay = (day: Weekday) => {
    setWeekdays((current) => {
      if (!current.includes(day)) return [...current, day];
      // A weekly rule always needs at least one day, as in calendar apps.
      return current.length === 1 ? current : current.filter((item) => item !== day);
    });
  };

  const done = () => {
    const countNumber = Number(count);
    if (!Number.isInteger(intervalNumber) || intervalNumber < 1 || intervalNumber > 365) {
      setError("Repeat every must be a whole number from 1 to 365.");
      return;
    }
    if (end === "UNTIL" && (until === "" || until < dueDate)) {
      setError("Choose an end date on or after the due date.");
      return;
    }
    if (
      end === "COUNT" &&
      (!Number.isInteger(countNumber) || countNumber < 1 || countNumber > 10_000)
    ) {
      setError("Occurrences must be a whole number from 1 to 10000.");
      return;
    }
    if (!isValidTimezone(timezone)) {
      setError("Choose a valid time zone.");
      return;
    }
    onApply(
      buildCustom(
        {
          frequency,
          interval: intervalNumber,
          weekdays,
          monthlyMode,
          end,
          until,
          count: countNumber,
        },
        dueDate,
      ),
      timezone.trim(),
    );
    onOpenChange(false);
  };

  const unitSuffix = intervalNumber === 1 ? "" : "s";

  return (
    <>
      <Dialog.Title className={styles.title}>Custom recurrence</Dialog.Title>
      <Dialog.Description className="visually-hidden">
        Choose how the due date repeats. Completing the task creates the next one.
      </Dialog.Description>

      <div className={styles.repeatRow}>
        <label htmlFor={`${ids}-interval`}>Repeat every</label>
        <input
          id={`${ids}-interval`}
          className={`${styles.input} ${styles.number}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          value={interval}
          onChange={(event) => setInterval(event.target.value)}
        />
        <Select
          label="Repeat unit"
          className={styles.unit}
          value={frequency}
          options={UNIT_OPTIONS.map(([value, label]) => ({
            value,
            label: `${label}${unitSuffix}`,
          }))}
          onChange={(value) => {
            const next = UNIT_OPTIONS.find(([option]) => option === value);
            if (next) setFrequency(next[0]);
          }}
        />
      </div>

      {frequency === "WEEKLY" ? (
        <fieldset className={styles.group}>
          <legend>Repeat on</legend>
          <div className={styles.days}>
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                className={styles.day}
                aria-pressed={weekdays.includes(day)}
                aria-label={WEEKDAY_NAMES[day]}
                title={WEEKDAY_NAMES[day]}
                onClick={() => toggleDay(day)}
              >
                {WEEKDAY_NAMES[day].charAt(0)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {frequency === "MONTHLY" ? (
        <Select
          label="Monthly pattern"
          className={styles.wide}
          value={monthlyMode}
          options={[
            { value: "DAY", label: monthlyOptionLabel("DAY", dueDate) },
            { value: "WEEKDAY", label: monthlyOptionLabel("WEEKDAY", dueDate) },
          ]}
          onChange={(value) => setMonthlyMode(value === "WEEKDAY" ? "WEEKDAY" : "DAY")}
        />
      ) : null}

      <fieldset className={styles.group}>
        <legend>Ends</legend>
        <div className={styles.endRow}>
          <label className={styles.radio}>
            <input
              type="radio"
              name={`${ids}-end`}
              checked={end === "NEVER"}
              onChange={() => setEnd("NEVER")}
            />
            Never
          </label>
        </div>
        <div className={styles.endRow}>
          <label className={styles.radio}>
            <input
              type="radio"
              name={`${ids}-end`}
              checked={end === "UNTIL"}
              onChange={() => setEnd("UNTIL")}
            />
            On
          </label>
          <input
            aria-label="End date"
            className={styles.input}
            type="date"
            min={dueDate}
            value={until}
            disabled={end !== "UNTIL"}
            onChange={(event) => setUntil(event.target.value)}
          />
        </div>
        <div className={styles.endRow}>
          <label className={styles.radio}>
            <input
              type="radio"
              name={`${ids}-end`}
              checked={end === "COUNT"}
              onChange={() => setEnd("COUNT")}
            />
            After
          </label>
          <span className={styles.countField} data-disabled={end !== "COUNT"}>
            <input
              aria-label="Number of occurrences"
              className={`${styles.input} ${styles.count}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={10_000}
              value={count}
              disabled={end !== "COUNT"}
              onChange={(event) => setCount(event.target.value)}
            />
            occurrences
          </span>
        </div>
      </fieldset>

      <div className={styles.group}>
        <span className={styles.legend} aria-hidden="true">
          Time zone
        </span>
        <Select
          label="Time zone"
          className={styles.wide}
          value={timezone}
          groups={zoneGroups.map((group) => ({ label: group.region, options: group.zones }))}
          onChange={setTimezone}
        />
      </div>

      {error === null ? null : (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <Dialog.Close asChild>
          <button type="button" className={styles.secondary}>
            Cancel
          </button>
        </Dialog.Close>
        <button type="button" className={styles.primary} onClick={done}>
          Done
        </button>
      </div>
    </>
  );
}
