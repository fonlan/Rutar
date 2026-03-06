import { type ComponentProps } from 'react';
import { SearchInputContextMenu } from './SearchInputContextMenu';
import { SearchResultsPanel } from './SearchResultsPanel';

interface SearchPanelOverlaysProps {
  inputContextMenu: ComponentProps<typeof SearchInputContextMenu>['contextMenu'] | null;
  inputContextMenuProps: Omit<ComponentProps<typeof SearchInputContextMenu>, 'contextMenu'>;
  resultsPanelProps: ComponentProps<typeof SearchResultsPanel>;
}

export function SearchPanelOverlays({
  inputContextMenu,
  inputContextMenuProps,
  resultsPanelProps,
}: SearchPanelOverlaysProps) {
  return (
    <>
      {inputContextMenu && (
        <SearchInputContextMenu
          contextMenu={inputContextMenu}
          {...inputContextMenuProps}
        />
      )}

      <SearchResultsPanel {...resultsPanelProps} />
    </>
  );
}
