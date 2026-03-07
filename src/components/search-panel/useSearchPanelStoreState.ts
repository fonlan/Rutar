import { useMemo } from 'react';
import { useStore } from '@/store/useStore';

export function useSearchPanelStoreState() {
  const tabs = useStore((state) => state.tabs);
  const activeTabId = useStore((state) => state.activeTabId);
  const cursorPositionByTab = useStore((state) => state.cursorPositionByTab);
  const setCursorPosition = useStore((state) => state.setCursorPosition);
  const updateTab = useStore((state) => state.updateTab);
  const updateSettings = useStore((state) => state.updateSettings);
  const language = useStore((state) => state.settings.language);
  const fontFamily = useStore((state) => state.settings.fontFamily);
  const fontSize = useStore((state) => state.settings.fontSize);
  const recentSearchKeywords = useStore((state) => state.settings.recentSearchKeywords);
  const recentReplaceValues = useStore((state) => state.settings.recentReplaceValues);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId && tab.tabType !== 'diff') ?? null,
    [tabs, activeTabId]
  );
  const activeCursorPosition = activeTab ? cursorPositionByTab[activeTab.id] : null;

  return {
    activeCursorPosition,
    activeTab,
    activeTabId,
    fontFamily,
    fontSize,
    language,
    recentReplaceValues,
    recentSearchKeywords,
    setCursorPosition,
    updateSettings,
    updateTab,
  };
}