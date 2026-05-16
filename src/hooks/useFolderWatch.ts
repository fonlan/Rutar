import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';

// Keeps the Rust-side folder watcher in sync with the currently-active folder.
// Clears the watch when no folder is open and re-arms it whenever the folder
// path changes. The hook intentionally has no return value because the watcher
// surface is a side effect on the backend.
export function useFolderWatch(folderPath: string | null) {
  useEffect(() => {
    let cancelled = false;
    const syncFolderTreeWatch = async () => {
      try {
        if (!folderPath) {
          await invoke('clear_folder_tree_watch');
          return;
        }

        await invoke('watch_folder_tree', { path: folderPath });
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to sync folder tree watch:', error);
        }
      }
    };

    void syncFolderTreeWatch();

    return () => {
      cancelled = true;
    };
  }, [folderPath]);
}
