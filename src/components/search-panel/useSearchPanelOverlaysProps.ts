import { createElement, useMemo, type ComponentProps, type Dispatch, type SetStateAction } from 'react';
import { SearchInputContextMenu } from './SearchInputContextMenu';
import { SearchPanelOverlays } from './SearchPanelOverlays';
import { SearchResultItems } from './SearchResultItems';
import { SearchResultsPanel } from './SearchResultsPanel';

type SearchPanelOverlaysProps = ComponentProps<typeof SearchPanelOverlays>;
type SearchInputContextMenuProps = ComponentProps<typeof SearchInputContextMenu>;
type SearchResultItemsProps = ComponentProps<typeof SearchResultItems>;
type SearchResultsPanelProps = ComponentProps<typeof SearchResultsPanel>;
type SearchResultsPanelState = SearchResultsPanelProps['resultPanelState'];

interface UseSearchPanelOverlaysPropsOptions
  extends Omit<SearchResultsPanelProps, 'onCopy' | 'onMinimize' | 'renderedResultItems'>,
    Pick<SearchPanelOverlaysProps, 'inputContextMenu'>,
    Pick<
      SearchInputContextMenuProps,
      'copyLabel' | 'cutLabel' | 'deleteLabel' | 'menuRef' | 'pasteLabel'
    > {
  copyPlainTextResults: () => Promise<void>;
  handleInputContextMenuAction: SearchInputContextMenuProps['onAction'];
  searchResultItemsProps: SearchResultItemsProps;
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
  searchResultItemsProps,
  setResultPanelState,
  ...resultsPanelProps
}: UseSearchPanelOverlaysPropsOptions): SearchPanelOverlaysProps {
  const renderedResultItems = useMemo(
    () => createElement(SearchResultItems, searchResultItemsProps),
    [searchResultItemsProps]
  );

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
        renderedResultItems,
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
      renderedResultItems,
      resultsPanelProps,
      setResultPanelState,
    ]
  );
}