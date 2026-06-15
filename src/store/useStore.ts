// Store creation lives here; types and defaults are kept next to the actions in
// storeTypes.ts so external consumers continue importing from useStore.
import { create } from 'zustand';
import {
  type AppState,
  type FileTab,
  type FolderEntry,
  type DiffPanelSide,
  type DiffTabPayload,
  isDiffTab,
  type LineEnding,
  type SyntaxKey,
  type AppLanguage,
  type AppTheme,
  type TabIndentMode,
  type OutlineType,
  type OutlineNode,
  type CursorPosition,
  type TabBookmarks,
  type SettingsState,
  defaultNewFileLineEnding,
} from './storeTypes';
import { getDefaultMouseGestures } from '@/lib/mouseGestures';

export type {
  AppState,
  FileTab,
  FolderEntry,
  DiffPanelSide,
  DiffTabPayload,
  LineEnding,
  SyntaxKey,
  AppLanguage,
  AppTheme,
  TabIndentMode,
  OutlineType,
  OutlineNode,
  CursorPosition,
  TabBookmarks,
  SettingsState,
};
export { isDiffTab };

export const useStore = create<AppState>((set) => ({
  tabs: [],
  activeTabId: null,
  activeDiffPanelByTab: {},
  settings: {
    isOpen: false,
    language: 'zh-CN',
    theme: 'light',
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 14,
    tabWidth: 4,
    tabIndentMode: 'tabs',
    newFileLineEnding: defaultNewFileLineEnding,
    wordWrap: false,
    minimap: true,
    minimapAutohide: true,
    doubleClickCloseTab: true,
    showLineNumbers: true,
    highlightCurrentLine: true,
    singleInstanceMode: true,
    rememberWindowState: true,
    recentFiles: [],
    recentFolders: [],
    recentSearchKeywords: [],
    recentReplaceValues: [],
    pinnedTabPaths: [],
    windowsContextMenuEnabled: false,
    windowsFileAssociationEnabled: false,
    windowsFileAssociationExtensions: [],
    mouseGesturesEnabled: true,
    mouseGestures: getDefaultMouseGestures(),
  },
  sidebarOpen: false,
  sidebarWidth: 240,
  outlineOpen: false,
  outlineWidth: 288,
  bookmarkSidebarOpen: false,
  bookmarkSidebarWidth: 220,
  markdownPreviewOpen: false,
  markdownPreviewWidthRatio: 0.5,
  outlineType: null,
  outlineError: null,
  outlineNodes: [],
  cursorPositionByTab: {},
  bookmarksByTab: {},
  folderPath: null,
  folderEntries: [],

  addTab: (tab) => set((state) => {
    const nextTab: FileTab = {
      ...tab,
      wordWrap: tab.wordWrap ?? state.settings.wordWrap,
    };
    const nextCursorPositionByTab = state.cursorPositionByTab[nextTab.id]
      ? state.cursorPositionByTab
      : {
        ...state.cursorPositionByTab,
        [nextTab.id]: { line: 1, column: 1 },
      };
    const nextActiveDiffPanelByTab = nextTab.tabType === 'diff'
      ? {
        ...state.activeDiffPanelByTab,
        [nextTab.id]: state.activeDiffPanelByTab[nextTab.id] ?? 'source',
      }
      : state.activeDiffPanelByTab;

    return {
      tabs: [...state.tabs, nextTab],
      activeTabId: nextTab.id,
      cursorPositionByTab: nextCursorPositionByTab,
      activeDiffPanelByTab: nextActiveDiffPanelByTab,
    };
  }),
  closeTab: (id) => set((state) => {
    const newTabs = state.tabs.filter((t) => t.id !== id);
    let newActiveId = state.activeTabId;
    if (state.activeTabId === id) {
      newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
    }
    const nextBookmarks = { ...state.bookmarksByTab };
    delete nextBookmarks[id];
    const nextCursorPositionByTab = { ...state.cursorPositionByTab };
    delete nextCursorPositionByTab[id];
    const nextActiveDiffPanelByTab = { ...state.activeDiffPanelByTab };
    delete nextActiveDiffPanelByTab[id];

    return {
      tabs: newTabs,
      activeTabId: newActiveId,
      cursorPositionByTab: nextCursorPositionByTab,
      bookmarksByTab: nextBookmarks,
      activeDiffPanelByTab: nextActiveDiffPanelByTab,
    };
  }),
  setActiveTab: (id) => set({ activeTabId: id }),
  setActiveDiffPanel: (diffTabId, panel) => set((state) => {
    if (state.activeDiffPanelByTab[diffTabId] === panel) {
      return state;
    }

    return {
      activeDiffPanelByTab: {
        ...state.activeDiffPanelByTab,
        [diffTabId]: panel,
      },
    };
  }),
  updateTab: (id, updates) => set((state) => ({
    tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
  })),
  toggleSettings: (open) => set((state) => ({
    settings: { ...state.settings, isOpen: open ?? !state.settings.isOpen }
  })),
  updateSettings: (updates) => set((state) => ({
    settings: { ...state.settings, ...updates }
  })),
  setFolder: (path, entries) => set({ folderPath: path, folderEntries: entries, sidebarOpen: !!path }),
  toggleSidebar: (open) => set((state) => ({ sidebarOpen: open ?? !state.sidebarOpen })),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  toggleOutline: (open) => set((state) => ({ outlineOpen: open ?? !state.outlineOpen })),
  setOutlineWidth: (width) => set({ outlineWidth: width }),
  toggleBookmarkSidebar: (open) => set((state) => ({ bookmarkSidebarOpen: open ?? !state.bookmarkSidebarOpen })),
  setBookmarkSidebarWidth: (width) => set({ bookmarkSidebarWidth: width }),
  toggleMarkdownPreview: (open) =>
    set((state) => ({ markdownPreviewOpen: open ?? !state.markdownPreviewOpen })),
  setMarkdownPreviewWidthRatio: (ratio) =>
    set({
      markdownPreviewWidthRatio: Math.max(0.2, Math.min(0.8, Number.isFinite(ratio) ? ratio : 0.5)),
    }),
  addBookmark: (tabId, line) => set((state) => {
    const safeLine = Math.max(1, Math.floor(line));
    const existing = state.bookmarksByTab[tabId] ?? [];

    if (existing.includes(safeLine)) {
      return state;
    }

    const next = [...existing, safeLine].sort((left, right) => left - right);
    return {
      bookmarksByTab: {
        ...state.bookmarksByTab,
        [tabId]: next,
      },
    };
  }),
  removeBookmark: (tabId, line) => set((state) => {
    const safeLine = Math.max(1, Math.floor(line));
    const existing = state.bookmarksByTab[tabId] ?? [];
    if (!existing.includes(safeLine)) {
      return state;
    }

    const next = existing.filter((item) => item !== safeLine);
    const nextBookmarks = { ...state.bookmarksByTab };

    if (next.length === 0) {
      delete nextBookmarks[tabId];
    } else {
      nextBookmarks[tabId] = next;
    }

    return {
      bookmarksByTab: nextBookmarks,
      bookmarkSidebarOpen:
        tabId === state.activeTabId && next.length === 0 ? false : state.bookmarkSidebarOpen,
    };
  }),
  toggleBookmark: (tabId, line) => set((state) => {
    const safeLine = Math.max(1, Math.floor(line));
    const existing = state.bookmarksByTab[tabId] ?? [];
    const hasBookmark = existing.includes(safeLine);
    const nextBookmarks = { ...state.bookmarksByTab };

    if (hasBookmark) {
      const next = existing.filter((item) => item !== safeLine);
      if (next.length === 0) {
        delete nextBookmarks[tabId];
      } else {
        nextBookmarks[tabId] = next;
      }

      return {
        bookmarksByTab: nextBookmarks,
        bookmarkSidebarOpen:
          tabId === state.activeTabId && next.length === 0 ? false : state.bookmarkSidebarOpen,
      };
    } else {
      nextBookmarks[tabId] = [...existing, safeLine].sort((left, right) => left - right);

      return {
        bookmarksByTab: nextBookmarks,
      };
    }
  }),
  setOutlineData: ({ outlineType, nodes, error }) => set({
    outlineType: outlineType,
    outlineNodes: nodes,
    outlineError: error ?? null,
  }),
  setCursorPosition: (tabId, line, column) => set((state) => {
    const safeLine = Math.max(1, Math.floor(line));
    const safeColumn = Math.max(1, Math.floor(column));
    const current = state.cursorPositionByTab[tabId];

    if (current && current.line === safeLine && current.column === safeColumn) {
      return state;
    }

    return {
      cursorPositionByTab: {
        ...state.cursorPositionByTab,
        [tabId]: {
          line: safeLine,
          column: safeColumn,
        },
      },
    };
  }),
}));
