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

interface SettingsState {
  isOpen: boolean;
  language: AppLanguage;
  fontFamily: string;
  fontSize: number;
  wordWrap: boolean;
}

interface AppState {
  tabs: FileTab[];
  activeTabId: string | null;
  settings: SettingsState;
  
  sidebarOpen: boolean;
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
}

export const useStore = create<AppState>((set) => ({
  tabs: [],
  activeTabId: null,
  settings: {
    isOpen: false,
    language: 'zh-CN',
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 14,
    wordWrap: false,
  },
  sidebarOpen: false,
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
}));
