interface EditorBase64DecodeToastProps {
  visible: boolean;
  message: string;
}

export function EditorBase64DecodeToast({ visible, message }: EditorBase64DecodeToastProps) {
  return (
    <div
      className={`pointer-events-none fixed bottom-6 right-6 z-[100] rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-900 shadow-lg transition-[opacity,transform] dark:text-red-200 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
      }`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
