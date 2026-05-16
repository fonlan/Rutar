import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';

// Subscribes to the open-paths event from the Tauri single-instance plugin
// so a second launch forwards its path arguments into this process.
// The callback resolves any incoming paths just like a fresh open would.
export function useSingleInstance(openIncomingPaths: (paths: string[]) => Promise<void> | void) {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    const setupSingleInstanceOpenListener = async () => {
      try {
        const unsubscribe = await listen<string[]>('rutar://open-paths', async (event) => {
          const paths = Array.isArray(event.payload) ? event.payload : [];
          if (paths.length === 0) {
            return;
          }

          await openIncomingPaths(paths);
        });

        if (disposed) {
          unsubscribe();
          return;
        }

        unlisten = unsubscribe;
      } catch (error) {
        console.error('Failed to listen single-instance open event:', error);
      }
    };

    void setupSingleInstanceOpenListener();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [openIncomingPaths]);
}
