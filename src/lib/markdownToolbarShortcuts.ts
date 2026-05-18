import type { I18nKey } from '@/i18n';
import type { MarkdownToolbarAction } from './markdownToolbar';

/**
 * Markdown toolbar keyboard shortcut bindings, modelled after the
 * Typora "Edit / Paragraph / Format" shortcut tables documented at
 * https://support.typora.io/Shortcut-Keys/ .
 *
 * Each entry maps to one of the existing {@link MarkdownToolbarAction}
 * variants so we can drive the editor through the same dispatch path
 * the toolbar already uses.
 */

export interface ShortcutModifiers {
  /** Ctrl (Windows/Linux) or Control (Mac). */
  ctrl?: boolean;
  /** Command on Mac / Win key on Windows. Used for the "primary" modifier on Mac. */
  meta?: boolean;
  /** Alt (Windows/Linux) or Option (Mac). */
  alt?: boolean;
  shift?: boolean;
}

export interface ShortcutBinding {
  /** Physical key (`KeyboardEvent.code`) for layout-stable matching. */
  code: string;
  modifiers: ShortcutModifiers;
}

export interface PlatformBindings {
  mac?: ShortcutBinding;
  /** Used for Windows and Linux. */
  other?: ShortcutBinding;
}

export interface MarkdownToolbarShortcut {
  /** Stable identifier used by the toolbar to look up the label. */
  id: string;
  /** i18n key whose translation is the user-facing action name. */
  i18nKey: I18nKey;
  bindings: PlatformBindings;
  buildAction: () => MarkdownToolbarAction;
}

/**
 * The canonical, ordered list of Markdown toolbar shortcuts. The order
 * is preserved when rendered inside the settings keyboard-shortcut list.
 */
