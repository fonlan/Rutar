import { AppLanguage } from '@/store/useStore';

export type I18nKey =
  | 'app.readyOpenHint'
  | 'titleBar.settings'
  | 'titleBar.closeOtherTabs'
  | 'titleBar.closeAllTabs'
  | 'toolbar.newFile'
  | 'toolbar.openFile'
  | 'toolbar.openFolder'
  | 'toolbar.save'
  | 'toolbar.saveAll'
  | 'toolbar.cut'
  | 'toolbar.copy'
  | 'toolbar.paste'
  | 'toolbar.undo'
  | 'toolbar.redo'
  | 'toolbar.find'
  | 'toolbar.replace'
  | 'toolbar.toggleWordWrap'
  | 'toolbar.contentTree'
  | 'status.ready'
  | 'status.lines'
  | 'status.largeFileHighlightOff'
  | 'sidebar.empty'
  | 'sidebar.close'
  | 'contentTree.title'
  | 'contentTree.empty'
  | 'contentTree.unsupportedType'
  | 'contentTree.parseFailed'
  | 'settings.title'
  | 'settings.general'
  | 'settings.appearance'
  | 'settings.generalEmpty'
  | 'settings.language'
  | 'settings.languageDesc'
  | 'settings.language.zhCN'
  | 'settings.language.enUS'
  | 'settings.theme'
  | 'settings.themeDesc'
  | 'settings.theme.light'
  | 'settings.theme.dark'
  | 'settings.fontFamily'
  | 'settings.fontFamilyDesc'
  | 'settings.fontSize'
  | 'editor.largeMode.readOnlyTitle'
  | 'editor.largeMode.readOnlyDesc'
  | 'editor.largeMode.keepReadOnly'
  | 'editor.largeMode.enterEditable';

type Messages = Record<I18nKey, string>;

const zhCN: Messages = {
  'app.readyOpenHint': '就绪：打开文件或文件夹',
  'titleBar.settings': '设置',
  'titleBar.closeOtherTabs': '关闭其他标签页',
  'titleBar.closeAllTabs': '关闭所有标签页',
  'toolbar.newFile': '新建文件 (Ctrl+N)',
  'toolbar.openFile': '打开文件 (Ctrl+O)',
  'toolbar.openFolder': '打开文件夹',
  'toolbar.save': '保存 (Ctrl+S)',
  'toolbar.saveAll': '全部保存 (Ctrl+Shift+S)',
  'toolbar.cut': '剪切',
  'toolbar.copy': '复制',
  'toolbar.paste': '粘贴',
  'toolbar.undo': '撤销 (Ctrl+Z)',
  'toolbar.redo': '重做 (Ctrl+Y / Ctrl+Shift+Z)',
  'toolbar.find': '查找 (Ctrl+F)',
  'toolbar.replace': '替换 (Ctrl+H)',
  'toolbar.toggleWordWrap': '切换自动换行',
  'toolbar.contentTree': '内容树',
  'status.ready': 'Rutar 就绪',
  'status.lines': '行数',
  'status.largeFileHighlightOff': '高亮已关闭（大文件模式）',
  'sidebar.empty': '空文件夹',
  'sidebar.close': '关闭侧边栏',
  'contentTree.title': '内容树',
  'contentTree.empty': '暂无可显示的树结构',
  'contentTree.unsupportedType': '当前标签页不是 JSON / YAML / XML 文件，无法打开内容树。',
  'contentTree.parseFailed': '无法解析当前文件：',
  'settings.title': '设置',
  'settings.general': '通用',
  'settings.appearance': '外观',
  'settings.generalEmpty': '通用设置当前为空。',
  'settings.language': '语言',
  'settings.languageDesc': '切换应用界面语言。',
  'settings.language.zhCN': '简体中文',
  'settings.language.enUS': 'English (US)',
  'settings.theme': '主题',
  'settings.themeDesc': '切换应用主题。',
  'settings.theme.light': '浅色',
  'settings.theme.dark': '深色',
  'settings.fontFamily': '字体族',
  'settings.fontFamilyDesc': '编辑器使用的字体族。',
  'settings.fontSize': '字体大小',
  'editor.largeMode.readOnlyTitle': '大文件模式当前为只读',
  'editor.largeMode.readOnlyDesc': '检测到你在尝试输入。进入可编辑模式可能导致性能下降，是否继续？',
  'editor.largeMode.keepReadOnly': '保持只读',
  'editor.largeMode.enterEditable': '进入编辑模式',
};

const enUS: Messages = {
  'app.readyOpenHint': 'READY: Open a file or folder',
  'titleBar.settings': 'Settings',
  'titleBar.closeOtherTabs': 'Close Other Tabs',
  'titleBar.closeAllTabs': 'Close All Tabs',
  'toolbar.newFile': 'New File (Ctrl+N)',
  'toolbar.openFile': 'Open File (Ctrl+O)',
  'toolbar.openFolder': 'Open Folder',
  'toolbar.save': 'Save (Ctrl+S)',
  'toolbar.saveAll': 'Save All (Ctrl+Shift+S)',
  'toolbar.cut': 'Cut',
  'toolbar.copy': 'Copy',
  'toolbar.paste': 'Paste',
  'toolbar.undo': 'Undo (Ctrl+Z)',
  'toolbar.redo': 'Redo (Ctrl+Y / Ctrl+Shift+Z)',
  'toolbar.find': 'Find (Ctrl+F)',
  'toolbar.replace': 'Replace (Ctrl+H)',
  'toolbar.toggleWordWrap': 'Toggle Word Wrap',
  'toolbar.contentTree': 'Content Tree',
  'status.ready': 'Rutar Ready',
  'status.lines': 'Lines',
  'status.largeFileHighlightOff': 'Highlight Off (Large File)',
  'sidebar.empty': 'Empty',
  'sidebar.close': 'Close Sidebar',
  'contentTree.title': 'Content Tree',
  'contentTree.empty': 'No tree data',
  'contentTree.unsupportedType': 'The active tab is not JSON, YAML, or XML. Cannot open content tree.',
  'contentTree.parseFailed': 'Failed to parse active file:',
  'settings.title': 'Settings',
  'settings.general': 'General',
  'settings.appearance': 'Appearance',
  'settings.generalEmpty': 'General settings are currently empty.',
  'settings.language': 'Language',
  'settings.languageDesc': 'Switch the application UI language.',
  'settings.language.zhCN': '简体中文',
  'settings.language.enUS': 'English (US)',
  'settings.theme': 'Theme',
  'settings.themeDesc': 'Switch the application theme.',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.fontFamily': 'Font Family',
  'settings.fontFamilyDesc': 'The font family used in the editor.',
  'settings.fontSize': 'Font Size',
  'editor.largeMode.readOnlyTitle': 'Large File Mode is currently read-only',
  'editor.largeMode.readOnlyDesc': 'Input detected. Editable mode may reduce performance. Continue?',
  'editor.largeMode.keepReadOnly': 'Keep Read-only',
  'editor.largeMode.enterEditable': 'Enter Editable Mode',
};

const dictionaries: Record<AppLanguage, Messages> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

export function t(language: AppLanguage, key: I18nKey): string {
  return dictionaries[language][key] ?? dictionaries['zh-CN'][key] ?? key;
}
