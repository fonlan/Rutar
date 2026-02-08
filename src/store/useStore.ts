import { create } from 'zustand';

export interface FileTab {
  id: string;
  name: string;
  path: string;
  encoding: string;
  lineCount: number;
  largeFileMode: boolean;
  isDirty?: boolean;
}

export type AppLanguage = 'zh-CN' | 'en-US';
export type AppTheme = 'light' | 'dark';

export type ContentTreeType = 'json' | 'yaml' | 'xml' | null;

export interface ContentTreeNode {
  label: string;
  nodeType: string;
  line: number;
  column: number;
  children: ContentTreeNode[];
}

export type TabBookmarks = Record<string, number[]>;

interface SettingsState {
  isOpen: boolean;
  language: AppLanguage;
  theme: AppTheme;
  fontFamily: string;
  fontSize: number;
  tabWidth: number;
  wordWrap: boolean;
  doubleClickCloseTab: boolean;
  highlightCurrentLine: boolean;
  singleInstanceMode: boolean;
  windowsContextMenuEnabled: boolean;
  windowsFileAssociationEnabled: boolean;
  windowsFileAssociationExtensions: string[];
}

interface AppState {
  tabs: FileTab[];
  activeTabId: string | null;
  settings: SettingsState;
  
  sidebarOpen: boolean;
  sidebarWidth: number;
  contentTreeOpen: boolean;
  contentTreeWidth: number;
  bookmarkSidebarOpen: boolean;
  bookmarkSidebarWidth: number;
  contentTreeType: ContentTreeType;
  contentTreeError: string | null;
  contentTreeNodes: ContentTreeNode[];
  bookmarksByTab: TabBookmarks;
  folderPath: string | null;
  folderEntries: any[];

  addTab: (tab: FileTab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<FileTab>) => void;
  
  toggleSettings: (open?: boolean) => void;
  updateSettings: (updates: Partial<SettingsState>) => void;
  
  setFolder: (path: string | null, entries: any[]) => void;
  toggleSidebar: (open?: boolean) => void;
  setSidebarWidth: (width: number) => void;
  toggleContentTree: (open?: boolean) => void;
  setContentTreeWidth: (width: number) => void;
  toggleBookmarkSidebar: (open?: boolean) => void;
  setBookmarkSidebarWidth: (width: number) => void;
  addBookmark: (tabId: string, line: number) => void;
  removeBookmark: (tabId: string, line: number) => void;
  toggleBookmark: (tabId: string, line: number) => void;
  setContentTreeData: (payload: {
    treeType: ContentTreeType;
    nodes: ContentTreeNode[];
    error?: string | null;
  }) => void;
}

export const useStore = create<AppState>((set) => ({
  tabs: [],
  activeTabId: null,
  settings: {
    isOpen: false,
    language: 'zh-CN',
    theme: 'light',
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 14,
    tabWidth: 4,
    wordWrap: false,
    doubleClickCloseTab: true,
    highlightCurrentLine: true,
    singleInstanceMode: true,
    windowsContextMenuEnabled: false,
    windowsFileAssociationEnabled: false,
    windowsFileAssociationExtensions: [],
  },
  sidebarOpen: false,
  sidebarWidth: 240,
  contentTreeOpen: false,
  contentTreeWidth: 288,
  bookmarkSidebarOpen: false,
  bookmarkSidebarWidth: 220,
  contentTreeType: null,
  contentTreeError: null,
  contentTreeNodes: [],
  bookmarksByTab: {},
  folderPath: null,
  folderEntries: [],

  addTab: (tab) => set((state) => ({ 
    tabs: [...state.tabs, tab], 
    activeTabId: tab.id 
  })),
  closeTab: (id) => set((state) => {
    const newTabs = state.tabs.filter((t) => t.id !== id);
    let newActiveId = state.activeTabId;
    if (state.activeTabId === id) {
        newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
    }
    const nextBookmarks = { ...state.bookmarksByTab };
    delete nextBookmarks[id];

    return {
      tabs: newTabs,
      activeTabId: newActiveId,
      bookmarksByTab: nextBookmarks,
    };
  }),
  setActiveTab: (id) => set({ activeTabId: id }),
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
  toggleContentTree: (open) => set((state) => ({ contentTreeOpen: open ?? !state.contentTreeOpen })),
  setContentTreeWidth: (width) => set({ contentTreeWidth: width }),
  toggleBookmarkSidebar: (open) => set((state) => ({ bookmarkSidebarOpen: open ?? !state.bookmarkSidebarOpen })),
  setBookmarkSidebarWidth: (width) => set({ bookmarkSidebarWidth: width }),
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
    } else {
      nextBookmarks[tabId] = [...existing, safeLine].sort((left, right) => left - right);
    }

    return {
      bookmarksByTab: nextBookmarks,
    };
  }),
  setContentTreeData: ({ treeType, nodes, error }) => set({
    contentTreeType: treeType,
    contentTreeNodes: nodes,
    contentTreeError: error ?? null,
  }),
}));