export const MARKDOWN_TOOLBAR_SHORTCUTS: readonly MarkdownToolbarShortcut[] = [
  // ---- Paragraph (Typora: Paragraph section) ----
  {
    id: 'set_heading.body',
    i18nKey: 'markdownToolbar.heading.body',
    bindings: {
      mac: { code: 'Digit0', modifiers: { meta: true } },
      other: { code: 'Digit0', modifiers: { ctrl: true } },
    },
    buildAction: () => ({ type: 'set_heading', level: 'body' }),
  },
  {
    id: 'set_heading.h1',
    i18nKey: 'markdownToolbar.heading.h1',
    bindings: {
      mac: { code: 'Digit1', modifiers: { meta: true } },
      other: { code: 'Digit1', modifiers: { ctrl: true } },
    },
    buildAction: () => ({ type: 'set_heading', level: 'h1' }),
  },
  {
    id: 'set_heading.h2',
    i18nKey: 'markdownToolbar.heading.h2',
    bindings: {
      mac: { code: 'Digit2', modifiers: { meta: true } },
      other: { code: 'Digit2', modifiers: { ctrl: true } },
    },
    buildAction: () => ({ type: 'set_heading', level: 'h2' }),
  },
  {
    id: 'set_heading.h3',
    i18nKey: 'markdownToolbar.heading.h3',
    bindings: {
      mac: { code: 'Digit3', modifiers: { meta: true } },
      other: { code: 'Digit3', modifiers: { ctrl: true } },
    },
    buildAction: () => ({ type: 'set_heading', level: 'h3' }),
  },
  {
    id: 'set_heading.h4',
    i18nKey: 'markdownToolbar.heading.h4',
    bindings: {
      mac: { code: 'Digit4', modifiers: { meta: true } },
      other: { code: 'Digit4', modifiers: { ctrl: true } },
    },
    buildAction: () => ({ type: 'set_heading', level: 'h4' }),
  },
  {
    id: 'set_heading.h5',
    i18nKey: 'markdownToolbar.heading.h5',
    bindings: {
      mac: { code: 'Digit5', modifiers: { meta: true } },
      other: { code: 'Digit5', modifiers: { ctrl: true } },
    },
    buildAction: () => ({ type: 'set_heading', level: 'h5' }),
  },
  {
    id: 'set_heading.h6',
    i18nKey: 'markdownToolbar.heading.h6',
    bindings: {
      mac: { code: 'Digit6', modifiers: { meta: true } },
      other: { code: 'Digit6', modifiers: { ctrl: true } },
    },
    buildAction: () => ({ type: 'set_heading', level: 'h6' }),
  },
  {
    id: 'toggle_ordered_list',
    i18nKey: 'markdownToolbar.orderedList',
    bindings: {
      mac: { code: 'KeyO', modifiers: { meta: true, alt: true } },
      other: { code: 'BracketLeft', modifiers: { ctrl: true, shift: true } },
    },
    buildAction: () => ({ type: 'toggle_ordered_list' }),
  },
  {
    id: 'toggle_unordered_list',
    i18nKey: 'markdownToolbar.unorderedList',
    bindings: {
      mac: { code: 'KeyU', modifiers: { meta: true, alt: true } },
      other: { code: 'BracketRight', modifiers: { ctrl: true, shift: true } },
    },
    buildAction: () => ({ type: 'toggle_unordered_list' }),
  },
  {
    id: 'toggle_quote',
    i18nKey: 'markdownToolbar.blockquote',
    bindings: {
      mac: { code: 'KeyQ', modifiers: { meta: true, alt: true } },
      other: { code: 'KeyQ', modifiers: { ctrl: true, shift: true } },
    },
    buildAction: () => ({ type: 'toggle_quote' }),
  },
  {
    id: 'indent',
    i18nKey: 'markdownToolbar.indent',
    bindings: {
      mac: { code: 'BracketLeft', modifiers: { meta: true } },
      other: { code: 'BracketLeft', modifiers: { ctrl: true } },
    },
    buildAction: () => ({ type: 'indent' }),
  },
  {
    id: 'outdent',
    i18nKey: 'markdownToolbar.outdent',
    bindings: {
      mac: { code: 'BracketRight', modifiers: { meta: true } },
      other: { code: 'BracketRight', modifiers: { ctrl: true } },
    },
    buildAction: () => ({ type: 'outdent' }),
  },
  {
    id: 'insert_code_block',
    i18nKey: 'markdownToolbar.codeBlock',
    bindings: {
      mac: { code: 'KeyC', modifiers: { meta: true, alt: true } },
      other: { code: 'KeyK', modifiers: { ctrl: true, shift: true } },
    },
    buildAction: () => ({ type: 'insert_code_block' }),
  },
  {
    id: 'insert_table',
    i18nKey: 'markdownToolbar.table',
    bindings: {
      mac: { code: 'KeyT', modifiers: { meta: true, alt: true } },
      other: { code: 'KeyT', modifiers: { ctrl: true } },
    },
    buildAction: () => ({ type: 'insert_table' }),
  },
  // ---- Format (Typora: Format section) ----
  {
    id: 'toggle_bold',
    i18nKey: 'markdownToolbar.bold',
    bindings: {
      mac: { code: 'KeyB', modifiers: { meta: true } },
      other: { code: 'KeyB', modifiers: { ctrl: true } },
    },
    buildAction: () => ({ type: 'toggle_bold' }),
  },
  {
    id: 'toggle_italic',
    i18nKey: 'markdownToolbar.italic',
    bindings: {
      mac: { code: 'KeyI', modifiers: { meta: true } },
      other: { code: 'KeyI', modifiers: { ctrl: true } },
    },
    buildAction: () => ({ type: 'toggle_italic' }),
  },
  {
    id: 'toggle_underline',
    i18nKey: 'markdownToolbar.underline',
    bindings: {
      mac: { code: 'KeyU', modifiers: { meta: true } },
      other: { code: 'KeyU', modifiers: { ctrl: true } },
    },
    buildAction: () => ({ type: 'toggle_underline' }),
  },
  {
    id: 'toggle_strikethrough',
    i18nKey: 'markdownToolbar.strikethrough',
    bindings: {
      // Typora uses Control+Shift+` on macOS, which avoids clashing with the
      // Command+Shift+` inline-code shortcut by using the Control modifier.
      mac: { code: 'Backquote', modifiers: { ctrl: true, shift: true } },
      other: { code: 'Digit5', modifiers: { alt: true, shift: true } },
    },
    buildAction: () => ({ type: 'toggle_strikethrough' }),
  },
  {
    id: 'toggle_inline_code',
    i18nKey: 'markdownToolbar.inlineCode',
    bindings: {
      mac: { code: 'Backquote', modifiers: { meta: true, shift: true } },
      other: { code: 'Backquote', modifiers: { ctrl: true, shift: true } },
    },
    buildAction: () => ({ type: 'toggle_inline_code' }),
  },
  // ---- Insert (Typora: Format / Hyperlink + Image) ----
  {
    id: 'insert_link',
    i18nKey: 'markdownToolbar.link',
    bindings: {
      mac: { code: 'KeyK', modifiers: { meta: true } },
      other: { code: 'KeyK', modifiers: { ctrl: true } },
    },
    buildAction: () => ({ type: 'insert_link' }),
  },
  {
    id: 'insert_image_url',
    i18nKey: 'markdownToolbar.image.url',
    bindings: {
      mac: { code: 'KeyI', modifiers: { meta: true, ctrl: true } },
      other: { code: 'KeyI', modifiers: { ctrl: true, shift: true } },
    },
    buildAction: () => ({ type: 'insert_image_url' }),
  },
];

