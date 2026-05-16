import { useCallback, useEffect, useRef, useState } from 'react';

// Owns the Base64-decode error toast lifecycle for the main editor:
// shows it on demand, auto-hides it after a short delay, and clears the
// pending timer if the component unmounts in the meantime.
const BASE64_TOAST_DURATION_MS = 2200;

export function useEditorClipboard() {
  const [showBase64DecodeErrorToast, setShowBase64DecodeErrorToast] = useState(false);
  const timerRef = useRef<number | null>(null);

  const triggerBase64DecodeErrorToast = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    setShowBase64DecodeErrorToast(true);
    timerRef.current = window.setTimeout(() => {
      setShowBase64DecodeErrorToast(false);
      timerRef.current = null;
    }, BASE64_TOAST_DURATION_MS);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return { showBase64DecodeErrorToast, triggerBase64DecodeErrorToast };
}
