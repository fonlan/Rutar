import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("utils", () => {
  it("merges class names and resolves tailwind conflicts", () => {
    expect(cn("p-2", "text-sm", "p-4")).toBe("text-sm p-4");
    expect(cn("hidden", false && "block", "md:block")).toBe("hidden md:block");
  });
});
