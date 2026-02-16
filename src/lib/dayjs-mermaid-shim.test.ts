import { describe, expect, it } from "vitest";
import dayjs from "./dayjs-mermaid-shim";

describe("dayjs-mermaid-shim", () => {
  it("supports strict format parsing and validity checks", () => {
    expect(dayjs("2026-02-15", "YYYY-MM-DD", true).isValid()).toBe(true);
    expect(dayjs("2026/02/15", "YYYY-MM-DD", true).isValid()).toBe(false);
  });

  it("formats common tokens", () => {
    const value = dayjs(new Date(2026, 1, 15, 9, 7, 5, 12));
    expect(value.format("YYYY-MM-DD HH:mm:ss")).toBe("2026-02-15 09:07:05");
    expect(value.format("M/D/YY dddd")).toContain("2/15/26 ");
  });

  it("supports add/subtract/startOf/endOf", () => {
    const base = dayjs(new Date(2026, 1, 15, 9, 30, 20, 600));

    expect(base.add(2, "day").format("YYYY-MM-DD")).toBe("2026-02-17");
    expect(base.subtract(1, "month").format("YYYY-MM-DD")).toBe("2026-01-15");
    expect(base.startOf("day").format("HH:mm:ss")).toBe("00:00:00");
    expect(base.endOf("second").format("ss.SSS")).toBe("20.999");
  });

  it("calculates diff with integer and float behavior", () => {
    const left = dayjs(new Date(2026, 1, 20, 0, 0, 0, 0));
    const right = dayjs(new Date(2026, 1, 18, 12, 0, 0, 0));

    expect(left.diff(right, "day")).toBe(1);
    expect(left.diff(right, "day", true)).toBeCloseTo(1.5, 5);
    expect(right.diff(left, "day")).toBe(-1);
  });

  it("calculates month/year diff branches", () => {
    const newer = dayjs(new Date(2027, 1, 1, 0, 0, 0, 0));
    const older = dayjs(new Date(2026, 1, 1, 0, 0, 0, 0));

    expect(newer.diff(older, "year")).toBe(1);
    expect(newer.diff(older, "month")).toBe(12);
  });

  it("supports unix/isDayjs/extend and duration", () => {
    const unix = dayjs.unix(10);
    expect(unix.valueOf()).toBe(10_000);
    expect(dayjs.isDayjs(unix)).toBe(true);
    expect(dayjs.extend({})).toBe(dayjs);

    expect(dayjs.duration(2, "second").asMilliseconds()).toBe(2000);
    expect(dayjs.duration({ minute: 1, second: 30 }).asMilliseconds()).toBe(90_000);
  });

  it("handles duration fallback inputs", () => {
    expect(dayjs.duration().asMilliseconds()).toBe(0);
    expect(dayjs.duration("bad-input" as unknown as number).asMilliseconds()).toBe(0);
    expect(dayjs.duration({ unknown: 2, minute: 1 } as unknown as Record<string, number>).asMilliseconds()).toBe(
      60_000
    );
  });

  it("returns invalid marker for invalid date formatting", () => {
    expect(dayjs(null).format()).toBe("Invalid Date");
  });

  it("supports additional startOf/endOf branches", () => {
    const base = dayjs(new Date(2026, 7, 19, 16, 45, 30, 123));
    expect(base.startOf("year").format("YYYY-MM-DD HH:mm:ss.SSS")).toBe("2026-01-01 00:00:00.000");
    expect(base.startOf("month").format("YYYY-MM-DD HH:mm:ss.SSS")).toBe("2026-08-01 00:00:00.000");
    expect(base.startOf("week").format("HH:mm:ss.SSS")).toBe("00:00:00.000");
    expect(base.startOf("hour").format("HH:mm:ss.SSS")).toBe("16:00:00.000");
    expect(base.startOf("minute").format("HH:mm:ss.SSS")).toBe("16:45:00.000");
    expect(base.endOf("minute").format("ss.SSS")).toBe("59.999");
  });
});
