import { useMemo, type ComponentProps, type Dispatch, type SetStateAction } from 'react';
import { SearchInputContextMenu } from './SearchInputContextMenu';
import { SearchPanelOverlays } from './SearchPanelOverlays';
import { SearchResultsPanel } from './SearchResultsPanel';

type SearchPanelOverlaysProps = ComponentProps<typeof SearchPanelOverlays>;
type SearchInputContextMenuProps = ComponentProps<typeof SearchInputContextMenu>;
type SearchResultsPanelProps = ComponentProps<typeof SearchResultsPanel>;
type SearchResultsPanelState = SearchResultsPanelProps['resultPanelState'];

interface UseSearchPanelOverlaysPropsOptions
  extends Omit<SearchResultsPanelProps, 'onCopy' | 'onMinimize'>,
    Pick<SearchPanelOverlaysProps, 'inputContextMenu'>,
    Pick<
      SearchInputContextMenuProps,
      'copyLabel' | 'cutLabel' | 'deleteLabel' | 'menuRef' | 'pasteLabel'
    > {
  copyPlainTextResults: () => Promise<void>;
  handleInputContextMenuAction: SearchInputContextMenuProps['onAction'];
  setResultPanelState: Dispatch<SetStateAction<SearchResultsPanelState>>;
}

export function useSearchPanelOverlaysProps({
  copyLabel,
  cutLabel,
  deleteLabel,
  menuRef,
  pasteLabel,
  handleInputContextMenuAction,
  copyPlainTextResults,
  inputContextMenu,
  setResultPanelState,
  ...resultsPanelProps
}: UseSearchPanelOverlaysPropsOptions): SearchPanelOverlaysProps {
  return useMemo(
    () => ({
      inputContextMenu,
      inputContextMenuProps: {
        copyLabel,
        cutLabel,
        deleteLabel,
        menuRef,
        pasteLabel,
        onAction: (action) => void handleInputContextMenuAction(action),
      },
      resultsPanelProps: {
        ...resultsPanelProps,
        onCopy: () => void copyPlainTextResults(),
        onMinimize: () => setResultPanelState('minimized'),
      },
    }),
    [
      copyLabel,
      copyPlainTextResults,
      cutLabel,
      deleteLabel,
      handleInputContextMenuAction,
      inputContextMenu,
      menuRef,
      pasteLabel,
      resultsPanelProps,
      setResultPanelState,
    ]
  );
}