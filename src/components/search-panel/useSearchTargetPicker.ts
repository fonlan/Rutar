import { open } from '@tauri-apps/plugin-dialog';
import { useCallback } from 'react';

interface UseSearchTargetPickerOptions {
  currentTarget: string;
  pickFileTitle: string;
  pickFolderTitle: string;
  setSearchTarget: (value: string) => void;
  setErrorMessage: (value: string | null) => void;
  setFeedbackMessage: (value: string | null) => void;
}

export interface UseSearchTargetPickerResult {
  handlePickSearchTargetFile: () => void;
  handlePickSearchTargetFolder: () => void;
}

export function useSearchTargetPicker({
  currentTarget,
  pickFileTitle,
  pickFolderTitle,
  setSearchTarget,
  setErrorMessage,
  setFeedbackMessage,
}: UseSearchTargetPickerOptions): UseSearchTargetPickerResult {
  const resolveDefaultPath = useCallback(() => {
    const trimmed = currentTarget.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, [currentTarget]);

  const handlePickSearchTargetFile = useCallback(() => {
    void (async () => {
      try {
        const result = await open({
          multiple: false,
          directory: false,
          title: pickFileTitle,
          defaultPath: resolveDefaultPath(),
        });
        if (typeof result === 'string' && result.length > 0) {
          setSearchTarget(result);
          setErrorMessage(null);
          setFeedbackMessage(null);
        }
      } catch (error) {
        console.warn('Failed to pick search target file:', error);
      }
    })();
  }, [pickFileTitle, resolveDefaultPath, setErrorMessage, setFeedbackMessage, setSearchTarget]);

  const handlePickSearchTargetFolder = useCallback(() => {
    void (async () => {
      try {
        const result = await open({
          multiple: false,
          directory: true,
          title: pickFolderTitle,
          defaultPath: resolveDefaultPath(),
        });
        if (typeof result === 'string' && result.length > 0) {
          setSearchTarget(result);
          setErrorMessage(null);
          setFeedbackMessage(null);
        }
      } catch (error) {
        console.warn('Failed to pick search target folder:', error);
      }
    })();
  }, [pickFolderTitle, resolveDefaultPath, setErrorMessage, setFeedbackMessage, setSearchTarget]);

  return {
    handlePickSearchTargetFile,
    handlePickSearchTargetFolder,
  };
}
