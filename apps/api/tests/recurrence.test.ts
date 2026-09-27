import { describe, expect, it } from "vitest";
import {
  nextOccurrence,
  parseSchedule,
  previewOccurrences,
  RecurrenceValidationError,
} from "../src/modules/tasks/recurrence.js";

const base = {
  rrule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO",
  timezone: "America/New_York",
  startLocal: "2027-03-01T09:00:00",
  enabled: true,
} as const;

describe("recurrence engine", () => {
  it("canonicalizes a supported rule and calculates a future run", () => {
    const parsed = parseSchedule(base, new Date("2027-02-28T12:00:00.000Z"));
    expect(parsed.rrule).toBe("RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO");
    expect(parsed.nextRunAt?.toISOString()).toBe("2027-03-01T14:00:00.000Z");
  });

  it("keeps the local wall-clock hour across daylight saving time", () => {
    const parsed = parseSchedule(
      { ...base, startLocal: "2027-03-08T09:00:00" },
      new Date("2027-03-08T12:00:00.000Z"),
    );
    const next = nextOccurrence(parsed, parsed.nextRunAt ?? new Date("2027-03-08T14:00:00.000Z"));
    expect(next?.toISOString()).toBe("2027-03-15T13:00:00.000Z");
  });

  it("previews bounded occurrences and rejects invalid zones and unsupported frequency", () => {
    const preview = previewOccurrences(base, new Date("2027-02-28T12:00:00.000Z"), 2);
    expect(preview.map((value) => value.toISOString())).toEqual([
      "2027-03-01T14:00:00.000Z",
      "2027-03-08T14:00:00.000Z",
    ]);
    expect(() => parseSchedule({ ...base, timezone: "Not/AZone" })).toThrowError(
      new RecurrenceValidationError(
        "TIMEZONE_INVALID",
        "The timezone must be a valid IANA timezone.",
      ),
    );
    expect(() => parseSchedule({ ...base, rrule: "FREQ=HOURLY;INTERVAL=1" })).toThrow(
      "unsupported",
    );
  });

  it("rejects rules with no future occurrence", () => {
    expect(() =>
      parseSchedule({ ...base, rrule: "FREQ=DAILY;COUNT=1" }, new Date("2028-01-01T00:00:00.000Z")),
    ).toThrow("no future occurrences");
  });
});
