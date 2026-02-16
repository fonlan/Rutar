import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("utils", () => {
  it("merges class names and resolves tailwind conflicts", () => {
    expect(cn("p-2", "text-sm", "p-4")).toBe("text-sm p-4");
    expect(cn("hidden", false && "block", "md:block")).toBe("hidden md:block");
  });

  it("supports object and array-like class inputs", () => {
    expect(cn(["px-2", null, "py-1"], { "text-red-500": true, "font-bold": false })).toBe(
      "px-2 py-1 text-red-500"
    );
  });

  it("returns empty string when all inputs are falsy", () => {
    expect(cn(undefined, null, false, "")).toBe("");
  });
});
