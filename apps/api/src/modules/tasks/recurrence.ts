import { DateTime, IANAZone } from "luxon";
import type { RRule as RRuleType } from "rrule";
import rrule from "rrule";

const { RRule } = rrule;
import type { TaskScheduleInput } from "@ksat/contracts";

const SUPPORTED_FREQ = new Set(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
const SUPPORTED_KEYS = new Set([
  "FREQ",
  "INTERVAL",
  "COUNT",
  "UNTIL",
  "BYDAY",
  "BYMONTHDAY",
  "BYMONTH",
  "BYSETPOS",
]);

export class RecurrenceValidationError extends Error {
  public readonly code: "RRULE_INVALID" | "TIMEZONE_INVALID" | "SCHEDULE_NO_FUTURE_OCCURRENCES";
  public constructor(
    code: "RRULE_INVALID" | "TIMEZONE_INVALID" | "SCHEDULE_NO_FUTURE_OCCURRENCES",
    message: string,
  ) {
    super(message);
    this.name = "RecurrenceValidationError";
    this.code = code;
  }
}

export interface ParsedSchedule {
  readonly rrule: string;
  readonly timezone: string;
  readonly startLocal: string;
  readonly enabled: boolean;
  readonly nextRunAt: Date | null;
}

function localDateTime(value: string): DateTime {
  const parsed = DateTime.fromISO(value, { setZone: false });
  if (!parsed.isValid || value.length < 16) {
    throw new RecurrenceValidationError("RRULE_INVALID", "The schedule start is invalid.");
  }
  return parsed.set({ millisecond: 0 });
}

function floatingDate(value: DateTime): Date {
  return new Date(
    Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second),
  );
}

function fromFloating(value: Date, timezone: string): Date {
  const local = DateTime.fromObject(
    {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
      hour: value.getUTCHours(),
      minute: value.getUTCMinutes(),
      second: value.getUTCSeconds(),
    },
    { zone: timezone },
  );
  if (!local.isValid) {
    throw new RecurrenceValidationError(
      "RRULE_INVALID",
      "The schedule contains an invalid local occurrence.",
    );
  }
  return local.toUTC().toJSDate();
}

function bodyOf(rrule: string): string {
  const body = rrule.trim().replace(/^RRULE:/i, "");
  if (body.includes("\n") || body.includes("\r")) {
    throw new RecurrenceValidationError("RRULE_INVALID", "Only one RRULE is allowed.");
  }
  return body.toUpperCase();
}

function validateRule(body: string, dtstart = new Date()): RRuleType {
  try {
    const parts = new Map(body.split(";").map((part) => part.split("=", 2) as [string, string]));
    for (const key of parts.keys()) {
      if (!SUPPORTED_KEYS.has(key)) {
        throw new RecurrenceValidationError("RRULE_INVALID", `RRULE part ${key} is not supported.`);
      }
    }
    const frequency = parts.get("FREQ");
    if (!frequency || !SUPPORTED_FREQ.has(frequency)) {
      throw new RecurrenceValidationError("RRULE_INVALID", "The RRULE frequency is unsupported.");
    }
    if (parts.has("COUNT") && parts.has("UNTIL")) {
      throw new RecurrenceValidationError("RRULE_INVALID", "COUNT and UNTIL cannot be combined.");
    }
    const interval = Number(parts.get("INTERVAL") ?? "1");
    if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
      throw new RecurrenceValidationError(
        "RRULE_INVALID",
        "The RRULE interval must be between 1 and 365.",
      );
    }
    const count = parts.get("COUNT");
    if (
      count !== undefined &&
      (!/^\d+$/.test(count) || Number(count) < 1 || Number(count) > 10_000)
    ) {
      throw new RecurrenceValidationError(
        "RRULE_INVALID",
        "The RRULE count must be between 1 and 10000.",
      );
    }
    return new RRule({ ...RRule.parseString(`RRULE:${body}`), dtstart });
  } catch (error) {
    if (error instanceof RecurrenceValidationError) throw error;
    throw new RecurrenceValidationError("RRULE_INVALID", "The RRULE could not be parsed.");
  }
}

function nextAfter(rule: RRuleType, timezone: string, after: Date): Date | null {
  let cursor = after;
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const localCursor = DateTime.fromJSDate(cursor, { zone: timezone });
    const candidate = rule.after(floatingDate(localCursor), false);
    if (!candidate) return null;
    const instant = fromFloating(candidate, timezone);
    if (instant.getTime() > after.getTime()) return instant;
    cursor = new Date(cursor.getTime() + 1_000);
  }
  throw new RecurrenceValidationError(
    "RRULE_INVALID",
    "The RRULE did not produce a bounded next occurrence.",
  );
}

export function parseSchedule(input: TaskScheduleInput, now = new Date()): ParsedSchedule {
  if (!IANAZone.isValidZone(input.timezone)) {
    throw new RecurrenceValidationError(
      "TIMEZONE_INVALID",
      "The timezone must be a valid IANA timezone.",
    );
  }
  const start = localDateTime(input.startLocal);
  const body = bodyOf(input.rrule);
  const startInstant = fromFloating(floatingDate(start), input.timezone);
  const rule = validateRule(body, floatingDate(start));
  const nextRunAt = input.enabled ? nextAfter(rule, input.timezone, now) : null;
  if (input.enabled && nextRunAt === null) {
    throw new RecurrenceValidationError(
      "SCHEDULE_NO_FUTURE_OCCURRENCES",
      "The schedule has no future occurrences.",
    );
  }
  return {
    rrule: `RRULE:${body}`,
    timezone: input.timezone,
    startLocal: start.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
    enabled: input.enabled,
    nextRunAt: nextRunAt ?? (input.enabled ? startInstant : null),
  };
}

export function nextOccurrence(
  schedule: Pick<ParsedSchedule, "rrule" | "timezone" | "startLocal">,
  after: Date,
): Date | null {
  const start = localDateTime(schedule.startLocal);
  return nextAfter(
    validateRule(bodyOf(schedule.rrule), floatingDate(start)),
    schedule.timezone,
    after,
  );
}

export function previewOccurrences(
  schedule: Pick<ParsedSchedule, "rrule" | "timezone" | "startLocal">,
  from = new Date(),
  limit = 5,
): readonly Date[] {
  const first = localDateTime(schedule.startLocal);
  const rule = validateRule(bodyOf(schedule.rrule), floatingDate(first));
  const firstInstant = fromFloating(floatingDate(first), schedule.timezone);
  let cursor = from < firstInstant ? new Date(firstInstant.getTime() - 1) : from;
  const result: Date[] = [];
  for (let index = 0; index < limit; index += 1) {
    const next = nextAfter(rule, schedule.timezone, cursor);
    if (!next) break;
    result.push(next);
    cursor = next;
  }
  return result;
}
