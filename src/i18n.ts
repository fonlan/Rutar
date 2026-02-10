import { AppLanguage } from '@/store/useStore';

export type I18nKey =
  | 'app.readyOpenHint'
  | 'app.externalFileChanged.prompt'
  | 'app.externalFileChanged.unsavedWarning'
  | 'titleBar.settings'
  | 'titleBar.closeOtherTabs'
  | 'titleBar.closeAllTabs'
  | 'titleBar.copyFileName'
  | 'titleBar.copyDirectory'
  | 'titleBar.copyPath'
  | 'titleBar.openContainingFolder'
  | 'titleBar.enableAlwaysOnTop'
  | 'titleBar.disableAlwaysOnTop'
  | 'tabCloseConfirm.title'
  | 'tabCloseConfirm.message'
  | 'tabCloseConfirm.save'
  | 'tabCloseConfirm.discard'
  | 'tabCloseConfirm.cancel'
  | 'tabCloseConfirm.saveAll'
  | 'tabCloseConfirm.discardAll'
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
  | 'toolbar.bookmarkSidebar'
  | 'toolbar.outline'
  | 'toolbar.filter'
  | 'toolbar.format.beautify'
  | 'toolbar.format.minify'
  | 'toolbar.format.unsupported'
  | 'toolbar.format.failed'
  | 'toolbar.recent.noFiles'
  | 'toolbar.recent.noFolders'
  | 'toolbar.recent.clearFiles'
  | 'toolbar.recent.clearFolders'
  | 'toolbar.wordCount'
  | 'toolbar.wordCount.title'
  | 'toolbar.wordCount.words'
  | 'toolbar.wordCount.characters'
  | 'toolbar.wordCount.charactersNoSpaces'
  | 'toolbar.wordCount.lines'
  | 'toolbar.wordCount.paragraphs'
  | 'toolbar.wordCount.failed'
  | 'toolbar.disabled.noActiveDocument'
  | 'toolbar.disabled.noUnsavedChanges'
  | 'toolbar.disabled.noUnsavedDocuments'
  | 'toolbar.disabled.noSelectedText'
  | 'toolbar.disabled.noUndoHistory'
  | 'toolbar.disabled.noRedoHistory'
  | 'bookmark.menu.title'
  | 'bookmark.add'
  | 'bookmark.remove'
  | 'bookmark.sidebar.title'
  | 'bookmark.sidebar.empty'
  | 'bookmark.sidebar.line'
  | 'bookmark.sidebar.emptyLine'
  | 'status.ready'
  | 'status.lines'
  | 'status.cursor'
  | 'status.largeFileHighlightOff'
  | 'sidebar.empty'
  | 'sidebar.close'
  | 'outline.title'
  | 'outline.empty'
  | 'outline.searchPlaceholder'
  | 'outline.searchEmpty'
  | 'outline.searchClear'
  | 'outline.expandAll'
  | 'outline.collapseAll'
  | 'outline.unsupportedType'
  | 'outline.parseFailed'
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
  | 'settings.singleInstanceMode'
  | 'settings.singleInstanceModeDesc'
  | 'settings.singleInstanceModeRestartToast'
  | 'settings.rememberWindowState'
  | 'settings.rememberWindowStateDesc'
  | 'settings.about'
  | 'settings.aboutDesc'
  | 'settings.aboutPanelDesc'
  | 'settings.about.projectUrl'
  | 'settings.about.openLink'
  | 'settings.about.summary'
  | 'settings.editorPrefsDesc'
  | 'settings.generalTabDesc'
  | 'settings.appearanceTabDesc'
  | 'settings.shortcutsTabDesc'
  | 'settings.generalPanelDesc'
  | 'settings.appearancePanelDesc'
  | 'settings.shortcutsPanelDesc'
  | 'settings.close'
  | 'settings.highlightCurrentLine'
  | 'settings.highlightCurrentLineDesc'
  | 'settings.doubleClickCloseTab'
  | 'settings.doubleClickCloseTabDesc'
  | 'settings.showLineNumbers'
  | 'settings.showLineNumbersDesc'
  | 'settings.newFileLineEnding'
  | 'settings.newFileLineEndingDesc'
  | 'settings.wordWrapDesc'
  | 'settings.switchOn'
  | 'settings.switchOff'
  | 'settings.windowsContextMenu'
  | 'settings.windowsContextMenuDesc'
  | 'settings.windowsFileAssociations'
  | 'settings.windowsFileAssociationsDesc'
  | 'settings.windowsFileAssociationsHint'
  | 'settings.add'
  | 'settings.customExtensionPlaceholder'
  | 'settings.fontPickerPlaceholder'
  | 'settings.fontMoveUp'
  | 'settings.fontMoveDown'
  | 'settings.fontRemove'
  | 'settings.typography'
  | 'settings.tabWidth'
  | 'settings.tabWidthDesc'
  | 'settings.shortcuts'
  | 'settings.shortcutsDesc'
  | 'settings.shortcutsAction'
  | 'settings.shortcutsKey'
  | 'settings.shortcutCloseTab'
  | 'settings.shortcutFindNext'
  | 'settings.shortcutBeautify'
  | 'settings.shortcutMinify'
  | 'settings.shortcutToggleComment'
  | 'settings.shortcutRectangularSelection'
  | 'editor.context.delete'
  | 'editor.context.selectAll'
  | 'editor.context.edit'
  | 'editor.context.sort'
  | 'editor.context.convert'
  | 'editor.context.convert.base64Encode'
  | 'editor.context.convert.base64Decode'
  | 'editor.context.convert.copyBase64EncodeResult'
  | 'editor.context.convert.copyBase64DecodeResult'
  | 'editor.context.convert.base64DecodeFailed'
  | 'editor.context.sort.ascending'
  | 'editor.context.sort.ascendingIgnoreCase'
  | 'editor.context.sort.descending'
  | 'editor.context.sort.descendingIgnoreCase'
  | 'editor.context.sort.pinyinAscending'
  | 'editor.context.sort.pinyinDescending'
  | 'editor.context.cleanup.removeEmptyLines'
  | 'editor.context.cleanup.removeDuplicateLines'
  | 'editor.context.cleanup.trimLeadingWhitespace'
  | 'editor.context.cleanup.trimTrailingWhitespace'
  | 'editor.context.cleanup.trimSurroundingWhitespace'
  | 'editor.largeMode.readOnlyTitle'
  | 'editor.largeMode.readOnlyDesc'
  | 'editor.largeMode.keepReadOnly'
  | 'editor.largeMode.enterEditable';

