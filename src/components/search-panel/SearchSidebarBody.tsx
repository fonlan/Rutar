import { FilterRulesEditor, type FilterRulesEditorProps } from './FilterRulesEditor';
import { SearchQuerySection, type SearchQuerySectionProps } from './SearchQuerySection';

interface SearchSidebarBodyProps {
  isFilterMode: boolean;
  filterRulesEditorProps: FilterRulesEditorProps;
  searchQuerySectionProps: SearchQuerySectionProps;
}

export function SearchSidebarBody({
  isFilterMode,
  filterRulesEditorProps,
  searchQuerySectionProps,
}: SearchSidebarBodyProps) {
  if (isFilterMode) {
    return <FilterRulesEditor {...filterRulesEditorProps} />;
  }

  return <SearchQuerySection {...searchQuerySectionProps} />;
}
