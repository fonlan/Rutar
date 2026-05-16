import { type MouseGestureBinding } from '@/lib/mouseGestures';

export interface FileTab {
  id: string;
  name: string;
  path: string;
  encoding: string;
  lineEnding: LineEnding;
  lineCount: number;
  sizeBytes?: number;
  largeFileMode: boolean;
  syntaxOverride?: SyntaxKey | null;
  isDirty?: boolean;
  tabType?: 'file' | 'diff';
  diffPayload?: DiffTabPayload;
}

export interface FolderEntry {
  name: string;
  path: string;
  is_dir: boolean;
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
  alignedDiffKinds: Array<'insert' | 'delete' | 'modify' | null>;
  sourceLineCount: number;
  targetLineCount: number;
  alignedLineCount: number;
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
  | 'dockerfile'
  | 'makefile'
  | 'javascript'
  | 'typescript'
  | 'rust'
  | 'python'
  | 'json'
  | 'jsonc'
  | 'ini'
  | 'html'
  | 'css'
  | 'batch'
  | 'bash'
  | 'zsh'
  | 'toml'
  | 'yaml'
  | 'xml'
  | 'c'
  | 'cpp'
  | 'go'
  | 'java'
  | 'csharp'
  | 'hcl'
  | 'lua'
  | 'php'
  | 'kotlin'
  | 'powershell'
  | 'ruby'
  | 'sql'
  | 'swift';

export type AppLanguage = 'zh-CN' | 'en-US';
export type AppTheme = 'light' | 'dark';
export type TabIndentMode = 'tabs' | 'spaces';

export type OutlineType =
  | 'markdown'
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

export interface SettingsState {
  isOpen: boolean;
  language: AppLanguage;
  theme: AppTheme;
  fontFamily: string;
  fontSize: number;
  tabWidth: number;
  tabIndentMode: TabIndentMode;
  newFileLineEnding: LineEnding;
  wordWrap: boolean;
  minimap: boolean;
  doubleClickCloseTab: boolean;
  showLineNumbers: boolean;
  highlightCurrentLine: boolean;
  singleInstanceMode: boolean;
  rememberWindowState: boolean;
  recentFiles: string[];
  recentFolders: string[];
  recentSearchKeywords: string[];
  recentReplaceValues: string[];
  pinnedTabPaths: string[];
  windowsContextMenuEnabled: boolean;
  windowsFileAssociationEnabled: boolean;
  windowsFileAssociationExtensions: string[];
  mouseGesturesEnabled: boolean;
  mouseGestures: MouseGestureBinding[];
}

export const defaultNewFileLineEnding: LineEnding =
  typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)
    ? 'CRLF'
    : 'LF';

export interface AppState {
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
  folderEntries: FolderEntry[];

  addTab: (tab: FileTab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setActiveDiffPanel: (diffTabId: string, panel: DiffPanelSide) => void;
  updateTab: (id: string, updates: Partial<FileTab>) => void;
  
  toggleSettings: (open?: boolean) => void;
  updateSettings: (updates: Partial<SettingsState>) => void;
  
  setFolder: (path: string | null, entries: FolderEntry[]) => void;
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

