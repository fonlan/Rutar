import { create } from 'zustand';

export interface FileTab {
  id: string;
  name: string;
  path: string;
  encoding: string;
  lineEnding: LineEnding;
  lineCount: number;
  largeFileMode: boolean;
  syntaxOverride?: SyntaxKey | null;
  isDirty?: boolean;
}

export type LineEnding = 'CRLF' | 'LF' | 'CR';

export type SyntaxKey =
  | 'plain_text'
  | 'javascript'
  | 'typescript'
  | 'rust'
  | 'python'
  | 'json'
  | 'html'
  | 'css'
  | 'bash'
  | 'toml'
  | 'yaml'
  | 'xml'
  | 'c'
  | 'cpp'
  | 'go'
  | 'java'
  | 'csharp'
  | 'php'
  | 'kotlin'
  | 'swift';

export type AppLanguage = 'zh-CN' | 'en-US';
export type AppTheme = 'light' | 'dark';

export type OutlineType =
  | 'json'
  | 'yaml'
  | 'xml'
  | 'toml'
  | 'ini'
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'c'
  | 'cpp'
  | 'go'
  | 'java'
  | 'rust'
  | 'csharp'
  | 'php'
  | 'kotlin'
  | 'swift'
  | null;

export interface OutlineNode {
  label: string;
  nodeType: string;
  line: number;
  column: number;
  children: OutlineNode[];
}

export interface CursorPosition {
  line: number;
  column: number;
}

export type TabBookmarks = Record<string, number[]>;

interface SettingsState {
  isOpen: boolean;
  language: AppLanguage;
  theme: AppTheme;
  fontFamily: string;
  fontSize: number;
  tabWidth: number;
  newFileLineEnding: LineEnding;
  wordWrap: boolean;
  doubleClickCloseTab: boolean;
  showLineNumbers: boolean;
  highlightCurrentLine: boolean;
  singleInstanceMode: boolean;
  recentFiles: string[];
  recentFolders: string[];
  windowsContextMenuEnabled: boolean;
  windowsFileAssociationEnabled: boolean;
  windowsFileAssociationExtensions: string[];
}

const defaultNewFileLineEnding: LineEnding =
  typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)
    ? 'CRLF'
    : 'LF';

interface AppState {
  tabs: FileTab[];
  activeTabId: string | null;
  settings: SettingsState;
  
  sidebarOpen: boolean;
  sidebarWidth: number;
  outlineOpen: boolean;
  outlineWidth: number;
  bookmarkSidebarOpen: boolean;
  bookmarkSidebarWidth: number;
  outlineType: OutlineType;
  outlineError: string | null;
  outlineNodes: OutlineNode[];
  cursorPositionByTab: Record<string, CursorPosition>;
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
  toggleOutline: (open?: boolean) => void;
  setOutlineWidth: (width: number) => void;
  toggleBookmarkSidebar: (open?: boolean) => void;
  setBookmarkSidebarWidth: (width: number) => void;
  addBookmark: (tabId: string, line: number) => void;
  removeBookmark: (tabId: string, line: number) => void;
  toggleBookmark: (tabId: string, line: number) => void;
  setOutlineData: (payload: {
    outlineType: OutlineType;
    nodes: OutlineNode[];
    error?: string | null;
  }) => void;
  setCursorPosition: (tabId: string, line: number, column: number) => void;
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
    newFileLineEnding: defaultNewFileLineEnding,
    wordWrap: false,
    doubleClickCloseTab: true,
    showLineNumbers: true,
    highlightCurrentLine: true,
    singleInstanceMode: true,
    recentFiles: [],
    recentFolders: [],
    windowsContextMenuEnabled: false,
    windowsFileAssociationEnabled: false,
    windowsFileAssociationExtensions: [],
  },
  sidebarOpen: false,
  sidebarWidth: 240,
  outlineOpen: false,
  outlineWidth: 288,
  bookmarkSidebarOpen: false,
  bookmarkSidebarWidth: 220,
  outlineType: null,
  outlineError: null,
  outlineNodes: [],
  cursorPositionByTab: {},
  bookmarksByTab: {},
  folderPath: null,
  folderEntries: [],

  addTab: (tab) => set((state) => {
    const nextCursorPositionByTab = state.cursorPositionByTab[tab.id]
      ? state.cursorPositionByTab
      : {
          ...state.cursorPositionByTab,
          [tab.id]: { line: 1, column: 1 },
        };

    return {
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
      cursorPositionByTab: nextCursorPositionByTab,
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

    return {
      tabs: newTabs,
      activeTabId: newActiveId,
      cursorPositionByTab: nextCursorPositionByTab,
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
  toggleOutline: (open) => set((state) => ({ outlineOpen: open ?? !state.outlineOpen })),
  setOutlineWidth: (width) => set({ outlineWidth: width }),
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
