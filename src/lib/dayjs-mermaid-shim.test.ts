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

  it("supports unix/isDayjs/extend and duration", () => {
    const unix = dayjs.unix(10);
    expect(unix.valueOf()).toBe(10_000);
    expect(dayjs.isDayjs(unix)).toBe(true);
    expect(dayjs.extend({})).toBe(dayjs);

    expect(dayjs.duration(2, "second").asMilliseconds()).toBe(2000);
    expect(dayjs.duration({ minute: 1, second: 30 }).asMilliseconds()).toBe(90_000);
  });

  it("returns invalid marker for invalid date formatting", () => {
    expect(dayjs(null).format()).toBe("Invalid Date");
  });
});
