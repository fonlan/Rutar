import { describe, expect, it } from 'vitest';
import {
  MARKDOWN_TOOLBAR_SHORTCUTS,
  buildShortcutLabelMap,
  formatShortcutLabel,
  getBindingForPlatform,
  matchKeyboardEventToMarkdownShortcut,
  type ShortcutKeyboardEventLike,
} from './markdownToolbarShortcuts';

function makeEvent(overrides: Partial<ShortcutKeyboardEventLike>): ShortcutKeyboardEventLike {
  return {
    code: '',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...overrides,
  };
}

describe('formatShortcutLabel', () => {
  it('uses Ctrl + ... layout on non-Mac', () => {
    expect(
      formatShortcutLabel(
        { code: 'KeyB', modifiers: { ctrl: true } },
        false,
      ),
    ).toBe('Ctrl + B');
  });

  it('uses ⌘ + ... glyphs on Mac', () => {
    expect(
      formatShortcutLabel(
        { code: 'KeyB', modifiers: { meta: true } },
        true,
      ),
    ).toBe('⌘ + B');
  });

  it('orders modifiers as Ctrl / Alt / Shift / Meta on non-Mac', () => {
    expect(
      formatShortcutLabel(
        { code: 'KeyK', modifiers: { ctrl: true, shift: true } },
        false,
      ),
    ).toBe('Ctrl + Shift + K');
  });

  it('renders bracket and backquote codes as printable characters', () => {
    expect(
      formatShortcutLabel(
        { code: 'BracketLeft', modifiers: { ctrl: true } },
        false,
      ),
    ).toBe('Ctrl + [');
    expect(
      formatShortcutLabel(
        { code: 'Backquote', modifiers: { ctrl: true, shift: true } },
        false,
      ),
    ).toBe('Ctrl + Shift + `');
  });

  it('renders Digit codes as the bare numeral', () => {
    expect(
      formatShortcutLabel(
        { code: 'Digit0', modifiers: { ctrl: true } },
        false,
      ),
    ).toBe('Ctrl + 0');
  });
});

describe('matchKeyboardEventToMarkdownShortcut', () => {
  it('matches Bold on Windows with Ctrl+B and returns toggle_bold', () => {
    const matched = matchKeyboardEventToMarkdownShortcut(
      makeEvent({ code: 'KeyB', ctrlKey: true }),
      false,
    );
    expect(matched).not.toBeNull();
    expect(matched?.id).toBe('toggle_bold');
    expect(matched?.buildAction()).toEqual({ type: 'toggle_bold' });
  });

  it('matches Bold on Mac with Cmd+B', () => {
    const matched = matchKeyboardEventToMarkdownShortcut(
      makeEvent({ code: 'KeyB', metaKey: true }),
      true,
    );
    expect(matched?.id).toBe('toggle_bold');
  });

  it('does not confuse Ctrl+Shift+B with Ctrl+B', () => {
    const matched = matchKeyboardEventToMarkdownShortcut(
      makeEvent({ code: 'KeyB', ctrlKey: true, shiftKey: true }),
      false,
    );
    expect(matched).toBeNull();
  });

  it('matches Typora heading shortcuts Ctrl+0..6 and dispatches set_heading', () => {
    const headingLevels = [
      ['Digit0', 'body'],
      ['Digit1', 'h1'],
      ['Digit2', 'h2'],
      ['Digit3', 'h3'],
      ['Digit4', 'h4'],
      ['Digit5', 'h5'],
      ['Digit6', 'h6'],
    ] as const;
    for (const [code, level] of headingLevels) {
      const matched = matchKeyboardEventToMarkdownShortcut(
        makeEvent({ code, ctrlKey: true }),
        false,
      );
      expect(matched?.buildAction()).toEqual({ type: 'set_heading', level });
    }
  });

  it('matches the Ctrl+Shift+[ ordered list shortcut on Windows', () => {
    const matched = matchKeyboardEventToMarkdownShortcut(
      makeEvent({ code: 'BracketLeft', ctrlKey: true, shiftKey: true }),
      false,
    );
    expect(matched?.id).toBe('toggle_ordered_list');
  });

  it('matches the Cmd+Opt+O ordered list shortcut on Mac', () => {
    const matched = matchKeyboardEventToMarkdownShortcut(
      makeEvent({ code: 'KeyO', metaKey: true, altKey: true }),
      true,
    );
    expect(matched?.id).toBe('toggle_ordered_list');
  });

  it('matches Ctrl+[ for indent (Typora convention)', () => {
    const matched = matchKeyboardEventToMarkdownShortcut(
      makeEvent({ code: 'BracketLeft', ctrlKey: true }),
      false,
    );
    expect(matched?.buildAction()).toEqual({ type: 'indent' });
  });

  it('matches Ctrl+] for outdent (Typora convention)', () => {
    const matched = matchKeyboardEventToMarkdownShortcut(
      makeEvent({ code: 'BracketRight', ctrlKey: true }),
      false,
    );
    expect(matched?.buildAction()).toEqual({ type: 'outdent' });
  });

  it('matches Ctrl+K for insert_link', () => {
    const matched = matchKeyboardEventToMarkdownShortcut(
      makeEvent({ code: 'KeyK', ctrlKey: true }),
      false,
    );
    expect(matched?.buildAction()).toEqual({ type: 'insert_link' });
  });

  it('matches Ctrl+Shift+I for insert_image_url', () => {
    const matched = matchKeyboardEventToMarkdownShortcut(
      makeEvent({ code: 'KeyI', ctrlKey: true, shiftKey: true }),
      false,
    );
    expect(matched?.id).toBe('insert_image_url');
    expect(matched?.buildAction()).toEqual({ type: 'insert_image_url' });
  });

  it('returns null for unrelated key combinations', () => {
    expect(
      matchKeyboardEventToMarkdownShortcut(makeEvent({ code: 'KeyZ', ctrlKey: true }), false),
    ).toBeNull();
    expect(
      matchKeyboardEventToMarkdownShortcut(makeEvent({ code: 'F5' }), false),
    ).toBeNull();
  });

  it('does not match a shortcut without the right modifiers (Bold needs Ctrl)', () => {
    expect(
      matchKeyboardEventToMarkdownShortcut(makeEvent({ code: 'KeyB' }), false),
    ).toBeNull();
  });

  it('does not bleed Mac bindings into Windows matching', () => {
    // Cmd+Opt+O on Mac → ordered list. On non-Mac that combo should not match
    // anything because Mac bindings are gated behind the Mac platform flag.
    expect(
      matchKeyboardEventToMarkdownShortcut(
        makeEvent({ code: 'KeyO', metaKey: true, altKey: true }),
        false,
      ),
    ).toBeNull();
  });
});

describe('buildShortcutLabelMap', () => {
  it('produces labels for every Markdown toolbar shortcut on non-Mac', () => {
    const labels = buildShortcutLabelMap(false);
    for (const shortcut of MARKDOWN_TOOLBAR_SHORTCUTS) {
      expect(labels[shortcut.id]).toBeTruthy();
    }
  });

  it('matches the value returned by formatShortcutLabel for the platform binding', () => {
    const labels = buildShortcutLabelMap(true);
    for (const shortcut of MARKDOWN_TOOLBAR_SHORTCUTS) {
      const binding = getBindingForPlatform(shortcut, true);
      if (!binding) continue;
      expect(labels[shortcut.id]).toBe(formatShortcutLabel(binding, true));
    }
  });
});