type Messages = Record<I18nKey, string>;

const zhCN: Messages = {
  'app.readyOpenHint': '就绪：打开文件或文件夹',
  'app.externalFileChanged.prompt': '文件“{fileName}”在外部发生了变化。是否重新加载？',
  'app.externalFileChanged.unsavedWarning': '注意：重新加载会丢失当前未保存修改。',
  'titleBar.settings': '设置',
  'titleBar.closeOtherTabs': '关闭其他标签页',
  'titleBar.closeAllTabs': '关闭所有标签页',
  'titleBar.copyFileName': '复制文件名',
  'titleBar.copyDirectory': '复制目录',
  'titleBar.copyPath': '复制路径',
  'titleBar.openContainingFolder': '打开文件所在文件夹',
  'titleBar.enableAlwaysOnTop': '置顶窗口',
  'titleBar.disableAlwaysOnTop': '取消置顶窗口',
  'tabCloseConfirm.title': '未保存更改',
  'tabCloseConfirm.message': '标签页“{tabName}”有未保存修改，是否保存后关闭？',
  'tabCloseConfirm.save': '是',
  'tabCloseConfirm.discard': '否',
  'tabCloseConfirm.cancel': '取消',
  'tabCloseConfirm.saveAll': '是（全部）',
  'tabCloseConfirm.discardAll': '否（全部）',
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
  'toolbar.bookmarkSidebar': '书签侧边栏',
  'toolbar.outline': '大纲',
  'toolbar.filter': '过滤',
  'toolbar.format.beautify': '格式化文档 (Ctrl+Alt+F)',
  'toolbar.format.minify': '最小化文档 (Ctrl+Alt+M)',
  'toolbar.format.unsupported': '仅支持 JSON / YAML / XML / HTML / TOML 文件格式化。',
  'toolbar.format.failed': '格式化失败：',
  'toolbar.recent.noFiles': '暂无最近文件',
  'toolbar.recent.noFolders': '暂无最近文件夹',
  'toolbar.recent.clearFiles': '清空最近文件',
  'toolbar.recent.clearFolders': '清空最近文件夹',
  'toolbar.wordCount': '字数统计',
  'toolbar.wordCount.title': '字数统计',
  'toolbar.wordCount.words': '字数',
  'toolbar.wordCount.characters': '字符数（含空格）',
  'toolbar.wordCount.charactersNoSpaces': '字符数（不含空格）',
  'toolbar.wordCount.lines': '行数',
  'toolbar.wordCount.paragraphs': '段落数',
  'toolbar.wordCount.failed': '字数统计失败：',
  'toolbar.disabled.noActiveDocument': '当前没有打开的文档',
  'toolbar.disabled.noUnsavedChanges': '当前文档没有未保存更改',
  'toolbar.disabled.noUnsavedDocuments': '没有可保存的更改',
  'toolbar.disabled.noSelectedText': '当前没有选中文本',
  'toolbar.disabled.noUndoHistory': '当前没有可撤销的操作',
  'toolbar.disabled.noRedoHistory': '当前没有可重做的操作',
  'bookmark.menu.title': '书签',
  'bookmark.add': '添加书签',
  'bookmark.remove': '删除书签',
  'bookmark.sidebar.title': '书签',
  'bookmark.sidebar.empty': '暂无书签',
  'bookmark.sidebar.line': '行',
  'bookmark.sidebar.emptyLine': '(空行)',
  'status.ready': 'Rutar 就绪',
  'status.lines': '行数',
  'status.cursor': '光标',
  'status.largeFileHighlightOff': '高亮已关闭（大文件模式）',
  'sidebar.empty': '空文件夹',
  'sidebar.close': '关闭侧边栏',
  'outline.title': '大纲',
  'outline.empty': '暂无可显示的大纲',
  'outline.searchPlaceholder': '搜索大纲...',
  'outline.searchEmpty': '未找到匹配项',
  'outline.searchClear': '清除搜索',
  'outline.expandAll': '展开全部',
  'outline.collapseAll': '收起全部',
  'outline.unsupportedType': '当前标签页不是 JSON / YAML / XML / TOML / INI / Python / JavaScript / TypeScript / C / C++ / Go / Java / Rust / C# / PHP / Kotlin / Swift 文件，无法打开大纲。',
  'outline.parseFailed': '无法解析当前文件：',
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
  'settings.singleInstanceMode': '单实例模式',
  'settings.singleInstanceModeDesc': '启用后，双击关联文件或“使用 Rutar 打开”会复用当前窗口并新建标签页。更改后重启生效。',
  'settings.singleInstanceModeRestartToast': '单实例模式设置已变更，重启 Rutar 后生效。',
  'settings.rememberWindowState': '记住窗口状态',
  'settings.rememberWindowStateDesc': '保存并恢复窗口大小与最大化状态。最大化时仅记录最大化状态，不记录宽高。',
  'settings.about': '关于',
  'settings.aboutDesc': '项目信息与开源地址',
  'settings.aboutPanelDesc': '查看 Rutar 项目信息与源码地址。',
  'settings.about.projectUrl': '项目地址',
  'settings.about.openLink': '打开链接',
  'settings.about.summary': 'Rutar 是一个基于 Tauri、React 和 Rust 构建的高性能代码编辑器。',
  'settings.editorPrefsDesc': '编辑器偏好与体验',
  'settings.generalTabDesc': '语言与基础偏好',
  'settings.appearanceTabDesc': '主题、字体与编辑器显示',
  'settings.shortcutsTabDesc': '查看全部快捷键',
  'settings.generalPanelDesc': '配置应用基础行为与语言。',
  'settings.appearancePanelDesc': '调整编辑器观感、排版与阅读体验。',
  'settings.shortcutsPanelDesc': '查看当前版本支持的键盘快捷键。',
  'settings.close': '关闭设置',
  'settings.highlightCurrentLine': '高亮当前行',
  'settings.highlightCurrentLineDesc': '在编辑器中突出显示光标所在行。',
  'settings.doubleClickCloseTab': '双击关闭标签页',
  'settings.doubleClickCloseTabDesc': '双击顶部标签页可直接关闭。',
  'settings.showLineNumbers': '显示行号',
  'settings.showLineNumbersDesc': '在编辑器左侧显示每行行号。',
  'settings.newFileLineEnding': '新建文件换行符',
  'settings.newFileLineEndingDesc': '控制新建空白文件的默认换行符。',
  'settings.wordWrapDesc': '超过容器宽度时自动换行，减少横向滚动。',
  'settings.switchOn': '开',
  'settings.switchOff': '关',
  'settings.windowsContextMenu': 'Windows 11 右键菜单',
  'settings.windowsContextMenuDesc': '在文件和文件夹右键菜单中显示“使用 Rutar 打开”。',
  'settings.windowsFileAssociations': 'Windows 文件关联',
  'settings.windowsFileAssociationsDesc': '将 Rutar 设为所选后缀的默认编辑器，支持双击直接打开。图标使用 rutar_document.png。',
  'settings.windowsFileAssociationsHint': '勾选常见文本后缀，也可自定义（如 .env、.sql）。',
  'settings.add': '添加',
  'settings.customExtensionPlaceholder': '输入自定义后缀，如 .env',
  'settings.fontPickerPlaceholder': '输入或选择字体名（支持系统字体）',
  'settings.fontMoveUp': '上移字体',
  'settings.fontMoveDown': '下移字体',
  'settings.fontRemove': '移除字体',
  'settings.typography': '排版',
  'settings.tabWidth': '制表符宽度',
  'settings.tabWidthDesc': '用于工具栏格式化按钮的缩进宽度。',
  'settings.shortcuts': '快捷键列表',
  'settings.shortcutsDesc': '以下为当前版本已实现的常用快捷键。',
  'settings.shortcutsAction': '功能',
  'settings.shortcutsKey': '快捷键',
  'settings.shortcutCloseTab': '关闭当前标签页',
  'settings.shortcutFindNext': '查找下一个/上一个',
  'settings.shortcutBeautify': '格式化文档',
  'settings.shortcutMinify': '最小化文档',
  'settings.shortcutToggleComment': '切换行注释',
  'settings.shortcutRectangularSelection': '矩形选区扩展',
  'editor.context.delete': '删除',
  'editor.context.selectAll': '全选',
  'editor.context.edit': '编辑',
  'editor.context.sort': '排序',
  'editor.context.convert': '转换',
  'editor.context.convert.base64Encode': 'Base64 编码',
  'editor.context.convert.base64Decode': 'Base64 解码',
  'editor.context.convert.copyBase64EncodeResult': '复制 Base64 编码结果',
  'editor.context.convert.copyBase64DecodeResult': '复制 Base64 解码结果',
  'editor.context.convert.base64DecodeFailed': 'Base64 解码失败：所选内容不是有效的 Base64 文本',
  'editor.context.sort.ascending': '升序排列行',
  'editor.context.sort.ascendingIgnoreCase': '升序排列行（忽略大小写）',
  'editor.context.sort.descending': '降序排列行',
  'editor.context.sort.descendingIgnoreCase': '降序排列行（忽略大小写）',
  'editor.context.sort.pinyinAscending': '按拼音升序排列行',
  'editor.context.sort.pinyinDescending': '按拼音降序排列行',
  'editor.context.cleanup.removeEmptyLines': '移除空行',
  'editor.context.cleanup.removeDuplicateLines': '移除重复行',
  'editor.context.cleanup.trimLeadingWhitespace': '移除行首空格',
  'editor.context.cleanup.trimTrailingWhitespace': '移除行尾空格',
  'editor.context.cleanup.trimSurroundingWhitespace': '移除行首行尾空格',
  'editor.largeMode.readOnlyTitle': '大文件模式当前为只读',
  'editor.largeMode.readOnlyDesc': '检测到你在尝试输入。进入可编辑模式可能导致性能下降。是否继续？',
  'editor.largeMode.keepReadOnly': '保持只读',
  'editor.largeMode.enterEditable': '进入编辑模式',
};

