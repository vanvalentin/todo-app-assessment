import { useId, useState } from "react";
import type { TaskScheduleInput } from "@ksat/contracts";
import { Select } from "../../components/Select/Select";
import { CustomRecurrenceDialog } from "./CustomRecurrenceDialog";
import {
  RECURRENCE_PRESETS,
  anchoredStart,
  browserTimezone,
  describeRecurrence,
  formatDueDate,
  localToday,
  matchPreset,
  presetLabel,
  presetRule,
  upcomingDueDates,
  type RecurrencePreset,
} from "./recurrenceRules";
import styles from "./RecurrenceField.module.scss";

interface RecurrenceFieldProps {
  readonly value: TaskScheduleInput | null;
  readonly dueDate: string | null;
  readonly onDueDateChange: (value: string | null) => void;
  readonly onChange: (value: TaskScheduleInput | null) => void;
  readonly disabled?: boolean;
}

const NONE = "NONE";
const CURRENT = "CURRENT";
const CUSTOM = "CUSTOM";

function isPreset(value: string): value is RecurrencePreset {
  return (RECURRENCE_PRESETS as readonly string[]).includes(value);
}

/**
 * Calendar-style repeat picker: presets derived from the due date, plus a custom dialog.
 * Choosing a pattern without a due date anchors the task on today.
 */
export function RecurrenceField({
  value,
  dueDate,
  onDueDateChange,
  onChange,
  disabled = false,
}: RecurrenceFieldProps) {
  const headingId = useId();
  const statusId = useId();
  const [customOpen, setCustomOpen] = useState(false);
  const anchor = dueDate ?? value?.startLocal.slice(0, 10) ?? localToday();
  const preset = value === null ? null : matchPreset(value.rrule, anchor);
  const selected = value === null ? NONE : (preset ?? CURRENT);
  const upcoming =
    value === null ? [] : upcomingDueDates(value.rrule, anchoredStart(anchor, value.startLocal));

  const options = [
    { value: NONE, label: "Does not repeat" },
    ...RECURRENCE_PRESETS.map((option) => ({ value: option, label: presetLabel(option, anchor) })),
    ...(selected === CURRENT && value !== null
      ? [{ value: CURRENT, label: describeRecurrence(value.rrule, anchor) }]
      : []),
    { value: CUSTOM, label: "Custom…" },
  ];

  const apply = (rrule: string, timezone = value?.timezone ?? browserTimezone()) => {
    if (dueDate === null) onDueDateChange(anchor);
    onChange({
      rrule,
      timezone,
      startLocal: anchoredStart(anchor, value?.startLocal),
      enabled: value?.enabled ?? true,
    });
  };

  const handleSelect = (next: string) => {
    if (next === NONE) onChange(null);
    else if (next === CUSTOM) setCustomOpen(true);
    else if (isPreset(next)) apply(presetRule(next, anchor));
  };

  return (
    <section className={styles.field} aria-labelledby={headingId}>
      <div className={styles.header}>
        <h3 className={styles.label} id={headingId}>
          Repeat
        </h3>
        {value === null ? null : (
          <button
            type="button"
            className={styles.pause}
            disabled={disabled}
            onClick={() => onChange({ ...value, enabled: !value.enabled })}
          >
            {value.enabled ? "Pause" : "Resume"}
          </button>
        )}
      </div>

      <Select
        label="Repeat"
        className={styles.select}
        value={selected}
        options={options}
        onChange={handleSelect}
        disabled={disabled}
        describedBy={value === null ? undefined : statusId}
      />

      {value === null ? null : (
        <p id={statusId} className={styles.status} aria-live="polite">
          {value.enabled ? (
            <span>
              Completing this task creates the next one
              {upcoming[0] === undefined ? "" : `, due ${formatDueDate(upcoming[0])}`}.
            </span>
          ) : (
            <span>
              <span className={styles.pausedBadge}>Paused</span> Completing this task won’t create
              the next one.
            </span>
          )}
          {upcoming.length > 1 ? (
            <span>Then {upcoming.slice(1).map(formatDueDate).join(" · ")}</span>
          ) : null}
          <span>Time zone: {value.timezone}</span>
        </p>
      )}

      <CustomRecurrenceDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        dueDate={anchor}
        rrule={value?.rrule ?? null}
        timezone={value?.timezone ?? browserTimezone()}
        onApply={(rrule, timezone) => apply(rrule, timezone)}
      />
    </section>
  );
}
