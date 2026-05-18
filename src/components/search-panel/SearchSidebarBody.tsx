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
    return <FilterRulesEditor {...filterRulesEditorProps} />;
  }

  return (
    <>
      <SearchQuerySection {...searchQuerySectionProps} />
      {isCrossFileMode && <CrossFileResultsPanel {...crossFileResultsProps} />}
    </>
  );
}
