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
  contentTreeType: ContentTreeType;
  contentTreeError: string | null;
  contentTreeNodes: ContentTreeNode[];
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
    windowsContextMenuEnabled: false,
    windowsFileAssociationEnabled: false,
    windowsFileAssociationExtensions: [],
  },
  sidebarOpen: false,
  sidebarWidth: 240,
  contentTreeOpen: false,
  contentTreeWidth: 288,
  contentTreeType: null,
  contentTreeError: null,
  contentTreeNodes: [],
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
    return { tabs: newTabs, activeTabId: newActiveId };
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
  setContentTreeData: ({ treeType, nodes, error }) => set({
    contentTreeType: treeType,
    contentTreeNodes: nodes,
    contentTreeError: error ?? null,
  }),
}));
