import { RRule } from "rrule";

/**
 * Pure helpers for the calendar-style repeat picker. Every rule is interpreted from the
 * task's due date, so date-derived presets ("Weekly on Wednesday") are rebuilt when the
 * due date changes. Dates are `YYYY-MM-DD` strings handled in UTC to avoid local shifts.
 */

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEKDAY_NAMES: Readonly<Record<Weekday, string>> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type EndMode = "NEVER" | "UNTIL" | "COUNT";
export type MonthlyMode = "DAY" | "WEEKDAY";
export type RecurrencePreset = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "WEEKDAYS";
export const RECURRENCE_PRESETS: readonly RecurrencePreset[] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
  "WEEKDAYS",
];

export interface CustomRecurrence {
  readonly frequency: Frequency;
  readonly interval: number;
  readonly weekdays: readonly Weekday[];
  readonly monthlyMode: MonthlyMode;
  readonly end: EndMode;
  /** Inclusive last due date, `YYYY-MM-DD`. */
  readonly until: string;
  readonly count: number;
}

const WORK_WEEK: readonly Weekday[] = ["MO", "TU", "WE", "TH", "FR"];
const SUPPORTED_KEYS = new Set([
  "FREQ",
  "INTERVAL",
  "BYDAY",
  "BYMONTHDAY",
  "BYMONTH",
  "COUNT",
  "UNTIL",
]);
const ORDINALS: Readonly<Record<string, string>> = {
  "1": "first",
  "2": "second",
  "3": "third",
  "4": "fourth",
  "-1": "last",
};
const UNITS: Readonly<Record<Frequency, string>> = {
  DAILY: "day",
  WEEKLY: "week",
  MONTHLY: "month",
  YEARLY: "year",
};
const ADVERBS: Readonly<Record<Frequency, string>> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Annually",
};

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isFrequency(value: string | undefined): value is Frequency {
  return value === "DAILY" || value === "WEEKLY" || value === "MONTHLY" || value === "YEARLY";
}

function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value);
}

function sortWeekdays(days: readonly Weekday[]): Weekday[] {
  return WEEKDAYS.filter((day) => days.includes(day));
}

export function localToday(now = new Date()): string {
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function isValidTimezone(timezone: string): boolean {
  if (timezone.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export interface TimezoneGroup {
  readonly region: string;
  readonly zones: readonly { readonly value: string; readonly label: string }[];
}

/**
 * IANA zones grouped by region for the time zone dropdown. The current zone and UTC are
 * always offered, even when the runtime omits them from `Intl.supportedValuesOf`.
 */
export function timezoneGroups(current: string): readonly TimezoneGroup[] {
  const supported =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const zones = [...new Set([...supported, "UTC", current].filter((zone) => zone !== ""))].sort();
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const zone of zones) {
    const slash = zone.indexOf("/");
    const region = slash === -1 ? "Other" : zone.slice(0, slash);
    const label = zone.replace("/", " / ").replaceAll("_", " ");
    groups.set(region, [...(groups.get(region) ?? []), { value: zone, label }]);
  }
  return [...groups].map(([region, entries]) => ({ region, zones: entries }));
}

/** Keeps the saved wall-clock time while moving the recurrence anchor to the due date. */
export function anchoredStart(date: string, previous?: string): string {
  return `${date}${previous?.slice(10) ?? "T09:00:00"}`;
}

export function weekdayOf(date: string): Weekday {
  return WEEKDAYS[(utcDate(date).getUTCDay() + 6) % 7] ?? "MO";
}

/** Week-of-month position; a fifth occurrence is "last", as calendar apps present it. */
export function monthPosition(date: string): number {
  const position = Math.ceil(utcDate(date).getUTCDate() / 7);
  return position >= 5 ? -1 : position;
}

export function addMonths(date: string, months: number): string {
  const value = utcDate(date);
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0),
  ).getUTCDate();
  value.setUTCDate(Math.min(day, lastDay));
  return isoDate(value);
}

