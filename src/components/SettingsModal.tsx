import { X, Type, Monitor, Palette, Languages, SquareTerminal, FileText } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n';
import { invoke } from '@tauri-apps/api/core';

const FALLBACK_WINDOWS_FILE_ASSOCIATION_EXTENSIONS = [
  '.txt',
  '.md',
  '.log',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.ini',
  '.cfg',
  '.conf',
  '.csv',
];

function normalizeWindowsFileAssociationExtension(value: string): string | null {
  const trimmedValue = value.trim().replace(/\*/g, '');
  if (!trimmedValue) {
    return null;
  }

  const normalized = (trimmedValue.startsWith('.') ? trimmedValue : `.${trimmedValue}`).toLowerCase();
  if (normalized.length < 2) {
    return null;
  }

  if (!/^\.[a-z0-9_+-]+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeWindowsFileAssociationExtensions(values: string[]): string[] {
  const normalized = values
    .map((value) => normalizeWindowsFileAssociationExtension(value))
    .filter((value): value is string => !!value)
    .sort((left, right) => left.localeCompare(right));

  return Array.from(new Set(normalized));
}

function areStringListsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function SettingsModal() {
  const settings = useStore((state) => state.settings);
  const toggleSettings = useStore((state) => state.toggleSettings);
  const updateSettings = useStore((state) => state.updateSettings);
  const [activeTab, setActiveTab] = useState<'general' | 'appearance'>('appearance');
  const [defaultExtensions, setDefaultExtensions] = useState<string[]>(FALLBACK_WINDOWS_FILE_ASSOCIATION_EXTENSIONS);
  const [customExtensionInput, setCustomExtensionInput] = useState('');
  const [isUpdatingFileAssociations, setIsUpdatingFileAssociations] = useState(false);
  const [showRestartToast, setShowRestartToast] = useState(false);
  const restartToastTimerRef = useRef<number | null>(null);
  const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);
  const currentLineLabel = settings.language === 'zh-CN' ? '高亮当前行' : 'Highlight Current Line';
  const currentLineDesc =
    settings.language === 'zh-CN'
      ? '在编辑器中突出显示光标所在行。'
      : 'Highlight the line where the caret is currently placed.';
  const doubleClickCloseTabLabel = settings.language === 'zh-CN' ? '双击关闭标签页' : 'Double-click to Close Tab';
  const doubleClickCloseTabDesc =
    settings.language === 'zh-CN'
      ? '双击顶部标签页可直接关闭。'
      : 'Double-click a tab in the title bar to close it.';
  const wordWrapDesc =
    settings.language === 'zh-CN'
      ? '超过容器宽度时自动换行，减少横向滚动。'
      : 'Wrap long lines to avoid horizontal scrolling.';
  const appearanceTabDesc =
    settings.language === 'zh-CN'
      ? '主题、字体与编辑器显示'
      : 'Theme, fonts, and editor visuals';
  const generalTabDesc =
    settings.language === 'zh-CN'
      ? '语言与基础偏好'
      : 'Language and basic preferences';

  const controlClassName =
    'flex h-10 w-full rounded-lg border border-input bg-background/70 text-foreground px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50';
  const switchOnText = settings.language === 'zh-CN' ? '开' : 'ON';
  const switchOffText = settings.language === 'zh-CN' ? '关' : 'OFF';
  const isWindows = typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent);

  const windowsContextLabel = settings.language === 'zh-CN' ? 'Windows 11 右键菜单' : 'Windows 11 Context Menu';
  const windowsContextDesc = settings.language === 'zh-CN'
    ? '在文件和文件夹右键菜单中显示“使用 Rutar 打开”。'
    : 'Show "Open with Rutar" for files and folders in the context menu.';
  const windowsFileAssociationLabel = settings.language === 'zh-CN' ? 'Windows 文件关联' : 'Windows File Associations';
  const windowsFileAssociationDesc = settings.language === 'zh-CN'
    ? '将 Rutar 设为所选后缀的默认编辑器，支持双击直接打开。图标使用 rutar_document.png。'
    : 'Set Rutar as the default editor for selected extensions. Supports double-click open with rutar_document.png icon.';
  const windowsFileAssociationHint = settings.language === 'zh-CN'
    ? '勾选常见文本后缀，也可自定义（如 .env、.sql）。'
    : 'Select common text extensions and add custom ones (for example .env, .sql).';
  const addExtensionButtonLabel = settings.language === 'zh-CN' ? '添加' : 'Add';
  const singleInstanceModeLabel = tr('settings.singleInstanceMode');
  const singleInstanceModeDesc = tr('settings.singleInstanceModeDesc');
  const singleInstanceModeRestartToast = tr('settings.singleInstanceModeRestartToast');

  const normalizedSelectedExtensions = useMemo(
    () => normalizeWindowsFileAssociationExtensions(settings.windowsFileAssociationExtensions),
    [settings.windowsFileAssociationExtensions],
  );
  const effectiveDefaultExtensions = useMemo(
    () => normalizeWindowsFileAssociationExtensions(defaultExtensions),
    [defaultExtensions],
  );
  const customExtensions = useMemo(
    () => normalizedSelectedExtensions.filter((extension) => !effectiveDefaultExtensions.includes(extension)),
    [normalizedSelectedExtensions, effectiveDefaultExtensions],
  );

  const handleToggleWindowsContextMenu = async () => {
    const nextEnabled = !settings.windowsContextMenuEnabled;

    try {
      if (nextEnabled) {
        await invoke('register_windows_context_menu', {
          language: settings.language,
        });
      } else {
        await invoke('unregister_windows_context_menu');
      }

      updateSettings({ windowsContextMenuEnabled: nextEnabled });
    } catch (error) {
      console.error('Failed to update Windows context menu:', error);
    }
  };

  useEffect(() => {
    if (!isWindows) {
      return;
    }

    let cancelled = false;

    const loadDefaultExtensions = async () => {
      try {
        const extensions = await invoke<string[]>('get_default_windows_file_association_extensions');
        if (cancelled) {
          return;
        }

        const normalizedDefaults = normalizeWindowsFileAssociationExtensions(extensions);
        if (normalizedDefaults.length === 0) {
          return;
        }

        setDefaultExtensions(normalizedDefaults);

        if (settings.windowsFileAssociationExtensions.length === 0) {
          updateSettings({
            windowsFileAssociationExtensions: normalizedDefaults,
          });
        }
      } catch (error) {
        console.error('Failed to load default file association extensions:', error);
      }
    };

    void loadDefaultExtensions();

    return () => {
      cancelled = true;
    };
  }, [isWindows, settings.windowsFileAssociationExtensions.length, updateSettings]);

  const persistWindowsFileAssociationExtensions = async (extensions: string[]) => {
    const normalizedExtensions = normalizeWindowsFileAssociationExtensions(extensions);

    if (areStringListsEqual(normalizedSelectedExtensions, normalizedExtensions)) {
      return;
    }

    updateSettings({ windowsFileAssociationExtensions: normalizedExtensions });

    if (!settings.windowsFileAssociationEnabled) {
      return;
    }

    setIsUpdatingFileAssociations(true);

    try {
      const removedExtensions = normalizedSelectedExtensions.filter(
        (extension) => !normalizedExtensions.includes(extension),
      );

      if (removedExtensions.length > 0) {
        await invoke('remove_windows_file_associations', {
          extensions: removedExtensions,
        });
      }

      const appliedExtensions = await invoke<string[]>('apply_windows_file_associations', {
        language: settings.language,
        extensions: normalizedExtensions,
      });

      updateSettings({
        windowsFileAssociationEnabled: true,
        windowsFileAssociationExtensions: normalizeWindowsFileAssociationExtensions(appliedExtensions),
      });
    } catch (error) {
      console.error('Failed to apply Windows file associations:', error);
    } finally {
      setIsUpdatingFileAssociations(false);
    }
  };

  const handleTogglePresetExtension = (extension: string) => {
    const nextExtensions = normalizedSelectedExtensions.includes(extension)
      ? normalizedSelectedExtensions.filter((item) => item !== extension)
      : [...normalizedSelectedExtensions, extension];

    void persistWindowsFileAssociationExtensions(nextExtensions);
  };

  const handleAddCustomExtension = () => {
    const normalizedExtension = normalizeWindowsFileAssociationExtension(customExtensionInput);
    if (!normalizedExtension) {
      return;
    }

    setCustomExtensionInput('');
    void persistWindowsFileAssociationExtensions([...normalizedSelectedExtensions, normalizedExtension]);
  };

  const handleRemoveCustomExtension = (extension: string) => {
    void persistWindowsFileAssociationExtensions(
      normalizedSelectedExtensions.filter((item) => item !== extension),
    );
  };

  const handleToggleWindowsFileAssociations = async () => {
    const nextEnabled = !settings.windowsFileAssociationEnabled;
    const candidateExtensions =
      normalizedSelectedExtensions.length > 0
        ? normalizedSelectedExtensions
        : effectiveDefaultExtensions;

    const normalizedCandidateExtensions = normalizeWindowsFileAssociationExtensions(candidateExtensions);

    setIsUpdatingFileAssociations(true);

    try {
      if (nextEnabled) {
        const appliedExtensions = await invoke<string[]>('apply_windows_file_associations', {
          language: settings.language,
          extensions: normalizedCandidateExtensions,
        });

        updateSettings({
          windowsFileAssociationEnabled: true,
          windowsFileAssociationExtensions: normalizeWindowsFileAssociationExtensions(appliedExtensions),
        });
        return;
      }

      await invoke('remove_windows_file_associations', {
        extensions: normalizedCandidateExtensions,
      });

      updateSettings({ windowsFileAssociationEnabled: false });
    } catch (error) {
      console.error('Failed to update Windows file associations:', error);
    } finally {
      setIsUpdatingFileAssociations(false);
    }
  };

  const showSingleInstanceRestartToast = () => {
    if (restartToastTimerRef.current !== null) {
      window.clearTimeout(restartToastTimerRef.current);
    }

    setShowRestartToast(true);
    restartToastTimerRef.current = window.setTimeout(() => {
      setShowRestartToast(false);
      restartToastTimerRef.current = null;
    }, 2600);
  };

  useEffect(() => {
    return () => {
      if (restartToastTimerRef.current !== null) {
        window.clearTimeout(restartToastTimerRef.current);
      }
    };
  }, []);

  if (!settings.isOpen) return null;

  return (
    <div 
        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]" 
        role="presentation"
    >
      <div 
        className="pointer-events-auto h-[min(88vh,700px)] w-[min(94vw,980px)] bg-background/95 border rounded-xl shadow-2xl flex overflow-hidden ring-1 ring-border"
        role="dialog"
      >
        <div className="w-60 bg-muted/30 border-r p-3 flex flex-col gap-2">
          <div className="px-2 py-2 mb-2">
            <div className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{tr('settings.title')}</div>
            <div className="mt-1 text-xs text-muted-foreground/80">
              {settings.language === 'zh-CN' ? '编辑器偏好与体验' : 'Editor preferences and experience'}
            </div>
          </div>

          <button
            onClick={() => setActiveTab('general')}
            className={cn(
              'flex items-start gap-3 px-3 py-3 rounded-lg text-left transition-colors border',
              activeTab === 'general'
                ? 'bg-accent/70 text-accent-foreground border-accent-foreground/10 shadow-sm'
                : 'hover:bg-muted/70 border-transparent'
            )}
          >
            <Monitor className="w-4 h-4 mt-0.5" />
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight">{tr('settings.general')}</span>
              <span className="block text-xs text-muted-foreground mt-1">{generalTabDesc}</span>
            </span>
          </button>

          <button
            onClick={() => setActiveTab('appearance')}
            className={cn(
              'flex items-start gap-3 px-3 py-3 rounded-lg text-left transition-colors border',
              activeTab === 'appearance'
                ? 'bg-accent/70 text-accent-foreground border-accent-foreground/10 shadow-sm'
                : 'hover:bg-muted/70 border-transparent'
            )}
          >
            <Palette className="w-4 h-4 mt-0.5" />
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight">{tr('settings.appearance')}</span>
              <span className="block text-xs text-muted-foreground mt-1">{appearanceTabDesc}</span>
            </span>
          </button>
        </div>

        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b bg-background/70">
            <div>
              <h2 className="font-semibold text-base">
                {activeTab === 'general' ? tr('settings.general') : tr('settings.appearance')}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeTab === 'general'
                  ? (settings.language === 'zh-CN' ? '配置应用基础行为与语言。' : 'Configure language and base behavior.')
                  : (settings.language === 'zh-CN' ? '调整编辑器观感、排版与阅读体验。' : 'Tune editor visuals, typography, and readability.')}
              </p>
            </div>
            <button 
                onClick={() => toggleSettings(false)}
                className="hover:bg-destructive/10 hover:text-destructive rounded-md p-1.5 transition-colors"
                aria-label="Close settings"
            >
                <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 p-6 overflow-y-auto bg-gradient-to-b from-background to-muted/10">
            {activeTab === 'general' && (
              <div className="space-y-4 max-w-2xl">
                <section className="rounded-xl border border-border/70 bg-card/80 p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-medium mb-3">
                    <Languages className="w-4 h-4 text-muted-foreground" />
                    {tr('settings.language')}
                  </div>
                  <div className="space-y-2">
                    <select
                      className={controlClassName}
                      value={settings.language}
                      onChange={(e) => updateSettings({ language: e.target.value as typeof settings.language })}
                    >
                      <option value="zh-CN">{tr('settings.language.zhCN')}</option>
                      <option value="en-US">{tr('settings.language.enUS')}</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {tr('settings.languageDesc')}
                    </p>
                  </div>
                </section>

                <section className="rounded-xl border border-border/70 bg-card/80 p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-none">{doubleClickCloseTabLabel}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{doubleClickCloseTabDesc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSettings({ doubleClickCloseTab: !settings.doubleClickCloseTab })}
                      className={cn(
                        'relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border p-0.5 transition-all duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        settings.doubleClickCloseTab
                          ? 'justify-end border-emerald-500/90 bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)] dark:border-emerald-400/90 dark:bg-emerald-500/85'
                          : 'justify-start border-zinc-400/80 bg-zinc-300/70 dark:border-zinc-500/90 dark:bg-zinc-700/80'
                      )}
                      aria-pressed={!!settings.doubleClickCloseTab}
                      aria-label={doubleClickCloseTabLabel}
                    >
                      <span
                        className={cn(
                          'pointer-events-none absolute left-2 text-[9px] font-semibold tracking-[0.08em] transition-opacity',
                          settings.doubleClickCloseTab
                            ? 'opacity-0 text-primary-foreground/80'
                            : 'opacity-90 text-zinc-700 dark:text-zinc-200'
                        )}
                      >
                        {switchOffText}
                      </span>
                      <span
                        className={cn(
                          'pointer-events-none absolute right-2 text-[9px] font-semibold tracking-[0.08em] transition-opacity',
                          settings.doubleClickCloseTab
                            ? 'opacity-95 text-primary-foreground'
                            : 'opacity-0 text-zinc-700 dark:text-zinc-200'
                        )}
                      >
                        {switchOnText}
                      </span>
                      <span className="relative z-10 h-5 w-5 rounded-full border border-black/10 bg-white shadow-sm transition-transform dark:border-white/20" />
                    </button>
                  </div>
                </section>

                <section className="rounded-xl border border-border/70 bg-card/80 p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-none">{tr('toolbar.toggleWordWrap')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{wordWrapDesc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSettings({ wordWrap: !settings.wordWrap })}
                      className={cn(
                        'relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border p-0.5 transition-all duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        settings.wordWrap
                          ? 'justify-end border-emerald-500/90 bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)] dark:border-emerald-400/90 dark:bg-emerald-500/85'
                          : 'justify-start border-zinc-400/80 bg-zinc-300/70 dark:border-zinc-500/90 dark:bg-zinc-700/80'
                      )}
                      aria-pressed={!!settings.wordWrap}
                      aria-label={tr('toolbar.toggleWordWrap')}
                    >
                      <span
                        className={cn(
                          'pointer-events-none absolute left-2 text-[9px] font-semibold tracking-[0.08em] transition-opacity',
                          settings.wordWrap
                            ? 'opacity-0 text-primary-foreground/80'
                            : 'opacity-90 text-zinc-700 dark:text-zinc-200'
                        )}
                      >
                        {switchOffText}
                      </span>
                      <span
                        className={cn(
                          'pointer-events-none absolute right-2 text-[9px] font-semibold tracking-[0.08em] transition-opacity',
                          settings.wordWrap
                            ? 'opacity-95 text-primary-foreground'
                            : 'opacity-0 text-zinc-700 dark:text-zinc-200'
                        )}
                      >
                        {switchOnText}
                      </span>
                      <span className="relative z-10 h-5 w-5 rounded-full border border-black/10 bg-white shadow-sm transition-transform dark:border-white/20" />
                    </button>
                  </div>
                </section>

                <section className="rounded-xl border border-border/70 bg-card/80 p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-none">{singleInstanceModeLabel}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{singleInstanceModeDesc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        updateSettings({ singleInstanceMode: !settings.singleInstanceMode });
                        showSingleInstanceRestartToast();
                      }}
                      className={cn(
                        'relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border p-0.5 transition-all duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        settings.singleInstanceMode
                          ? 'justify-end border-emerald-500/90 bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)] dark:border-emerald-400/90 dark:bg-emerald-500/85'
                          : 'justify-start border-zinc-400/80 bg-zinc-300/70 dark:border-zinc-500/90 dark:bg-zinc-700/80'
                      )}
                      aria-pressed={!!settings.singleInstanceMode}
                      aria-label={singleInstanceModeLabel}
                    >
                      <span
                        className={cn(
                          'pointer-events-none absolute left-2 text-[9px] font-semibold tracking-[0.08em] transition-opacity',
                          settings.singleInstanceMode
                            ? 'opacity-0 text-primary-foreground/80'
                            : 'opacity-90 text-zinc-700 dark:text-zinc-200'
                        )}
                      >
                        {switchOffText}
                      </span>
                      <span
                        className={cn(
                          'pointer-events-none absolute right-2 text-[9px] font-semibold tracking-[0.08em] transition-opacity',
                          settings.singleInstanceMode
                            ? 'opacity-95 text-primary-foreground'
                            : 'opacity-0 text-zinc-700 dark:text-zinc-200'
                        )}
                      >
                        {switchOnText}
                      </span>
                      <span className="relative z-10 h-5 w-5 rounded-full border border-black/10 bg-white shadow-sm transition-transform dark:border-white/20" />
                    </button>
                  </div>
                </section>

                {isWindows && (
                  <>
                    <section className="rounded-xl border border-border/70 bg-card/80 p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <SquareTerminal className="w-4 h-4 text-muted-foreground" />
                            <p className="text-sm font-medium leading-none">{windowsContextLabel}</p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{windowsContextDesc}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleToggleWindowsContextMenu()}
                          className={cn(
                            'relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border p-0.5 transition-all duration-200',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            settings.windowsContextMenuEnabled
                              ? 'justify-end border-emerald-500/90 bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)] dark:border-emerald-400/90 dark:bg-emerald-500/85'
                              : 'justify-start border-zinc-400/80 bg-zinc-300/70 dark:border-zinc-500/90 dark:bg-zinc-700/80'
                          )}
                          aria-pressed={!!settings.windowsContextMenuEnabled}
                          aria-label={windowsContextLabel}
                        >
                          <span
                            className={cn(
                              'pointer-events-none absolute left-2 text-[9px] font-semibold tracking-[0.08em] transition-opacity',
                              settings.windowsContextMenuEnabled
                                ? 'opacity-0 text-primary-foreground/80'
                                : 'opacity-90 text-zinc-700 dark:text-zinc-200'
                            )}
                          >
                            {switchOffText}
                          </span>
                          <span
                            className={cn(
                              'pointer-events-none absolute right-2 text-[9px] font-semibold tracking-[0.08em] transition-opacity',
                              settings.windowsContextMenuEnabled
                                ? 'opacity-95 text-primary-foreground'
                                : 'opacity-0 text-zinc-700 dark:text-zinc-200'
                            )}
                          >
                            {switchOnText}
                          </span>
                          <span className="relative z-10 h-5 w-5 rounded-full border border-black/10 bg-white shadow-sm transition-transform dark:border-white/20" />
                        </button>
                      </div>
                    </section>

                    <section className="rounded-xl border border-border/70 bg-card/80 p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <p className="text-sm font-medium leading-none">{windowsFileAssociationLabel}</p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{windowsFileAssociationDesc}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleToggleWindowsFileAssociations()}
                          disabled={isUpdatingFileAssociations}
                          className={cn(
                            'relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border p-0.5 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            settings.windowsFileAssociationEnabled
                              ? 'justify-end border-emerald-500/90 bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)] dark:border-emerald-400/90 dark:bg-emerald-500/85'
                              : 'justify-start border-zinc-400/80 bg-zinc-300/70 dark:border-zinc-500/90 dark:bg-zinc-700/80'
                          )}
                          aria-pressed={!!settings.windowsFileAssociationEnabled}
                          aria-label={windowsFileAssociationLabel}
                        >
                          <span
                            className={cn(
                              'pointer-events-none absolute left-2 text-[9px] font-semibold tracking-[0.08em] transition-opacity',
                              settings.windowsFileAssociationEnabled
                                ? 'opacity-0 text-primary-foreground/80'
                                : 'opacity-90 text-zinc-700 dark:text-zinc-200'
                            )}
                          >
                            {switchOffText}
                          </span>
                          <span
                            className={cn(
                              'pointer-events-none absolute right-2 text-[9px] font-semibold tracking-[0.08em] transition-opacity',
                              settings.windowsFileAssociationEnabled
                                ? 'opacity-95 text-primary-foreground'
                                : 'opacity-0 text-zinc-700 dark:text-zinc-200'
                            )}
                          >
                            {switchOnText}
                          </span>
                          <span className="relative z-10 h-5 w-5 rounded-full border border-black/10 bg-white shadow-sm transition-transform dark:border-white/20" />
                        </button>
                      </div>

                      <div className="mt-4 space-y-3">
                        <p className="text-xs text-muted-foreground">{windowsFileAssociationHint}</p>

                        <div className="flex flex-wrap gap-2">
                          {effectiveDefaultExtensions.map((extension) => {
                            const selected = normalizedSelectedExtensions.includes(extension);

                            return (
                              <button
                                key={extension}
                                type="button"
                                onClick={() => handleTogglePresetExtension(extension)}
                                className={cn(
                                  'rounded-md border px-2.5 py-1 text-xs transition-colors',
                                  selected
                                    ? 'border-emerald-500/80 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                    : 'border-border bg-background/70 hover:bg-muted'
                                )}
                              >
                                {extension}
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            className={cn(controlClassName, 'h-9')}
                            value={customExtensionInput}
                            onChange={(event) => setCustomExtensionInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') {
                                return;
                              }

                              event.preventDefault();
                              handleAddCustomExtension();
                            }}
                            placeholder={settings.language === 'zh-CN' ? '输入自定义后缀，如 .env' : 'Custom extension, e.g. .env'}
                          />
                          <button
                            type="button"
                            onClick={() => handleAddCustomExtension()}
                            className="h-9 rounded-md border border-border px-3 text-xs hover:bg-muted transition-colors"
                          >
                            {addExtensionButtonLabel}
                          </button>
                        </div>

                        {customExtensions.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {customExtensions.map((extension) => (
                              <button
                                key={extension}
                                type="button"
                                onClick={() => handleRemoveCustomExtension(extension)}
                                className="rounded-md border border-border bg-background/70 px-2.5 py-1 text-xs hover:bg-muted transition-colors"
                              >
                                {extension} ×
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </section>
                  </>
                )}
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-4 max-w-3xl">
                <section className="rounded-xl border border-border/70 bg-card/80 p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-medium mb-3">
                    <Palette className="w-4 h-4 text-muted-foreground" />
                    {tr('settings.theme')}
                  </div>
                  <div className="space-y-2">
                    <select
                      className={controlClassName}
                      value={settings.theme}
                      onChange={(e) => updateSettings({ theme: e.target.value as typeof settings.theme })}
                    >
                      <option value="light">{tr('settings.theme.light')}</option>
                      <option value="dark">{tr('settings.theme.dark')}</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {tr('settings.themeDesc')}
                    </p>
                  </div>
                </section>

                <section className="rounded-xl border border-border/70 bg-card/80 p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-medium mb-3">
                    <Type className="w-4 h-4 text-muted-foreground" />
                    {settings.language === 'zh-CN' ? '排版' : 'Typography'}
                  </div>
                  <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">
                        {tr('settings.fontFamily')}
                      </label>
                      <input
                        className={controlClassName}
                        value={settings.fontFamily}
                        onChange={(e) => updateSettings({ fontFamily: e.target.value })}
                        placeholder='Consolas, "Courier New", monospace'
                      />
                      <p className="text-xs text-muted-foreground">
                        {tr('settings.fontFamilyDesc')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">
                        {tr('settings.fontSize')}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          className={cn(controlClassName, 'pr-10')}
                          value={settings.fontSize}
                          onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value) || 12 })}
                          min={8}
                          max={72}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                          px
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium leading-none">
                        {settings.language === 'zh-CN' ? '制表符宽度' : 'Tab Width'}
                      </label>
                      <div className="relative max-w-[220px]">
                        <input
                          type="number"
                          className={cn(controlClassName, 'pr-10')}
                          value={settings.tabWidth}
                          onChange={(e) => {
                            const value = Number.parseInt(e.target.value, 10);
                            updateSettings({ tabWidth: Number.isFinite(value) ? Math.min(8, Math.max(1, value)) : 4 });
                          }}
                          min={1}
                          max={8}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                          sp
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {settings.language === 'zh-CN' ? '用于工具栏格式化按钮的缩进宽度。' : 'Indent width used by toolbar beautify action.'}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-border/70 bg-card/80 p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-none">{currentLineLabel}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{currentLineDesc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSettings({ highlightCurrentLine: !settings.highlightCurrentLine })}
                      className={cn(
                        'relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border p-0.5 transition-all duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        settings.highlightCurrentLine
                          ? 'justify-end border-emerald-500/90 bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)] dark:border-emerald-400/90 dark:bg-emerald-500/85'
                          : 'justify-start border-zinc-400/80 bg-zinc-300/70 dark:border-zinc-500/90 dark:bg-zinc-700/80'
                      )}
                      aria-pressed={!!settings.highlightCurrentLine}
                      aria-label={currentLineLabel}
                    >
                      <span
                        className={cn(
                          'pointer-events-none absolute left-2 text-[9px] font-semibold tracking-[0.08em] transition-opacity',
                          settings.highlightCurrentLine
                            ? 'opacity-0 text-primary-foreground/80'
                            : 'opacity-90 text-zinc-700 dark:text-zinc-200'
                        )}
                      >
                        {switchOffText}
                      </span>
                      <span
                        className={cn(
                          'pointer-events-none absolute right-2 text-[9px] font-semibold tracking-[0.08em] transition-opacity',
                          settings.highlightCurrentLine
                            ? 'opacity-95 text-primary-foreground'
                            : 'opacity-0 text-zinc-700 dark:text-zinc-200'
                        )}
                      >
                        {switchOnText}
                      </span>
                      <span className="relative z-10 h-5 w-5 rounded-full border border-black/10 bg-white shadow-sm transition-transform dark:border-white/20" />
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          'pointer-events-none fixed bottom-6 right-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 shadow-lg transition-all dark:text-amber-200',
          showRestartToast ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
        )}
        role="status"
        aria-live="polite"
      >
        {singleInstanceModeRestartToast}
      </div>
    </div>
  );
}
