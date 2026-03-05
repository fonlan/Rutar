import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FileTab, SyntaxKey, TabIndentMode } from '@/store/useStore';

type DetectedIndentationResponse = {
  mode?: string;
  width?: number;
} | null;

export interface EffectiveIndentation {
  mode: 'tabs' | 'spaces';
  width: number;
  indentText: string;
}

const indentationSensitiveSyntaxKeys = new Set<SyntaxKey>(['python', 'yaml']);

function normalizeIndentWidth(value: number | undefined, fallback: number): number {
  const source = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(8, Math.max(1, Math.floor(source)));
}

function buildEffectiveIndentation(mode: 'tabs' | 'spaces', width: number): EffectiveIndentation {
  const normalizedWidth = normalizeIndentWidth(width, 4);
  if (mode === 'spaces') {
    return {
      mode: 'spaces',
      width: normalizedWidth,
      indentText: ' '.repeat(normalizedWidth),
    };
  }

  return {
    mode: 'tabs',
    width: normalizedWidth,
    indentText: '\t',
  };
}

export function buildFallbackIndentation(
  tabIndentMode: TabIndentMode,
  tabWidth: number
): EffectiveIndentation {
  return buildEffectiveIndentation(tabIndentMode === 'spaces' ? 'spaces' : 'tabs', tabWidth);
}

function isIndentationSensitiveSyntaxKey(syntaxKey: SyntaxKey | null | undefined): boolean {
  return !!syntaxKey && indentationSensitiveSyntaxKeys.has(syntaxKey);
}

function isSameIndentation(left: EffectiveIndentation, right: EffectiveIndentation): boolean {
  return left.mode === right.mode && left.width === right.width;
}

export function useEffectiveIndentation({
  tab,
  activeSyntaxKey,
  tabIndentMode,
  tabWidth,
}: {
  tab: FileTab | null;
  activeSyntaxKey: SyntaxKey | null;
  tabIndentMode: TabIndentMode;
  tabWidth: number;
}) {
  const fallbackIndentation = useMemo(
    () => buildFallbackIndentation(tabIndentMode, tabWidth),
    [tabIndentMode, tabWidth]
  );
  const [effectiveIndentation, setEffectiveIndentation] = useState<EffectiveIndentation>(
    fallbackIndentation
  );
  const [refreshSerial, setRefreshSerial] = useState(0);
  const requestSerialRef = useRef(0);

  useEffect(() => {
    setEffectiveIndentation((previous) =>
      isSameIndentation(previous, fallbackIndentation) ? previous : fallbackIndentation
    );
  }, [fallbackIndentation]);

  useEffect(() => {
    if (!tab) {
      return;
    }

    const handleDocumentUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabId?: string }>;
      if (customEvent.detail?.tabId !== tab.id) {
        return;
      }

      setRefreshSerial((serial) => serial + 1);
    };

    window.addEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
    return () => {
      window.removeEventListener('rutar:document-updated', handleDocumentUpdated as EventListener);
    };
  }, [tab]);

  useEffect(() => {
    if (!tab || !isIndentationSensitiveSyntaxKey(activeSyntaxKey)) {
      setEffectiveIndentation((previous) =>
        isSameIndentation(previous, fallbackIndentation) ? previous : fallbackIndentation
      );
      return;
    }

    let cancelled = false;
    const requestSerial = requestSerialRef.current + 1;
    requestSerialRef.current = requestSerial;

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await invoke<DetectedIndentationResponse>('detect_document_indentation', {
            id: tab.id,
            maxLines: tab.largeFileMode ? 500 : 2000,
          });

          if (cancelled || requestSerial !== requestSerialRef.current) {
            return;
          }

          if (result?.mode === 'tabs') {
            const next = buildEffectiveIndentation('tabs', fallbackIndentation.width);
            setEffectiveIndentation((previous) =>
              isSameIndentation(previous, next) ? previous : next
            );
            return;
          }

          if (result?.mode === 'spaces') {
            const next = buildEffectiveIndentation(
              'spaces',
              normalizeIndentWidth(result.width, fallbackIndentation.width)
            );
            setEffectiveIndentation((previous) =>
              isSameIndentation(previous, next) ? previous : next
            );
            return;
          }

          setEffectiveIndentation((previous) =>
            isSameIndentation(previous, fallbackIndentation) ? previous : fallbackIndentation
          );
        } catch (error) {
          console.error(error);
          if (cancelled || requestSerial !== requestSerialRef.current) {
            return;
          }
          setEffectiveIndentation((previous) =>
            isSameIndentation(previous, fallbackIndentation) ? previous : fallbackIndentation
          );
        }
      })();
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeSyntaxKey, fallbackIndentation, refreshSerial, tab]);

  return effectiveIndentation;
}