export function formatDueDate(date: string): string {
  return utcDate(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatShortDate(date: string): string {
  return utcDate(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthAndDay(date: string): string {
  return utcDate(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function nthWeekday(date: string): string {
  return `${monthPosition(date)}${weekdayOf(date)}`;
}

export function monthlyOptionLabel(mode: MonthlyMode, date: string): string {
  if (mode === "DAY") return `Monthly on day ${utcDate(date).getUTCDate()}`;
  return `Monthly on the ${ORDINALS[String(monthPosition(date))] ?? ""} ${WEEKDAY_NAMES[weekdayOf(date)]}`;
}

export function presetRule(preset: RecurrencePreset, date: string): string {
  const value = utcDate(date);
  switch (preset) {
    case "DAILY":
      return "FREQ=DAILY;INTERVAL=1";
    case "WEEKLY":
      return `FREQ=WEEKLY;INTERVAL=1;BYDAY=${weekdayOf(date)}`;
    case "MONTHLY":
      return `FREQ=MONTHLY;INTERVAL=1;BYDAY=${nthWeekday(date)}`;
    case "YEARLY":
      return `FREQ=YEARLY;INTERVAL=1;BYMONTH=${value.getUTCMonth() + 1};BYMONTHDAY=${value.getUTCDate()}`;
    case "WEEKDAYS":
      return `FREQ=WEEKLY;INTERVAL=1;BYDAY=${WORK_WEEK.join(",")}`;
  }
}

export function presetLabel(preset: RecurrencePreset, date: string): string {
  switch (preset) {
    case "DAILY":
      return "Daily";
    case "WEEKLY":
      return `Weekly on ${WEEKDAY_NAMES[weekdayOf(date)]}`;
    case "MONTHLY":
      return monthlyOptionLabel("WEEKDAY", date);
    case "YEARLY":
      return `Annually on ${monthAndDay(date)}`;
    case "WEEKDAYS":
      return "Every weekday (Monday to Friday)";
  }
}

export function defaultCustom(date: string): CustomRecurrence {
  return {
    frequency: "WEEKLY",
    interval: 1,
    weekdays: [weekdayOf(date)],
    monthlyMode: "DAY",
    end: "NEVER",
    until: addMonths(date, 3),
    count: 13,
  };
}

function ruleParts(rrule: string): Map<string, string> {
  const body = rrule
    .trim()
    .replace(/^RRULE:/i, "")
    .toUpperCase();
  return new Map(
    body
      .split(";")
      .filter((part) => part !== "")
      .map((part): [string, string] => {
        const [key = "", value = ""] = part.split("=", 2);
        return [key, value];
      }),
  );
}

/**
 * Reads a rule into the custom editor. `exact` is false when the rule uses a shape the
 * editor cannot express for this due date, so callers can avoid silently rewriting it.
 */
export function parseCustom(
  rrule: string | null,
  date: string,
): { readonly recurrence: CustomRecurrence; readonly exact: boolean } {
  const defaults = defaultCustom(date);
  if (rrule === null) return { recurrence: defaults, exact: false };
  const parts = ruleParts(rrule);
  let exact = [...parts.keys()].every((key) => SUPPORTED_KEYS.has(key));
  const frequencyPart = parts.get("FREQ");
  if (!isFrequency(frequencyPart)) return { recurrence: defaults, exact: false };
  const frequency = frequencyPart;

  const intervalPart = parts.get("INTERVAL") ?? "1";
  let interval = Number(intervalPart);
  if (!/^\d+$/.test(intervalPart) || interval < 1 || interval > 365) {
    exact = false;
    interval = 1;
  }

  const byDay = parts.get("BYDAY");
  const byMonthDay = parts.get("BYMONTHDAY");
  const byMonth = parts.get("BYMONTH");
  const value = utcDate(date);
  let weekdays = defaults.weekdays;
  let monthlyMode: MonthlyMode = "DAY";
  if (frequency === "DAILY" && (byDay ?? byMonthDay ?? byMonth) !== undefined) exact = false;
  if (frequency === "WEEKLY") {
    if (byMonthDay !== undefined || byMonth !== undefined) exact = false;
    if (byDay !== undefined) {
      const days = byDay.split(",");
      if (days.every(isWeekday) && days.length > 0) weekdays = sortWeekdays(days.filter(isWeekday));
      else exact = false;
    }
  }
  if (frequency === "MONTHLY") {
    if (byMonth !== undefined || (byDay !== undefined && byMonthDay !== undefined)) exact = false;
    if (byDay !== undefined) {
      monthlyMode = "WEEKDAY";
      if (byDay.replace(/^\+/, "") !== nthWeekday(date)) exact = false;
    } else if (byMonthDay !== undefined && byMonthDay !== String(value.getUTCDate())) {
      exact = false;
    }
  }
  if (frequency === "YEARLY") {
    if (byDay !== undefined) exact = false;
    if (byMonth !== undefined && byMonth !== String(value.getUTCMonth() + 1)) exact = false;
    if (byMonthDay !== undefined && byMonthDay !== String(value.getUTCDate())) exact = false;
  }

  let end: EndMode = "NEVER";
  let until = defaults.until;
  let count = defaults.count;
  const countPart = parts.get("COUNT");
  const untilPart = parts.get("UNTIL");
  if (countPart !== undefined && untilPart !== undefined) exact = false;
  if (countPart !== undefined) {
    end = "COUNT";
    count = Number(countPart);
    if (!/^\d+$/.test(countPart) || count < 1 || count > 10_000) {
      exact = false;
      count = defaults.count;
    }
  } else if (untilPart !== undefined) {
    const match = /^(\d{4})(\d{2})(\d{2})/.exec(untilPart);
    if (match === null) exact = false;
    else {
      end = "UNTIL";
      until = `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  return {
    recurrence: { frequency, interval, weekdays, monthlyMode, end, until, count },
    exact,
  };
}

export function buildCustom(recurrence: CustomRecurrence, date: string): string {
  const value = utcDate(date);
  const interval = Math.max(1, Math.min(365, Math.trunc(recurrence.interval)));
  const parts = [`FREQ=${recurrence.frequency}`, `INTERVAL=${interval}`];
  if (recurrence.frequency === "WEEKLY") {
    const days = sortWeekdays(recurrence.weekdays);
    parts.push(`BYDAY=${(days.length > 0 ? days : [weekdayOf(date)]).join(",")}`);
  }
  if (recurrence.frequency === "MONTHLY") {
    parts.push(
      recurrence.monthlyMode === "WEEKDAY"
        ? `BYDAY=${nthWeekday(date)}`
        : `BYMONTHDAY=${value.getUTCDate()}`,
    );
  }
  if (recurrence.frequency === "YEARLY") {
    parts.push(`BYMONTH=${value.getUTCMonth() + 1}`, `BYMONTHDAY=${value.getUTCDate()}`);
  }
  // End of the local day so the final due date itself is still included.
  if (recurrence.end === "UNTIL")
    parts.push(`UNTIL=${recurrence.until.replaceAll("-", "")}T235959`);
  if (recurrence.end === "COUNT") {
    parts.push(`COUNT=${Math.max(1, Math.min(10_000, Math.trunc(recurrence.count)))}`);
  }
  return parts.join(";");
}

export function matchPreset(rrule: string, date: string): RecurrencePreset | null {
  const { recurrence, exact } = parseCustom(rrule, date);
  if (!exact) return null;
  const built = buildCustom(recurrence, date);
  return (
    RECURRENCE_PRESETS.find(
      (preset) =>
        buildCustom(parseCustom(presetRule(preset, date), date).recurrence, date) === built,
    ) ?? null
  );
}

function describeCustom(recurrence: CustomRecurrence, date: string): string {
  const { frequency, interval } = recurrence;
  let text = interval === 1 ? ADVERBS[frequency] : `Every ${interval} ${UNITS[frequency]}s`;
  if (frequency === "WEEKLY") {
    const days = sortWeekdays(recurrence.weekdays);
    if (interval === 1 && days.join(",") === WORK_WEEK.join(",")) {
      text = "Every weekday (Monday to Friday)";
    } else {
      text += ` on ${days.map((day) => WEEKDAY_NAMES[day]).join(", ")}`;
    }
  }
  if (frequency === "MONTHLY") {
    text += ` ${monthlyOptionLabel(recurrence.monthlyMode, date).replace(/^Monthly /, "")}`;
  }
  if (frequency === "YEARLY") text += ` on ${monthAndDay(date)}`;
  if (recurrence.end === "UNTIL") text += `, until ${formatShortDate(recurrence.until)}`;
  if (recurrence.end === "COUNT") {
    text += `, ${recurrence.count} ${recurrence.count === 1 ? "time" : "times"}`;
  }
  return text;
}

export function describeRecurrence(rrule: string, date: string): string {
  const preset = matchPreset(rrule, date);
  if (preset !== null) return presetLabel(preset, date);
  const { recurrence, exact } = parseCustom(rrule, date);
  if (exact) return describeCustom(recurrence, date);
  try {
    const text = RRule.fromString(rrule.trim().replace(/^RRULE:/i, "")).toText();
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
  } catch {
    return "Custom schedule";
  }
}

/**
 * Moves date-derived rules with the task: "Weekly on Monday" follows a due date moved to
 * Wednesday, and monthly/yearly rules follow the new day. Multi-day weekly rules and rules
 * the editor cannot represent are kept unchanged.
 */
export function retargetRule(rrule: string, previousDate: string, nextDate: string): string {
  if (previousDate === nextDate) return rrule;
  const { recurrence, exact } = parseCustom(rrule, previousDate);
  if (!exact) return rrule;
  if (recurrence.frequency === "MONTHLY" || recurrence.frequency === "YEARLY") {
    return buildCustom(recurrence, nextDate);
  }
  if (
    recurrence.frequency === "WEEKLY" &&
    recurrence.weekdays.length === 1 &&
    recurrence.weekdays[0] === weekdayOf(previousDate)
  ) {
    return buildCustom({ ...recurrence, weekdays: [weekdayOf(nextDate)] }, nextDate);
  }
  return rrule;
}

/** The next due dates after the current one, or an empty list for an unparseable rule. */
export function upcomingDueDates(rrule: string, startLocal: string, limit = 3): string[] {
  try {
    const options = RRule.parseString(rrule.trim().replace(/^RRULE:/i, ""));
    const dtstart = new Date(`${startLocal.length === 16 ? `${startLocal}:00` : startLocal}Z`);
    const rule = new RRule({ ...options, dtstart });
    const dates: string[] = [];
    let cursor = dtstart;
    while (dates.length < limit) {
      const next = rule.after(cursor, false);
      if (next === null) break;
      dates.push(isoDate(next));
      cursor = next;
    }
    return dates;
  } catch {
    return [];
  }
}
