import { useEffect } from 'react';
import {
  type MouseGestureAction,
  type MouseGestureBinding,
  normalizeMouseGesturePattern,
} from '@/lib/mouseGestures';

interface UseMouseGesturesOptions {
  enabled: boolean;
  bindings: MouseGestureBinding[];
  onAction: (action: MouseGestureAction) => void;
  onPreview?: (sequence: string) => void;
  areaSelector?: string;
}

const DIRECTION_THRESHOLD = 18;
const GESTURE_DISTANCE_THRESHOLD = 6;
const TRAIL_POINT_DISTANCE_THRESHOLD = 1.5;
const FINALIZE_DIRECTION_THRESHOLD = 8;
const CONTEXT_MENU_SUPPRESSION_WINDOW_MS = 2000;
const CONTEXT_MENU_SUPPRESSION_BUDGET = 3;
const CONTEXT_MENU_SUPPRESSION_DISTANCE_THRESHOLD = 32;
const TRAIL_CLEAR_DELAY_MS = 180;
const PREVIEW_CLEAR_DELAY_MS = 180;
const DEFAULT_AREA_SELECTOR = '[data-rutar-app-root="true"]';

/**
 * Right-button drag gesture recognizer. Reads pointer events on the document,
 * classifies short drags into a direction sequence (e.g. "RUL"), looks up
 * matching bindings, and invokes `onAction`. Also draws an on-screen trail
 * and suppresses the OS context menu when a gesture was attempted.
 *
 * Extracted from App.tsx (previously ~450 inline lines). See P1-1 in TODO.md.
 */