const KEY_CODE_LABEL_MAP: Record<string, string> = {
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Quote: "'",
  Semicolon: ';',
  Space: 'Space',
};

function labelForKeyCode(code: string): string {
  if (KEY_CODE_LABEL_MAP[code]) {
    return KEY_CODE_LABEL_MAP[code];
  }
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3);
  }
  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5);
  }
  if (code.startsWith('Numpad') && code.length > 6) {
    return code.slice(6);
  }
  return code;
}

/**
 * Build a human-readable shortcut label, e.g. `Ctrl + Shift + B` on
 * Windows or `⇧ + ⌘ + B` on Mac. The Mac variant uses the standard
 * symbolic glyphs to match macOS conventions; the format mirrors the
 * `${primaryModifierLabel} + N` style used by the existing settings UI.
 */
export function formatShortcutLabel(binding: ShortcutBinding, isMac: boolean): string {
  const parts: string[] = [];
  if (isMac) {
    if (binding.modifiers.ctrl) parts.push('⌃');
    if (binding.modifiers.alt) parts.push('⌥');
    if (binding.modifiers.shift) parts.push('⇧');
    if (binding.modifiers.meta) parts.push('⌘');
  } else {
    if (binding.modifiers.ctrl) parts.push('Ctrl');
    if (binding.modifiers.alt) parts.push('Alt');
    if (binding.modifiers.shift) parts.push('Shift');
    if (binding.modifiers.meta) parts.push('Win');
  }
  parts.push(labelForKeyCode(binding.code));
  return parts.join(' + ');
}

/** Look up the platform-specific binding (if any) for a shortcut definition. */
export function getBindingForPlatform(
  shortcut: MarkdownToolbarShortcut,
  isMac: boolean,
): ShortcutBinding | null {
  const binding = isMac ? shortcut.bindings.mac : shortcut.bindings.other;
  return binding ?? null;
}

/**
 * Build a map of shortcut id → formatted label for the current platform.
 * Returns only entries that have a binding on the platform.
 */
export function buildShortcutLabelMap(isMac: boolean): Record<string, string> {
  const map: Record<string, string> = {};
  for (const shortcut of MARKDOWN_TOOLBAR_SHORTCUTS) {
    const binding = getBindingForPlatform(shortcut, isMac);
    if (binding) {
      map[shortcut.id] = formatShortcutLabel(binding, isMac);
    }
  }
  return map;
}

/**
 * Subset of `KeyboardEvent` consumed by {@link matchKeyboardEventToMarkdownShortcut}.
 * The shape keeps the matcher trivially testable without a full DOM event.
 */
export interface ShortcutKeyboardEventLike {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/**
 * Match a keyboard event to a Markdown toolbar action. Returns `null`
 * when nothing matches so callers can leave the event untouched.
 */
export function matchKeyboardEventToMarkdownShortcut(
  event: ShortcutKeyboardEventLike,
  isMac: boolean,
): MarkdownToolbarShortcut | null {
  for (const shortcut of MARKDOWN_TOOLBAR_SHORTCUTS) {
    const binding = getBindingForPlatform(shortcut, isMac);
    if (!binding) continue;
    if (event.code !== binding.code) continue;
    if (!!binding.modifiers.ctrl !== event.ctrlKey) continue;
    if (!!binding.modifiers.alt !== event.altKey) continue;
    if (!!binding.modifiers.shift !== event.shiftKey) continue;
    if (!!binding.modifiers.meta !== event.metaKey) continue;
    return shortcut;
  }
  return null;
}

/**
 * `true` when shortcuts should be ignored because the user is typing
 * inside a non-editor input control (e.g. the search panel input).
 * Inputs that live inside a Monaco editor are intentionally not skipped.
 */
export function shouldSkipShortcutForTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.closest('.monaco-editor')) {
    return false;
  }
  const tagName = target.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  return false;
}
