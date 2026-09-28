import { describe, expect, it } from "vitest";
import {
  buildCustom,
  describeRecurrence,
  matchPreset,
  parseCustom,
  presetLabel,
  presetRule,
  retargetRule,
  timezoneGroups,
  upcomingDueDates,
  type RecurrencePreset,
} from "./recurrenceRules";

// Wednesday 30 September 2026 is the fifth Wednesday, so the monthly preset is "last".
const DUE = "2026-09-30";

describe("repeat presets", () => {
  it.each<[RecurrencePreset, string, string]>([
    ["DAILY", "Daily", "FREQ=DAILY;INTERVAL=1"],
    ["WEEKLY", "Weekly on Wednesday", "FREQ=WEEKLY;INTERVAL=1;BYDAY=WE"],
    ["MONTHLY", "Monthly on the last Wednesday", "FREQ=MONTHLY;INTERVAL=1;BYDAY=-1WE"],
    ["YEARLY", "Annually on September 30", "FREQ=YEARLY;INTERVAL=1;BYMONTH=9;BYMONTHDAY=30"],
    ["WEEKDAYS", "Every weekday (Monday to Friday)", "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR"],
  ])("derives %s from the due date", (preset, label, rule) => {
    expect(presetLabel(preset, DUE)).toBe(label);
    expect(presetRule(preset, DUE)).toBe(rule);
    expect(matchPreset(`RRULE:${rule}`, DUE)).toBe(preset);
  });

  it("recognises saved legacy weekly rules as the matching preset", () => {
    expect(matchPreset("RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO", "2027-04-19")).toBe("WEEKLY");
    expect(matchPreset("RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO", "2027-04-21")).toBeNull();
  });

  it("uses the ordinal weekday for earlier weeks of the month", () => {
    expect(presetLabel("MONTHLY", "2026-09-16")).toBe("Monthly on the third Wednesday");
    expect(presetRule("MONTHLY", "2026-09-16")).toBe("FREQ=MONTHLY;INTERVAL=1;BYDAY=3WE");
  });
});

describe("custom recurrence", () => {
  it("builds and describes an interval, weekdays, and an inclusive end date", () => {
    const rule = buildCustom(
      {
        frequency: "WEEKLY",
        interval: 2,
        weekdays: ["FR", "MO"],
        monthlyMode: "DAY",
        end: "UNTIL",
        until: "2026-12-30",
        count: 13,
      },
      DUE,
    );
    expect(rule).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;UNTIL=20261230T235959");
    expect(describeRecurrence(rule, DUE)).toBe(
      "Every 2 weeks on Monday, Friday, until Dec 30, 2026",
    );
    expect(parseCustom(rule, DUE)).toMatchObject({
      exact: true,
      recurrence: { interval: 2, weekdays: ["MO", "FR"], end: "UNTIL", until: "2026-12-30" },
    });
  });

  it("describes a monthly day-of-month rule that ends after a count", () => {
    const rule = "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=30;COUNT=4";
    expect(describeRecurrence(rule, DUE)).toBe("Every 3 months on day 30, 4 times");
  });

  it("keeps a rule the editor cannot express and describes it readably", () => {
    const rule = "RRULE:FREQ=MONTHLY;BYDAY=MO,TU;BYSETPOS=-1";
    expect(parseCustom(rule, DUE).exact).toBe(false);
    expect(matchPreset(rule, DUE)).toBeNull();
    expect(retargetRule(rule, DUE, "2026-10-02")).toBe(rule);
    expect(describeRecurrence(rule, DUE)).toMatch(/^Every month/);
  });
});

describe("moving the due date", () => {
  it.each([
    [
      "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO",
      "2027-04-19",
      "2027-04-21",
      "FREQ=WEEKLY;INTERVAL=1;BYDAY=WE",
    ],
    [
      "FREQ=MONTHLY;INTERVAL=1;BYDAY=-1WE",
      "2026-09-30",
      "2026-10-01",
      "FREQ=MONTHLY;INTERVAL=1;BYDAY=1TH",
    ],
    [
      "FREQ=YEARLY;INTERVAL=1;BYMONTH=9;BYMONTHDAY=30",
      "2026-09-30",
      "2026-10-02",
      "FREQ=YEARLY;INTERVAL=1;BYMONTH=10;BYMONTHDAY=2",
    ],
    [
      "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE",
      "2027-04-19",
      "2027-04-20",
      "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE",
    ],
  ])("retargets %s from %s to %s", (rule, from, to, expected) => {
    expect(retargetRule(rule, from, to)).toBe(expected);
  });
});

it("groups time zones by region and always offers the current zone and UTC", () => {
  const groups = timezoneGroups("Etc/GMT+12");
  const values = groups.flatMap((group) => group.zones.map((zone) => zone.value));
  expect(values).toEqual(expect.arrayContaining(["UTC", "Etc/GMT+12", "Europe/Paris"]));
  expect(new Set(values).size).toBe(values.length);
  expect(groups.find((group) => group.region === "America")?.zones).toContainEqual({
    value: "America/New_York",
    label: "America / New York",
  });
});

it("lists the next due dates after the current one", () => {
  expect(
    upcomingDueDates("RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,FR", "2027-04-19T09:00:00"),
  ).toEqual(["2027-04-23", "2027-04-26", "2027-04-30"]);
  expect(upcomingDueDates("FREQ=DAILY;COUNT=2", "2027-04-19T09:00:00")).toEqual(["2027-04-20"]);
});