export function useMouseGestures({
  enabled,
  bindings,
  onAction,
  onPreview,
  areaSelector = DEFAULT_AREA_SELECTOR,
}: UseMouseGesturesOptions) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const gestureByPattern = new Map<string, MouseGestureAction>();
    for (const binding of bindings) {
      const normalizedPattern = normalizeMouseGesturePattern(binding.pattern);
      if (!normalizedPattern) {
        continue;
      }
      gestureByPattern.set(normalizedPattern, binding.action);
    }

    if (gestureByPattern.size === 0) {
      return;
    }

    const state = {
      active: false,
      pointerId: -1,
      pointerCaptureTarget: null as Element | null,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      trailLastX: 0,
      trailLastY: 0,
      sequence: '',
      movedEnough: false,
      suppressedPlainContextMenu: false,
      suppressContextMenuBudget: 0,
      suppressContextMenuUntil: 0,
      suppressContextMenuX: 0,
      suppressContextMenuY: 0,
      clearTrailTimer: null as number | null,
      clearPreviewTimer: null as number | null,
    };

    const emitPreview = (sequence: string) => {
      onPreview?.(sequence);
    };

    const resolveGestureAction = (sequence: string): MouseGestureAction | undefined => {
      let candidate = sequence;
      while (candidate.length > 0) {
        const matched = gestureByPattern.get(candidate);
        if (matched) {
          return matched;
        }
        candidate = candidate.slice(0, -1);
      }
      return undefined;
    };

    const registerContextMenuSuppression = (clientX: number, clientY: number) => {
      const now = performance.now();
      state.suppressContextMenuBudget = Math.max(
        state.suppressContextMenuBudget,
        CONTEXT_MENU_SUPPRESSION_BUDGET,
      );
      state.suppressContextMenuUntil = Math.max(
        state.suppressContextMenuUntil,
        now + CONTEXT_MENU_SUPPRESSION_WINDOW_MS,
      );
      state.suppressContextMenuX = clientX;
      state.suppressContextMenuY = clientY;
    };

    const consumeContextMenuSuppression = (clientX: number, clientY: number) => {
      if (state.suppressContextMenuBudget <= 0) {
        return false;
      }

      const now = performance.now();
      if (state.suppressContextMenuUntil <= now) {
        state.suppressContextMenuBudget = 0;
        state.suppressContextMenuUntil = 0;
        return false;
      }

      const distanceFromLastFinalize = Math.hypot(
        clientX - state.suppressContextMenuX,
        clientY - state.suppressContextMenuY,
      );
      if (distanceFromLastFinalize > CONTEXT_MENU_SUPPRESSION_DISTANCE_THRESHOLD) {
        return false;
      }

      state.suppressContextMenuBudget = Math.max(0, state.suppressContextMenuBudget - 1);
      if (state.suppressContextMenuBudget === 0) {
        state.suppressContextMenuUntil = 0;
      }

      return true;
    };

    const trailCanvas = document.createElement('canvas');
    trailCanvas.style.position = 'fixed';
    trailCanvas.style.left = '0';
    trailCanvas.style.top = '0';
    trailCanvas.style.width = '100vw';
    trailCanvas.style.height = '100vh';
    trailCanvas.style.pointerEvents = 'none';
    trailCanvas.style.zIndex = '9999';
    trailCanvas.style.opacity = '1';

    const trailContext = trailCanvas.getContext('2d');
    let trailCanvasAttached = false;

    const syncTrailCanvasSize = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      trailCanvas.width = Math.floor(window.innerWidth * dpr);
      trailCanvas.height = Math.floor(window.innerHeight * dpr);

      if (trailContext) {
        trailContext.setTransform(dpr, 0, 0, dpr, 0, 0);
        trailContext.lineCap = 'round';
        trailContext.lineJoin = 'round';
        trailContext.lineWidth = 2.5;
        trailContext.strokeStyle = document.documentElement.classList.contains('dark')
          ? 'rgba(96, 165, 250, 0.95)'
          : 'rgba(37, 99, 235, 0.9)';
      }
    };

    const attachTrailCanvas = () => {
      if (trailCanvasAttached) {
        return;
      }
      syncTrailCanvasSize();
      document.body.appendChild(trailCanvas);
      trailCanvasAttached = true;
    };

    const detachTrailCanvas = () => {
      if (!trailCanvasAttached) {
        return;
      }
      trailCanvas.remove();
      trailCanvasAttached = false;
    };

    const clearTrail = () => {
      if (!trailContext) {
        return;
      }
      trailContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };

    const scheduleTrailClear = () => {
      if (state.clearTrailTimer !== null) {
        window.clearTimeout(state.clearTrailTimer);
      }
      state.clearTrailTimer = window.setTimeout(() => {
        clearTrail();
        detachTrailCanvas();
        state.clearTrailTimer = null;
      }, TRAIL_CLEAR_DELAY_MS);
    };

    const clearGesturePreview = () => {
      emitPreview('');
    };

    const scheduleGesturePreviewClear = () => {
      if (state.clearPreviewTimer !== null) {
        window.clearTimeout(state.clearPreviewTimer);
      }
      state.clearPreviewTimer = window.setTimeout(() => {
        clearGesturePreview();
        state.clearPreviewTimer = null;
      }, PREVIEW_CLEAR_DELAY_MS);
    };

    const drawTrailSegment = (fromX: number, fromY: number, toX: number, toY: number) => {
      if (!trailContext) {
        return;
      }
      trailContext.beginPath();
      trailContext.moveTo(fromX, fromY);
      trailContext.lineTo(toX, toY);
      trailContext.stroke();
    };

    const releasePointerCaptureIfNeeded = () => {
      const captureTarget = state.pointerCaptureTarget;
      const pointerId = state.pointerId;
      state.pointerCaptureTarget = null;

      if (!captureTarget || pointerId < 0) {
        return;
      }

      if (typeof captureTarget.hasPointerCapture === 'function' && !captureTarget.hasPointerCapture(pointerId)) {
        return;
      }

      try {
        captureTarget.releasePointerCapture(pointerId);
      } catch {
        // Ignore release failures from unsupported or stale pointer capture state.
      }
    };

    const reset = () => {
      releasePointerCaptureIfNeeded();
      state.active = false;
      state.pointerId = -1;
      state.startX = 0;
      state.startY = 0;
      state.lastX = 0;
      state.lastY = 0;
      state.trailLastX = 0;
      state.trailLastY = 0;
      state.sequence = '';
      state.movedEnough = false;
      state.suppressedPlainContextMenu = false;
    };

    const appendDirection = (dx: number, dy: number, threshold: number) => {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx < threshold && absDy < threshold) {
        return false;
      }

      const direction = absDx >= absDy ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
      if (!state.sequence.endsWith(direction)) {
        state.sequence += direction;
        emitPreview(state.sequence);
      }

      return true;
    };

    const beginGesture = (target: Element, pointerId: number, clientX: number, clientY: number) => {
      releasePointerCaptureIfNeeded();
      state.active = true;
      state.pointerId = pointerId;
      state.pointerCaptureTarget = pointerId >= 0 ? target : null;
      state.startX = clientX;
      state.startY = clientY;
      state.lastX = clientX;
      state.lastY = clientY;
      state.trailLastX = clientX;
      state.trailLastY = clientY;
      state.sequence = '';
      state.movedEnough = false;
      state.suppressedPlainContextMenu = false;
      attachTrailCanvas();
      clearGesturePreview();

      if (state.clearTrailTimer !== null) {
        window.clearTimeout(state.clearTrailTimer);
        state.clearTrailTimer = null;
      }

      if (state.clearPreviewTimer !== null) {
        window.clearTimeout(state.clearPreviewTimer);
        state.clearPreviewTimer = null;
      }

      clearTrail();
    };

    const updateGesture = (clientX: number, clientY: number) => {
      const trailDx = clientX - state.trailLastX;
      const trailDy = clientY - state.trailLastY;
      if (Math.hypot(trailDx, trailDy) >= TRAIL_POINT_DISTANCE_THRESHOLD) {
        drawTrailSegment(state.trailLastX, state.trailLastY, clientX, clientY);
        state.trailLastX = clientX;
        state.trailLastY = clientY;
      }

      const totalDx = clientX - state.startX;
      const totalDy = clientY - state.startY;
      if (!state.movedEnough && Math.hypot(totalDx, totalDy) >= GESTURE_DISTANCE_THRESHOLD) {
        state.movedEnough = true;
        if (state.suppressedPlainContextMenu) {
          state.suppressedPlainContextMenu = false;
          window.dispatchEvent(new CustomEvent('rutar:mouse-gesture-started-after-contextmenu'));
        }
      }

      const dx = clientX - state.lastX;
      const dy = clientY - state.lastY;

      if (appendDirection(dx, dy, DIRECTION_THRESHOLD)) {
        state.lastX = clientX;
        state.lastY = clientY;
      }
    };

    const findEventElement = (event: Event) => event.target instanceof Element
      ? event.target
      : event.composedPath().find((entry) => entry instanceof Element) as Element | undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const pointerType = event.pointerType?.toLowerCase();
      if (pointerType && pointerType !== 'mouse') {
        return;
      }

      if (event.button !== 2 && (event.buttons & 2) !== 2) {
        return;
      }

      const target = findEventElement(event);
      if (!target?.closest(areaSelector)) {
        return;
      }

      beginGesture(target, event.pointerId, event.clientX, event.clientY);

      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        state.pointerCaptureTarget = null;
      }
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (state.active) {
        return;
      }

      if (event.button !== 2 && (event.buttons & 2) !== 2) {
        return;
      }

      const target = findEventElement(event);
      if (!target?.closest(areaSelector)) {
        return;
      }

      beginGesture(target, -1, event.clientX, event.clientY);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!state.active || event.pointerId !== state.pointerId) {
        return;
      }

      updateGesture(event.clientX, event.clientY);
    };
    const handleMouseMove = (event: MouseEvent) => {
      if (!state.active) {
        return;
      }

      if (event.buttons !== 0 && (event.buttons & 2) !== 2) {
        return;
      }

      updateGesture(event.clientX, event.clientY);
    };

    const finalizeGesture = (clientX: number, clientY: number) => {
      appendDirection(clientX - state.lastX, clientY - state.lastY, FINALIZE_DIRECTION_THRESHOLD);

      const pattern = state.sequence;
      const wasGestureAttempt = state.movedEnough || pattern.length > 0;
      const action = pattern ? resolveGestureAction(pattern) : undefined;

      if (action) {
        registerContextMenuSuppression(clientX, clientY);
        onAction(action);
      } else if (wasGestureAttempt) {
        registerContextMenuSuppression(clientX, clientY);
      }

      scheduleTrailClear();

      if (pattern.length > 0) {
        scheduleGesturePreviewClear();
      } else {
        clearGesturePreview();
      }

      reset();

      return {
        actionMatched: !!action,
        wasGestureAttempt,
      };
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!state.active || event.pointerId !== state.pointerId) {
        return;
      }

      const { actionMatched, wasGestureAttempt } = finalizeGesture(event.clientX, event.clientY);
      if (actionMatched || wasGestureAttempt) {
        event.preventDefault();
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (!state.active) {
        return;
      }

      if (event.button !== 2 && (event.buttons & 2) === 2) {
        return;
      }

      const { actionMatched, wasGestureAttempt } = finalizeGesture(event.clientX, event.clientY);
      if (actionMatched || wasGestureAttempt) {
        event.preventDefault();
      }
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (!state.active || event.pointerId !== state.pointerId) {
        return;
      }

      const { actionMatched, wasGestureAttempt } = finalizeGesture(state.trailLastX, state.trailLastY);
      if (actionMatched || wasGestureAttempt) {
        event.preventDefault();
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      const suppressContextMenuEvent = () => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
      };

      if (state.active) {
        const pattern = state.sequence;
        const wasGestureAttempt = state.movedEnough || pattern.length > 0;
        if (!wasGestureAttempt) {
          // ponytail: let a plain right click open the editor menu, but keep the
          // gesture alive in case the user is still holding the button and drags.
          state.suppressedPlainContextMenu = true;
          return;
        }

        const { actionMatched, wasGestureAttempt: finalizedGestureAttempt } = finalizeGesture(event.clientX, event.clientY);
        if (actionMatched || finalizedGestureAttempt || consumeContextMenuSuppression(event.clientX, event.clientY)) {
          suppressContextMenuEvent();
        }
        return;
      }

      if (!consumeContextMenuSuppression(event.clientX, event.clientY)) {
        return;
      }

      suppressContextMenuEvent();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('pointermove', handlePointerMove, true);
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('pointerup', handlePointerUp, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('pointercancel', handlePointerCancel, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('resize', syncTrailCanvasSize);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('pointermove', handlePointerMove, true);
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('pointerup', handlePointerUp, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
      document.removeEventListener('pointercancel', handlePointerCancel, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('resize', syncTrailCanvasSize);

      if (state.clearTrailTimer !== null) {
        window.clearTimeout(state.clearTrailTimer);
      }

      if (state.clearPreviewTimer !== null) {
        window.clearTimeout(state.clearPreviewTimer);
      }

      clearGesturePreview();
      releasePointerCaptureIfNeeded();
      detachTrailCanvas();
    };
  }, [enabled, bindings, onAction, onPreview, areaSelector]);
}
