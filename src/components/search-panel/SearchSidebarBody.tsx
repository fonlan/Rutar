import { type ComponentProps } from 'react';
import { CrossFileResultsPanel } from './CrossFileResultsPanel';
import { FilterRulesEditor, type FilterRulesEditorProps } from './FilterRulesEditor';
import { SearchQuerySection, type SearchQuerySectionProps } from './SearchQuerySection';

interface SearchSidebarBodyProps {
  isFilterMode: boolean;
  isCrossFileMode: boolean;
  filterRulesEditorProps: FilterRulesEditorProps;
  searchQuerySectionProps: SearchQuerySectionProps;
  crossFileResultsProps: ComponentProps<typeof CrossFileResultsPanel>;
}

export function SearchSidebarBody({
  isFilterMode,
  isCrossFileMode,
  filterRulesEditorProps,
  searchQuerySectionProps,
  crossFileResultsProps,
}: SearchSidebarBodyProps) {
  if (isFilterMode) {
    // Filter editor can be tall (many rules) so let it scroll inside the
    // remaining sidebar space.
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <FilterRulesEditor {...filterRulesEditorProps} />
      </div>
    );
  }

  // Both in-document and cross-file search share the query section. In
  // cross-file mode the results panel below should fill the remaining vertical
  // space (it uses `flex-1` internally).
  return (
    <>
      <div className="shrink-0">
        <SearchQuerySection {...searchQuerySectionProps} />
      </div>
      {isCrossFileMode && <CrossFileResultsPanel {...crossFileResultsProps} />}
    </>
  );
}
