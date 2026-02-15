import { describe, expect, it } from "vitest";
import {
  getDefaultMouseGestures,
  isMouseGestureAction,
  isValidMouseGesturePattern,
  normalizeMouseGesturePattern,
  sanitizeMouseGestures,
} from "./mouseGestures";

describe("mouseGestures", () => {
  it("returns cloned default gestures", () => {
    const first = getDefaultMouseGestures();
    const second = getDefaultMouseGestures();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);

    first[0].pattern = "X";
    expect(getDefaultMouseGestures()[0].pattern).toBe("L");
  });

  it("validates known gesture actions", () => {
    expect(isMouseGestureAction("nextTab")).toBe(true);
    expect(isMouseGestureAction("unknown")).toBe(false);
  });

  it("normalizes gesture patterns", () => {
    expect(normalizeMouseGesturePattern(" rd-lx ")).toBe("RDL");
    expect(normalizeMouseGesturePattern("lruuddddxxxx")).toBe("LRUUDDDD");
  });

  it("checks pattern validity", () => {
    expect(isValidMouseGesturePattern("LRD")).toBe(true);
    expect(isValidMouseGesturePattern("")).toBe(false);
    expect(isValidMouseGesturePattern("LRUUDDDDD")).toBe(false);
    expect(isValidMouseGesturePattern("LRA")).toBe(false);
  });

  it("sanitizes gestures and de-duplicates by normalized pattern", () => {
    const result = sanitizeMouseGestures([
      { pattern: " rd ", action: "closeCurrentTab" },
      { pattern: "RD", action: "nextTab" },
      { pattern: "x", action: "nextTab" },
      { pattern: "L", action: "invalid-action" },
      null,
      "x",
    ]);

    expect(result).toEqual([{ pattern: "RD", action: "closeCurrentTab" }]);
  });

  it("returns defaults for invalid/non-array and empty for explicit empty array", () => {
    expect(sanitizeMouseGestures(null)).toEqual(getDefaultMouseGestures());
    expect(sanitizeMouseGestures("invalid")).toEqual(getDefaultMouseGestures());
    expect(sanitizeMouseGestures([])).toEqual([]);
  });
});
