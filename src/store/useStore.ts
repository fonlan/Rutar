import { create } from 'zustand';
import { type MouseGestureBinding, getDefaultMouseGestures } from '@/lib/mouseGestures';

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
  tabType?: 'file' | 'diff';
  diffPayload?: DiffTabPayload;
}

export type DiffPanelSide = 'source' | 'target';

export interface DiffTabPayload {
  sourceTabId: string;
  targetTabId: string;
  sourceName: string;
  targetName: string;
  sourcePath: string;
  targetPath: string;
  alignedSourceLines: string[];
  alignedTargetLines: string[];
  alignedSourcePresent: boolean[];
  alignedTargetPresent: boolean[];
  diffLineNumbers: number[];
  sourceDiffLineNumbers: number[];
  targetDiffLineNumbers: number[];
  alignedDiffKinds?: Array<'insert' | 'delete' | 'modify' | null>;
  sourceLineCount: number;
  targetLineCount: number;
  alignedLineCount: number;
  // Backward compatibility for old in-memory diff payloads.
  sourceContent?: string;
  targetContent?: string;
}

export function isDiffTab(
  tab?: FileTab | null
): tab is FileTab & { tabType: 'diff'; diffPayload: DiffTabPayload } {
  return tab?.tabType === 'diff' && !!tab.diffPayload;
}

export type LineEnding = 'CRLF' | 'LF' | 'CR';

export type SyntaxKey =
  | 'plain_text'
  | 'markdown'
  | 'javascript'
  | 'typescript'
  | 'rust'
  | 'python'
  | 'json'
  | 'ini'
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
  rememberWindowState: boolean;
  recentFiles: string[];
  recentFolders: string[];
  pinnedTabPaths: string[];
  windowsContextMenuEnabled: boolean;
  windowsFileAssociationEnabled: boolean;
  windowsFileAssociationExtensions: string[];
  mouseGesturesEnabled: boolean;
  mouseGestures: MouseGestureBinding[];
}

const defaultNewFileLineEnding: LineEnding =
  typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)
    ? 'CRLF'
    : 'LF';

interface AppState {
  tabs: FileTab[];
  activeTabId: string | null;
  activeDiffPanelByTab: Record<string, DiffPanelSide>;
  settings: SettingsState;
  
  sidebarOpen: boolean;
  sidebarWidth: number;
  outlineOpen: boolean;
  outlineWidth: number;
  bookmarkSidebarOpen: boolean;
  bookmarkSidebarWidth: number;
  markdownPreviewOpen: boolean;
  markdownPreviewWidthRatio: number;
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
  setActiveDiffPanel: (diffTabId: string, panel: DiffPanelSide) => void;
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
  toggleMarkdownPreview: (open?: boolean) => void;
  setMarkdownPreviewWidthRatio: (ratio: number) => void;
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
  activeDiffPanelByTab: {},
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
    rememberWindowState: true,
    recentFiles: [],
    recentFolders: [],
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
    const nextCursorPositionByTab = state.cursorPositionByTab[tab.id]
      ? state.cursorPositionByTab
      : {
          ...state.cursorPositionByTab,
          [tab.id]: { line: 1, column: 1 },
        };
    const nextActiveDiffPanelByTab = tab.tabType === 'diff'
      ? {
          ...state.activeDiffPanelByTab,
          [tab.id]: state.activeDiffPanelByTab[tab.id] ?? 'source',
        }
      : state.activeDiffPanelByTab;

    return {
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
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

