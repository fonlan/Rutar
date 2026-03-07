import { useCallback, type RefObject } from 'react';
import { useSearchInputContextMenu } from './useSearchInputContextMenu';
import { useSearchInputHistory } from './useSearchInputInteractions';

interface UseSearchPanelInputSupportOptions {
  isOpen: boolean;
  recentReplaceValues: string[];
  recentSearchKeywords: string[];
  searchInputRef: RefObject<HTMLInputElement | null>;
  updateSettings: (updates: {
    recentReplaceValues?: string[];
    recentSearchKeywords?: string[];
  }) => void;
}

export function useSearchPanelInputSupport({
  isOpen,
  recentReplaceValues,
  recentSearchKeywords,
  searchInputRef,
  updateSettings,
}: UseSearchPanelInputSupportOptions) {
  const {
    handleInputContextMenuAction,
    handleSearchSidebarContextMenu,
    inputContextMenu,
    inputContextMenuRef,
  } = useSearchInputContextMenu({ isOpen });

  const {
    rememberReplaceValue,
    rememberSearchKeyword,
  } = useSearchInputHistory({
    recentReplaceValues,
    recentSearchKeywords,
    updateSettings,
  });

  const focusSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [searchInputRef]);

  return {
    focusSearchInput,
    handleInputContextMenuAction,
    handleSearchSidebarContextMenu,
    inputContextMenu,
    inputContextMenuRef,
    rememberReplaceValue,
    rememberSearchKeyword,
  };
}