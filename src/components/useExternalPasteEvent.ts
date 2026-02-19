import { useEffect } from 'react';

interface UseExternalPasteEventParams<TDetail extends { text?: string }> {
  eventName: string;
  shouldHandle: (detail: TDetail) => boolean;
  onPasteText: (text: string, detail: TDetail) => void;
}

export function useExternalPasteEvent<TDetail extends { text?: string }>({
  eventName,
  shouldHandle,
  onPasteText,
}: UseExternalPasteEventParams<TDetail>) {
  useEffect(() => {
    const handleExternalPaste = (event: Event) => {
      const customEvent = event as CustomEvent<TDetail | undefined>;
      const detail = customEvent.detail;
      if (!detail || !shouldHandle(detail)) {
        return;
      }

      const text = typeof detail.text === 'string' ? detail.text : '';
      onPasteText(text, detail);
    };

    window.addEventListener(eventName, handleExternalPaste as EventListener);
    return () => {
      window.removeEventListener(eventName, handleExternalPaste as EventListener);
    };
  }, [eventName, onPasteText, shouldHandle]);
}
