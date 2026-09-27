import { RRule } from "rrule";
import { useMemo, useState } from "react";
import type { TaskScheduleInput } from "@ksat/contracts";
import styles from "./RecurrenceField.module.scss";

type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type EndMode = "NEVER" | "UNTIL" | "COUNT";
type EditorMode = "guided" | "advanced";
const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

interface RecurrenceFieldProps {
  readonly value: TaskScheduleInput | null;
  readonly onChange: (value: TaskScheduleInput | null) => void;
  readonly disabled?: boolean;
}

function localNow(): string {
  const date = new Date();
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function timezoneNow(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function readRule(value: TaskScheduleInput | null): {
  frequency: Frequency;
  interval: number;
  days: readonly string[];
  end: EndMode;
  until: string;
  count: number;
} {
  const parts = new Map(
    (value?.rrule ?? "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO").split(";").map((part): [string, string] => {
      const [key, partValue = ""] = part.split("=", 2);
      return [key, partValue];
    }),
  );
  const frequency = parts.get("FREQ");
  const end: EndMode = parts.has("UNTIL") ? "UNTIL" : parts.has("COUNT") ? "COUNT" : "NEVER";
  return {
    frequency:
      frequency === "DAILY" || frequency === "MONTHLY" || frequency === "YEARLY"
        ? frequency
        : "WEEKLY",
    interval: Number(parts.get("INTERVAL") ?? "1") || 1,
    days: (parts.get("BYDAY") ?? "MO").split(","),
    end,
    until: parts.get("UNTIL") ?? "",
    count: Number(parts.get("COUNT") ?? "5") || 5,
  };
}

function buildRule(
  frequency: Frequency,
  interval: number,
  days: readonly string[],
  end: EndMode,
  until: string,
  count: number,
): string {
  const parts = [`FREQ=${frequency}`, `INTERVAL=${Math.max(1, Math.min(365, interval))}`];
  if (frequency === "WEEKLY") parts.push(`BYDAY=${days.length > 0 ? days.join(",") : "MO"}`);
  if (end === "UNTIL" && until !== "") parts.push(`UNTIL=${until.replaceAll("-", "")}`);
  if (end === "COUNT") parts.push(`COUNT=${Math.max(1, Math.min(10000, count))}`);
  return parts.join(";");
}

export function RecurrenceField({ value, onChange, disabled = false }: RecurrenceFieldProps) {
  const parsed = useMemo(() => readRule(value), [value]);
  const [mode, setMode] = useState<EditorMode>("guided");
  const [frequency, setFrequency] = useState<Frequency>(parsed.frequency);
  const [interval, setInterval] = useState(parsed.interval);
  const [days, setDays] = useState<readonly string[]>(parsed.days);
  const [end, setEnd] = useState<EndMode>(parsed.end);
  const [until, setUntil] = useState(parsed.until);
  const [count, setCount] = useState(parsed.count);
  const [startLocal, setStartLocal] = useState(value?.startLocal ?? localNow());
  const [timezone, setTimezone] = useState(value?.timezone ?? timezoneNow());
  const [rawRule, setRawRule] = useState(value?.rrule ?? "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO");
  const summary = useMemo(() => {
    try {
      return RRule.fromString(rawRule.replace(/^RRULE:/i, "")).toText();
    } catch {
      return "Invalid recurrence rule";
    }
  }, [rawRule]);
  const preview = useMemo(() => {
    try {
      const parsed = RRule.parseString(`RRULE:${rawRule.replace(/^RRULE:/i, "")}`);
      const rule = new RRule({ ...parsed, dtstart: new Date(`${startLocal}Z`) });
      return rule
        .all((_date, index) => index < 3)
        .map((date) => date.toISOString().slice(0, 16).replace("T", " "));
    } catch {
      return [];
    }
  }, [rawRule, startLocal]);

  const emitGuided = (
    next: Partial<{
      frequency: Frequency;
      interval: number;
      days: readonly string[];
      end: EndMode;
      until: string;
      count: number;
    }>,
  ) => {
    const current = { frequency, interval, days, end, until, count, ...next };
    const rrule = buildRule(
      current.frequency,
      current.interval,
      current.days,
      current.end,
      current.until,
      current.count,
    );
    setRawRule(rrule);
    onChange({ rrule, timezone, startLocal, enabled: value?.enabled ?? true });
  };
  const emitAdvanced = (rrule: string) => {
    setRawRule(rrule);
    onChange({ rrule, timezone, startLocal, enabled: value?.enabled ?? true });
  };

  return (
    <section className={styles.field} aria-labelledby="recurrence-label">
      <div className={styles.heading}>
        <div>
          <h3 id="recurrence-label">Repeat</h3>
          <p>Generate future work from this task. Dependencies and attachments are not copied.</p>
        </div>
        <button
          type="button"
          className={styles.toggle}
          disabled={disabled}
          onClick={() =>
            onChange(
              value === null ? { rrule: rawRule, timezone, startLocal, enabled: true } : null,
            )
          }
        >
          {value === null ? "Add recurrence" : "Turn off"}
        </button>
        {value === null ? null : (
          <button
            type="button"
            className={styles.toggle}
            disabled={disabled}
            onClick={() => onChange({ ...value, enabled: !value.enabled })}
          >
            {value.enabled ? "Pause" : "Resume"}
          </button>
        )}
      </div>
      {value === null ? null : (
        <div className={styles.body}>
          <div className={styles.modeRow} role="group" aria-label="Recurrence editor mode">
            <button
              type="button"
              className={mode === "guided" ? styles.selected : ""}
              onClick={() => {
                const next = readRule({
                  rrule: rawRule,
                  timezone,
                  startLocal,
                  enabled: value?.enabled ?? true,
                });
                setFrequency(next.frequency);
                setInterval(next.interval);
                setDays(next.days);
                setEnd(next.end);
                setUntil(next.until);
                setCount(next.count);
                setMode("guided");
              }}
              disabled={disabled}
            >
              Guided
            </button>
            <button
              type="button"
              className={mode === "advanced" ? styles.selected : ""}
              onClick={() => setMode("advanced")}
              disabled={disabled}
            >
              Advanced RRULE
            </button>
          </div>
          {mode === "guided" ? (
            <>
              <div className={styles.grid}>
                <label>
                  Every
                  <select
                    value={frequency}
                    disabled={disabled}
                    onChange={(event) => {
                      const next = event.target.value as Frequency;
                      setFrequency(next);
                      emitGuided({ frequency: next });
                    }}
                  >
                    <option value="DAILY">day</option>
                    <option value="WEEKLY">week</option>
                    <option value="MONTHLY">month</option>
                    <option value="YEARLY">year</option>
                  </select>
                </label>
                <label>
                  Interval
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={interval}
                    disabled={disabled}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setInterval(next);
                      emitGuided({ interval: next });
                    }}
                  />
                </label>
              </div>
              {frequency === "WEEKLY" ? (
                <fieldset>
                  <legend>On days</legend>
                  <div className={styles.days}>
                    {DAYS.map((day, index) => (
                      <label key={day}>
                        <input
                          type="checkbox"
                          checked={days.includes(day)}
                          disabled={disabled}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...days, day]
                              : days.filter((item) => item !== day);
                            setDays(next);
                            emitGuided({ days: next });
                          }}
                        />
                        {DAY_LABELS[index]}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <div className={styles.grid}>
                <label>
                  Starts
                  <input
                    type="datetime-local"
                    value={startLocal.slice(0, 16)}
                    disabled={disabled}
                    onChange={(event) => {
                      const next = `${event.target.value}:00`;
                      setStartLocal(next);
                      onChange({
                        rrule: buildRule(frequency, interval, days, end, until, count),
                        timezone,
                        startLocal: next,
                        enabled: value?.enabled ?? true,
                      });
                    }}
                  />
                </label>
                <label>
                  Timezone
                  <input
                    value={timezone}
                    disabled={disabled}
                    onChange={(event) => {
                      setTimezone(event.target.value);
                      onChange({
                        rrule: buildRule(frequency, interval, days, end, until, count),
                        timezone: event.target.value,
                        startLocal,
                        enabled: value?.enabled ?? true,
                      });
                    }}
                  />
                </label>
              </div>
              <div className={styles.grid}>
                <label>
                  Ends
                  <select
                    value={end}
                    disabled={disabled}
                    onChange={(event) => {
                      const next = event.target.value as EndMode;
                      setEnd(next);
                      emitGuided({ end: next });
                    }}
                  >
                    <option value="NEVER">Never</option>
                    <option value="UNTIL">On date</option>
                    <option value="COUNT">After occurrences</option>
                  </select>
                </label>
                {end === "UNTIL" ? (
                  <label>
                    End date
                    <input
                      type="date"
                      value={until.slice(0, 10)}
                      disabled={disabled}
                      onChange={(event) => {
                        setUntil(event.target.value);
                        emitGuided({ until: event.target.value });
                      }}
                    />
                  </label>
                ) : null}
                {end === "COUNT" ? (
                  <label>
                    Occurrences
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={count}
                      disabled={disabled}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setCount(next);
                        emitGuided({ count: next });
                      }}
                    />
                  </label>
                ) : null}
              </div>
            </>
          ) : (
            <label>
              RRULE
              <textarea
                value={rawRule}
                disabled={disabled}
                rows={3}
                onChange={(event) => emitAdvanced(event.target.value)}
                aria-describedby="recurrence-help"
              />
            </label>
          )}
          <p id="recurrence-help" className={styles.help}>
            The next occurrences use the saved IANA timezone. The worker creates them once, even
            after retries.
          </p>
          <p className={styles.summary}>{summary}</p>
          <div className={styles.preview} aria-live="polite">
            <strong>Upcoming</strong>
            {preview.length === 0 ? (
              <span>Preview unavailable until the rule is valid.</span>
            ) : (
              <ul>
                {preview.map((date) => (
                  <li key={date}>
                    {date} · {timezone}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
