export type MouseGestureDirection = 'L' | 'R' | 'U' | 'D';

export type MouseGestureAction =
  | 'previousTab'
  | 'nextTab'
  | 'toTop'
  | 'toBottom'
  | 'closeCurrentTab'
  | 'closeAllTabs'
  | 'closeOtherTabs'
  | 'quitApp'
  | 'toggleSidebar'
  | 'toggleOutline'
  | 'toggleBookmarkSidebar'
  | 'toggleWordWrap'
  | 'openSettings';

export interface MouseGestureBinding {
  pattern: string;
  action: MouseGestureAction;
}

export const MOUSE_GESTURE_ACTIONS: MouseGestureAction[] = [
  'previousTab',
  'nextTab',
  'toTop',
  'toBottom',
  'closeCurrentTab',
  'closeAllTabs',
  'closeOtherTabs',
  'quitApp',
  'toggleSidebar',
  'toggleOutline',
  'toggleBookmarkSidebar',
  'toggleWordWrap',
  'openSettings',
];

const VALID_DIRECTIONS = new Set<MouseGestureDirection>(['L', 'R', 'U', 'D']);

const VALID_ACTIONS = new Set<MouseGestureAction>(MOUSE_GESTURE_ACTIONS);

const DEFAULT_MOUSE_GESTURES: MouseGestureBinding[] = [
  { pattern: 'L', action: 'previousTab' },
  { pattern: 'R', action: 'nextTab' },
  { pattern: 'U', action: 'toggleOutline' },
  { pattern: 'D', action: 'toggleSidebar' },
];

export function getDefaultMouseGestures(): MouseGestureBinding[] {
  return DEFAULT_MOUSE_GESTURES.map((gesture) => ({ ...gesture }));
}

export function isMouseGestureAction(value: string): value is MouseGestureAction {
  return VALID_ACTIONS.has(value as MouseGestureAction);
}

export function normalizeMouseGesturePattern(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^LRUD]/g, '')
    .slice(0, 8);
}

export function isValidMouseGesturePattern(value: string): boolean {
  if (value.length === 0 || value.length > 8) {
    return false;
  }

  for (const char of value) {
    if (!VALID_DIRECTIONS.has(char as MouseGestureDirection)) {
      return false;
    }
  }

  return true;
}

export function sanitizeMouseGestures(input: unknown): MouseGestureBinding[] {
  if (!Array.isArray(input)) {
    return getDefaultMouseGestures();
  }

  if (input.length === 0) {
    return [];
  }

  const seenPatterns = new Set<string>();
  const normalized: MouseGestureBinding[] = [];

  for (const item of input) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const gesture = item as Partial<MouseGestureBinding>;
    if (typeof gesture.pattern !== 'string' || typeof gesture.action !== 'string') {
      continue;
    }

    const pattern = normalizeMouseGesturePattern(gesture.pattern);
    if (!isValidMouseGesturePattern(pattern)) {
      continue;
    }

    if (!isMouseGestureAction(gesture.action)) {
      continue;
    }

    if (seenPatterns.has(pattern)) {
      continue;
    }

    seenPatterns.add(pattern);
    normalized.push({ pattern, action: gesture.action });
  }

  return normalized.length > 0 ? normalized : getDefaultMouseGestures();
}
