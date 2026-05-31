import { describe, expect, it } from "vitest";
import {
  calendarDateToIsoDate,
  formatSaudiDateTime,
  formatSaudiIsoDateForDisplay,
  getSaudiIsoDate,
  getSaudiTime24,
  getSaudiWeekdayShortFromIsoDate,
  isoDateToCalendarDate,
  parseSaudiDateTimeInput,
} from "@/lib/date-time";

describe("Saudi timezone date helpers", () => {
  it("derives Saudi ISO date at UTC boundary", () => {
    const source = new Date("2026-01-01T21:30:00.000Z");
    expect(getSaudiIsoDate(source)).toBe("2026-01-02");
  });

  it("derives Saudi 24h time from UTC input", () => {
    const source = new Date("2026-03-10T05:07:00.000Z");
    expect(getSaudiTime24(source)).toBe("08:07");
  });

  it("round-trips calendar date conversion without off-by-one", () => {
    const iso = "2026-09-23";
    const calendarDate = isoDateToCalendarDate(iso);
    expect(calendarDateToIsoDate(calendarDate)).toBe(iso);
  });

  it("formats date display strictly in Asia/Riyadh", () => {
    const source = new Date("2026-01-01T22:00:00.000Z");
    expect(formatSaudiDateTime(source, { year: "numeric", month: "2-digit", day: "2-digit" })).toBe("01/02/2026");
  });

  it("parses valid date-time input and rejects invalid patterns", () => {
    expect(parseSaudiDateTimeInput("2026-04-01T09:30")).toEqual({ date: "2026-04-01", time: "09:30" });
    expect(parseSaudiDateTimeInput("2026/04/01 09:30")).toBeNull();
  });

  it("gets Saudi weekday from ISO date", () => {
    expect(getSaudiWeekdayShortFromIsoDate("2026-09-25")).toBe("Fri");
  });

  it("formats ISO date display helper in Saudi timezone", () => {
    expect(formatSaudiIsoDateForDisplay("2026-02-22", { month: "short", day: "numeric", year: "numeric" })).toBe("Feb 22, 2026");
  });
});