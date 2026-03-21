import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useEditorLayoutConfig } from "./useEditorLayoutConfig";

interface LayoutSnapshot {
  renderedFontSizePx: number;
  lineHeightPx: number;
  itemSize: number;
}

let latestSnapshot: LayoutSnapshot | null = null;

function restoreProperty(
  target: object,
  key: string,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  Reflect.deleteProperty(target, key);
}

function HookHarness() {
  const { renderedFontSizePx, lineHeightPx, itemSize } = useEditorLayoutConfig({
    settings: {
      fontSize: 14,
      tabWidth: 4,
      wordWrap: false,
      showLineNumbers: true,
      highlightCurrentLine: true,
    },
    width: 960,
    tabLineCount: 100,
    tabLargeFileMode: false,
    editableSegmentStartLine: 0,
    editableSegmentEndLine: 100,
    largeFilePlainRenderLineThreshold: 20_000,
    isPlainTextMode: false,
  });

  latestSnapshot = {
    renderedFontSizePx,
    lineHeightPx,
    itemSize,
  };

  return null;
}

describe("useEditorLayoutConfig", () => {
  it("aligns line height to device pixel steps to avoid periodic row seam artifacts", () => {
    latestSnapshot = null;
    const originalDevicePixelRatioDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "devicePixelRatio",
    );

    try {
      Object.defineProperty(window, "devicePixelRatio", {
        configurable: true,
        value: 1.25,
      });

      render(<HookHarness />);
      const snapshot = latestSnapshot as LayoutSnapshot | null;
      expect(snapshot).toBeTruthy();
      if (!snapshot) {
        throw new Error("Hook snapshot was not captured");
      }
      expect(snapshot.itemSize).toBe(snapshot.lineHeightPx);
      expect(snapshot.lineHeightPx).toBeCloseTo(21.6, 4);

      const physicalLineHeight = snapshot.lineHeightPx * 1.25;
      expect(Math.abs(physicalLineHeight - Math.round(physicalLineHeight))).toBeLessThan(
        0.0001,
      );
    } finally {
      restoreProperty(window, "devicePixelRatio", originalDevicePixelRatioDescriptor);
    }
  });
});