const enUS: Messages = {
  'app.readyOpenHint': 'READY: Open a file or folder',
  'app.externalFileChanged.prompt': 'File "{fileName}" has changed outside the editor. Reload now?',
  'app.externalFileChanged.unsavedWarning': 'Warning: Reloading will discard unsaved changes in this tab.',
  'titleBar.settings': 'Settings',
  'titleBar.closeOtherTabs': 'Close Other Tabs',
  'titleBar.closeAllTabs': 'Close All Tabs',
  'titleBar.copyFileName': 'Copy File Name',
  'titleBar.copyDirectory': 'Copy Directory',
  'titleBar.copyPath': 'Copy Path',
  'titleBar.openContainingFolder': 'Open Containing Folder',
  'titleBar.enableAlwaysOnTop': 'Enable Always on Top',
  'titleBar.disableAlwaysOnTop': 'Disable Always on Top',
  'tabCloseConfirm.title': 'Unsaved Changes',
  'tabCloseConfirm.message': 'Tab "{tabName}" has unsaved changes. Close with saving?',
  'tabCloseConfirm.save': 'Yes',
  'tabCloseConfirm.discard': 'No',
  'tabCloseConfirm.cancel': 'Cancel',
  'tabCloseConfirm.saveAll': 'Yes (All)',
  'tabCloseConfirm.discardAll': 'No (All)',
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
  'toolbar.bookmarkSidebar': 'Bookmark Sidebar',
  'toolbar.outline': 'Outline',
  'toolbar.filter': 'Filter',
  'toolbar.format.beautify': 'Beautify (Ctrl+Alt+F)',
  'toolbar.format.minify': 'Minify (Ctrl+Alt+M)',
  'toolbar.format.unsupported': 'Only JSON, YAML, XML, HTML, and TOML are supported.',
  'toolbar.format.failed': 'Format failed:',
  'toolbar.recent.noFiles': 'No recent files',
  'toolbar.recent.noFolders': 'No recent folders',
  'toolbar.recent.clearFiles': 'Clear recent files',
  'toolbar.recent.clearFolders': 'Clear recent folders',
  'toolbar.wordCount': 'Word Count',
  'toolbar.wordCount.title': 'Word Count',
  'toolbar.wordCount.words': 'Words',
  'toolbar.wordCount.characters': 'Characters (with spaces)',
  'toolbar.wordCount.charactersNoSpaces': 'Characters (no spaces)',
  'toolbar.wordCount.lines': 'Lines',
  'toolbar.wordCount.paragraphs': 'Paragraphs',
  'toolbar.wordCount.failed': 'Word count failed:',
  'toolbar.disabled.noActiveDocument': 'No active document',
  'toolbar.disabled.noUnsavedChanges': 'No unsaved changes',
  'toolbar.disabled.noUnsavedDocuments': 'No unsaved documents',
  'toolbar.disabled.noSelectedText': 'No selected text',
  'toolbar.disabled.noUndoHistory': 'No undo history',
  'toolbar.disabled.noRedoHistory': 'No redo history',
  'bookmark.menu.title': 'Bookmark',
  'bookmark.add': 'Add Bookmark',
  'bookmark.remove': 'Remove Bookmark',
  'bookmark.sidebar.title': 'Bookmarks',
  'bookmark.sidebar.empty': 'No bookmarks',
  'bookmark.sidebar.line': 'Line',
  'bookmark.sidebar.emptyLine': '(empty line)',
  'status.ready': 'Rutar Ready',
  'status.lines': 'Lines',
  'status.cursor': 'Cursor',
  'status.largeFileHighlightOff': 'Highlight Off (Large File)',
  'sidebar.empty': 'Empty',
  'sidebar.close': 'Close Sidebar',
  'outline.title': 'Outline',
  'outline.empty': 'No outline data',
  'outline.searchPlaceholder': 'Search outline...',
  'outline.searchEmpty': 'No matching items',
  'outline.searchClear': 'Clear search',
  'outline.expandAll': 'Expand All',
  'outline.collapseAll': 'Collapse All',
  'outline.unsupportedType': 'The active tab is not JSON, YAML, XML, TOML, INI, Python, JavaScript, TypeScript, C, C++, Go, Java, Rust, C#, PHP, Kotlin, or Swift. Cannot open outline.',
  'outline.parseFailed': 'Failed to parse active file:',
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
  'settings.singleInstanceMode': 'Single Instance Mode',
  'settings.singleInstanceModeDesc': 'When enabled, file-association and "Open with Rutar" actions reuse this window and open a new tab. Restart required.',
  'settings.singleInstanceModeRestartToast': 'Single instance setting changed. Restart Rutar to apply it.',
  'settings.rememberWindowState': 'Remember Window State',
  'settings.rememberWindowStateDesc': 'Persist and restore window size and maximized state. When maximized, only maximized state is stored.',
  'settings.about': 'About',
  'settings.aboutDesc': 'Project info and repository',
  'settings.aboutPanelDesc': 'View project information and source repository for Rutar.',
  'settings.about.projectUrl': 'Project URL',
  'settings.about.openLink': 'Open link',
  'settings.about.summary': 'Rutar is a high-performance code editor built with Tauri, React, and Rust.',
  'settings.editorPrefsDesc': 'Editor preferences and experience',
  'settings.generalTabDesc': 'Language and basic preferences',
  'settings.appearanceTabDesc': 'Theme, fonts, and editor visuals',
  'settings.shortcutsTabDesc': 'View all keyboard shortcuts',
  'settings.generalPanelDesc': 'Configure language and base behavior.',
  'settings.appearancePanelDesc': 'Tune editor visuals, typography, and readability.',
  'settings.shortcutsPanelDesc': 'View keyboard shortcuts supported in the current version.',
  'settings.close': 'Close settings',
  'settings.highlightCurrentLine': 'Highlight Current Line',
  'settings.highlightCurrentLineDesc': 'Highlight the line where the caret is currently placed.',
  'settings.doubleClickCloseTab': 'Double-click to Close Tab',
  'settings.doubleClickCloseTabDesc': 'Double-click a tab in the title bar to close it.',
  'settings.showLineNumbers': 'Show Line Numbers',
  'settings.showLineNumbersDesc': 'Show line numbers in the editor gutter.',
  'settings.newFileLineEnding': 'New File Line Ending',
  'settings.newFileLineEndingDesc': 'Choose the default line ending for newly created empty files.',
  'settings.wordWrapDesc': 'Wrap long lines to avoid horizontal scrolling.',
  'settings.switchOn': 'ON',
  'settings.switchOff': 'OFF',
  'settings.windowsContextMenu': 'Windows 11 Context Menu',
  'settings.windowsContextMenuDesc': 'Show "Open with Rutar" for files and folders in the context menu.',
  'settings.windowsFileAssociations': 'Windows File Associations',
  'settings.windowsFileAssociationsDesc': 'Set Rutar as the default editor for selected extensions. Supports double-click open with rutar_document.png icon.',
  'settings.windowsFileAssociationsHint': 'Select common text extensions and add custom ones (for example .env, .sql).',
  'settings.add': 'Add',
  'settings.customExtensionPlaceholder': 'Custom extension, e.g. .env',
  'settings.fontPickerPlaceholder': 'Type or select a font family (system fonts supported)',
  'settings.fontMoveUp': 'Move Font Up',
  'settings.fontMoveDown': 'Move Font Down',
  'settings.fontRemove': 'Remove Font',
  'settings.typography': 'Typography',
  'settings.tabWidth': 'Tab Width',
  'settings.tabWidthDesc': 'Indent width used by toolbar beautify action.',
  'settings.shortcuts': 'Shortcuts',
  'settings.shortcutsDesc': 'Common keyboard shortcuts currently supported in Rutar.',
  'settings.shortcutsAction': 'Action',
  'settings.shortcutsKey': 'Shortcut',
  'settings.shortcutCloseTab': 'Close Current Tab',
  'settings.shortcutFindNext': 'Find Next / Previous',
  'settings.shortcutBeautify': 'Beautify Document',
  'settings.shortcutMinify': 'Minify Document',
  'settings.shortcutToggleComment': 'Toggle Line Comment',
  'settings.shortcutRectangularSelection': 'Expand Rectangular Selection',
  'editor.context.delete': 'Delete',
  'editor.context.selectAll': 'Select All',
  'editor.context.edit': 'Edit',
  'editor.context.sort': 'Sort',
  'editor.context.convert': 'Convert',
  'editor.context.convert.base64Encode': 'Base64 Encode',
  'editor.context.convert.base64Decode': 'Base64 Decode',
  'editor.context.convert.copyBase64EncodeResult': 'Copy Base64 Encode Result',
  'editor.context.convert.copyBase64DecodeResult': 'Copy Base64 Decode Result',
  'editor.context.convert.base64DecodeFailed': 'Base64 decode failed: selected text is not valid Base64',
  'editor.context.sort.ascending': 'Sort Lines Ascending',
  'editor.context.sort.ascendingIgnoreCase': 'Sort Lines Ascending (Ignore Case)',
  'editor.context.sort.descending': 'Sort Lines Descending',
  'editor.context.sort.descendingIgnoreCase': 'Sort Lines Descending (Ignore Case)',
  'editor.context.sort.pinyinAscending': 'Sort Lines by Pinyin Ascending',
  'editor.context.sort.pinyinDescending': 'Sort Lines by Pinyin Descending',
  'editor.context.cleanup.removeEmptyLines': 'Remove Empty Lines',
  'editor.context.cleanup.removeDuplicateLines': 'Remove Duplicate Lines',
  'editor.context.cleanup.trimLeadingWhitespace': 'Trim Leading Whitespace',
  'editor.context.cleanup.trimTrailingWhitespace': 'Trim Trailing Whitespace',
  'editor.context.cleanup.trimSurroundingWhitespace': 'Trim Leading/Trailing Whitespace',
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

export function getSearchPanelMessages(language: AppLanguage) {
  if (language === 'en-US') {
    return {
      counting: 'Counting…',
      invalidRegex: 'Invalid regular expression',
      searchFailed: 'Search failed',
      filterFailed: 'Filter failed',
      replaceFailed: 'Replace failed',
      replaceAllFailed: 'Replace all failed',
      noReplaceMatches: 'No matches to replace',
      replacedCurrent: 'Replaced current match',
      textUnchanged: 'Text unchanged',
      replacedAll: (count: number) => `Replaced all ${count} matches`,
      statusEnterToSearch: 'Enter keyword and press Enter to search',
      statusSearching: 'Searching...',
      statusNoMatches: 'No matches found',
      statusTotalPending: (current: number) => `Total matches counting… · Current ${current}/?`,
      statusTotalReady: (total: number, current: number) => `Total ${total} matches · Current ${current}/${Math.max(total, 1)}`,
      statusEnterToFilter: 'Add filter rules and press Enter to run filter',
      statusFiltering: 'Filtering...',
      statusFilterNoMatches: 'No lines matched filters',
      statusFilterTotalPending: (current: number) => `Matched lines counting… · Current ${current}/?`,
      statusFilterTotalReady: (total: number, current: number) => `Matched lines ${total} · Current ${current}/${Math.max(total, 1)}`,
      find: 'Find',
      replace: 'Replace',
      filter: 'Filter',
      switchToReplaceMode: 'Switch to replace mode',
      switchToFilterMode: 'Switch to filter mode',
      noFileOpen: 'No file opened',
      close: 'Close',
      findPlaceholder: 'Find text',
      filterAddRule: 'Add Rule',
      filterRuleKeywordPlaceholder: 'Filter keyword',
      filterMatchContains: 'Contains',
      filterMatchRegex: 'Regex',
      filterMatchWildcard: 'Wildcard',
      filterApplyLine: 'Whole line',
      filterApplyMatch: 'Match only',
      filterStyleBold: 'Bold',
      filterStyleItalic: 'Italic',
      filterBackground: 'Bg',
      filterNoBackground: 'No Bg',
      filterTextColor: 'Text',
      filterMoveUp: 'Move up',
      filterMoveDown: 'Move down',
      filterDeleteRule: 'Delete',
      filterPriority: 'Priority',
      filterDragPriorityHint: 'Drag to reorder priority',
      filterRuleEmptyHint: 'Add at least one non-empty rule.',
      filterRun: 'Filter',
      filterRunHint: 'Click Filter to run current rules',
      filterGroupNamePlaceholder: 'Rule group name',
      filterSaveGroup: 'Save Group',
      filterLoadGroup: 'Load Group',
      filterDeleteGroup: 'Delete Group',
      filterGroupSelectPlaceholder: 'Select rule group',
      filterGroupsEmptyHint: 'No saved rule groups yet.',
      filterImportGroups: 'Import Groups',
      filterExportGroups: 'Export Groups',
      filterGroupNameRequired: 'Please enter a rule group name',
      filterGroupRuleRequired: 'Add at least one non-empty rule before saving',
      filterGroupSelectRequired: 'Please select a rule group',
      filterGroupsExportEmpty: 'No rule groups to export',
      filterGroupSaved: (name: string) => `Saved rule group: ${name}`,
      filterGroupLoaded: (name: string) => `Loaded rule group: ${name}`,
      filterGroupDeleted: (name: string) => `Deleted rule group: ${name}`,
      filterGroupsImported: (count: number) => `Imported ${count} rule groups`,
      filterGroupsExported: (count: number) => `Exported ${count} rule groups`,
      filterGroupLoadFailed: 'Failed to load rule groups',
      filterGroupSaveFailed: 'Failed to save rule groups',
      filterGroupImportFailed: 'Failed to import rule groups',
      filterGroupExportFailed: 'Failed to export rule groups',
      collapseResults: 'Collapse results',
      expandResults: 'Expand results',
      results: 'Results',
      all: 'All',
      collapse: 'Collapse',
      replacePlaceholder: 'Replace with',
      modeLiteral: 'Literal',
      modeRegex: 'Regex',
      modeWildcard: 'Wildcard',
      caseSensitive: 'Case Sensitive',
      reverseSearch: 'Reverse Search',
      prevMatch: 'Previous match',
      previous: 'Previous',
      nextMatch: 'Next match',
      next: 'Next',
      replaceCurrentMatch: 'Replace current match',
      replaceAllMatches: 'Replace all matches',
      replaceAll: 'Replace All',
      shortcutHint: 'F3 Next / Shift+F3 Previous',
      lineColTitle: (line: number, col: number) => `Line ${line}, Col ${col}`,
      resultsSummary: (totalMatchesText: string, totalLinesText: string, loaded: number) =>
        `Search Results · Total ${totalMatchesText} / ${totalLinesText} lines · Loaded ${loaded}`,
      filterResultsSummary: (totalLinesText: string, loaded: number) =>
        `Filter Results · Total ${totalLinesText} lines · Loaded ${loaded}`,
      refreshResults: 'Refresh search results',
      refreshFilterResults: 'Refresh filter results',
      resultFilterPlaceholder: 'Search in all results',
      resultFilterSearch: 'Filter',
      resultFilterStop: 'Stop',
      resultFilterNoMatches: 'No results match this filter.',
      resultFilterStepNoMatch: (keyword: string) => `No entries in results contain "${keyword}".`,
      clearResultFilter: 'Clear result filter',
      copyResults: 'Copy results as plain text',
      copyResultsEmpty: 'No results to copy',
      copyResultsSuccess: (count: number) => `Copied ${count} results as plain text`,
      copyResultsFailed: 'Failed to copy results',
      minimizeResults: 'Minimize results',
      closeResults: 'Close results',
      resultsEmptyHint: 'Enter a keyword to list all matches here.',
      noMatchesHint: 'No matches found.',
      filterResultsEmptyHint: 'Add rules and run filter to list matching lines here.',
      noFilterMatchesHint: 'No lines matched current filter rules.',
      loadingMore: 'Loading more results...',
      scrollToLoadMore: 'Scroll to bottom to load more',
      loadedAll: (totalMatchesText: string) => `All results loaded (${totalMatchesText})`,
      filterLoadingMore: 'Loading more filtered lines...',
      filterScrollToLoadMore: 'Scroll to bottom to load more filtered lines',
      filterLoadedAll: (totalLinesText: string) => `All filtered lines loaded (${totalLinesText})`,
      minimizedSummary: (totalMatchesText: string, totalLinesText: string, loaded: number) =>
        `Results ${totalMatchesText} / ${totalLinesText} lines · Loaded ${loaded}`,
      filterMinimizedSummary: (totalLinesText: string, loaded: number) =>
        `Filtered ${totalLinesText} lines · Loaded ${loaded}`,
      openResults: 'Open search results',
      openFilterResults: 'Open filter results',
    };
  }

  return {
    counting: '统计中…',
    invalidRegex: '正则表达式无效',
    searchFailed: '搜索失败',
    filterFailed: '过滤失败',
    replaceFailed: '替换失败',
    replaceAllFailed: '全部替换失败',
    noReplaceMatches: '没有可替换的匹配项',
    replacedCurrent: '已替换当前匹配项',
    textUnchanged: '文本未发生变化',
    replacedAll: (count: number) => `已全部替换 ${count} 处`,
    statusEnterToSearch: '输入关键词后按 Enter 开始搜索',
    statusSearching: '正在搜索...',
    statusNoMatches: '未找到匹配项',
    statusTotalPending: (current: number) => `匹配总计 统计中… · 当前 ${current}/?`,
    statusTotalReady: (total: number, current: number) => `匹配总计 ${total} 项 · 当前 ${current}/${Math.max(total, 1)}`,
    statusEnterToFilter: '添加规则后按 Enter 开始过滤',
    statusFiltering: '正在过滤...',
    statusFilterNoMatches: '没有行匹配当前过滤规则',
    statusFilterTotalPending: (current: number) => `匹配行总计统计中… · 当前 ${current}/?`,
    statusFilterTotalReady: (total: number, current: number) => `匹配行总计 ${total} 行 · 当前 ${current}/${Math.max(total, 1)}`,
    find: '查找',
    replace: '替换',
    filter: '过滤',
    switchToReplaceMode: '切换到替换模式',
    switchToFilterMode: '切换到过滤模式',
    noFileOpen: '没有打开的文件',
    close: '关闭',
    findPlaceholder: '查找内容',
    filterAddRule: '新增规则',
    filterRuleKeywordPlaceholder: '过滤关键字',
    filterMatchContains: '存在',
    filterMatchRegex: '正则',
    filterMatchWildcard: '通配符',
    filterApplyLine: '整行',
    filterApplyMatch: '仅匹配项',
    filterStyleBold: '粗体',
    filterStyleItalic: '斜体',
    filterBackground: '底色',
    filterNoBackground: '无底色',
    filterTextColor: '字体色',
    filterMoveUp: '上移',
    filterMoveDown: '下移',
    filterDeleteRule: '删除',
    filterPriority: '优先级',
    filterDragPriorityHint: '拖拽可调整优先级',
    filterRuleEmptyHint: '请至少添加一条非空规则。',
    filterRun: '过滤',
    filterRunHint: '点击“过滤”按钮后开始按规则过滤',
    filterGroupNamePlaceholder: '规则组名称',
    filterSaveGroup: '保存规则组',
    filterLoadGroup: '加载规则组',
    filterDeleteGroup: '删除规则组',
    filterGroupSelectPlaceholder: '选择规则组',
    filterGroupsEmptyHint: '暂无已保存规则组。',
    filterImportGroups: '导入规则组',
    filterExportGroups: '导出规则组',
    filterGroupNameRequired: '请输入规则组名称',
    filterGroupRuleRequired: '请至少添加一条非空规则再保存',
    filterGroupSelectRequired: '请先选择规则组',
    filterGroupsExportEmpty: '暂无可导出的规则组',
    filterGroupSaved: (name: string) => `已保存规则组：${name}`,
    filterGroupLoaded: (name: string) => `已加载规则组：${name}`,
    filterGroupDeleted: (name: string) => `已删除规则组：${name}`,
    filterGroupsImported: (count: number) => `已导入 ${count} 个规则组`,
    filterGroupsExported: (count: number) => `已导出 ${count} 个规则组`,
    filterGroupLoadFailed: '加载规则组失败',
    filterGroupSaveFailed: '保存规则组失败',
    filterGroupImportFailed: '导入规则组失败',
    filterGroupExportFailed: '导出规则组失败',
    collapseResults: '收起结果',
    expandResults: '展开结果',
    results: '结果',
    all: '所有',
    collapse: '收起',
    replacePlaceholder: '替换为',
    modeLiteral: '普通',
    modeRegex: '正则',
    modeWildcard: '通配符',
    caseSensitive: '区分大小写',
    reverseSearch: '反向搜索',
    prevMatch: '上一个匹配',
    previous: '上一个',
    nextMatch: '下一个匹配',
    next: '下一个',
    replaceCurrentMatch: '替换当前匹配项',
    replaceAllMatches: '替换全部匹配项',
    replaceAll: '全部替换',
    shortcutHint: 'F3 下一个 / Shift+F3 上一个',
    lineColTitle: (line: number, col: number) => `行 ${line}，列 ${col}`,
    resultsSummary: (totalMatchesText: string, totalLinesText: string, loaded: number) =>
      `搜索结果 · 总计 ${totalMatchesText} 处 / ${totalLinesText} 行 · 已加载 ${loaded} 处`,
    filterResultsSummary: (totalLinesText: string, loaded: number) =>
      `过滤结果 · 总计 ${totalLinesText} 行 · 已加载 ${loaded} 行`,
    refreshResults: '刷新搜索结果',
    refreshFilterResults: '刷新过滤结果',
    resultFilterPlaceholder: '在全部结果中搜索',
    resultFilterSearch: '过滤',
    resultFilterStop: '停止',
    resultFilterNoMatches: '结果中没有匹配该筛选词的项。',
    resultFilterStepNoMatch: (keyword: string) => `当前结果列表中没有包含“${keyword}”的项。`,
    clearResultFilter: '清空结果筛选',
    copyResults: '复制结果为纯文本',
    copyResultsEmpty: '没有可复制的结果',
    copyResultsSuccess: (count: number) => `已复制 ${count} 条纯文本结果`,
    copyResultsFailed: '复制结果失败',
    minimizeResults: '最小化结果',
    closeResults: '关闭结果',
    resultsEmptyHint: '输入关键词后会在这里列出全部匹配项。',
    noMatchesHint: '没有找到任何匹配项。',
    filterResultsEmptyHint: '添加规则并开始过滤后，这里会列出匹配行。',
    noFilterMatchesHint: '没有行匹配当前过滤规则。',
    loadingMore: '正在加载更多结果...',
    scrollToLoadMore: '滚动到底部自动加载更多结果',
    loadedAll: (totalMatchesText: string) => `已加载全部搜索结果（共 ${totalMatchesText} 处）`,
    filterLoadingMore: '正在加载更多过滤结果...',
    filterScrollToLoadMore: '滚动到底部自动加载更多过滤结果',
    filterLoadedAll: (totalLinesText: string) => `已加载全部过滤结果（共 ${totalLinesText} 行）`,
    minimizedSummary: (totalMatchesText: string, totalLinesText: string, loaded: number) =>
      `结果 总计${totalMatchesText}处 / ${totalLinesText}行 · 已加载${loaded}处`,
    filterMinimizedSummary: (totalLinesText: string, loaded: number) =>
      `过滤结果 ${totalLinesText}行 · 已加载${loaded}行`,
    openResults: '展开搜索结果',
    openFilterResults: '展开过滤结果',
  };
}
