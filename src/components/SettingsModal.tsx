import { X, Type, Monitor, Palette, Languages, SquareTerminal, FileText, Info } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import rutarDocumentLogo from '../../rutar_document.svg';

const LINE_ENDING_OPTIONS = [
  { value: 'CRLF', label: 'Win (CRLF)' },
  { value: 'LF', label: 'Linux (LF)' },
  { value: 'CR', label: 'Mac (CR)' },
] as const;

const DEFAULT_FONT_FAMILY = 'Consolas, "Courier New", monospace';
const MAX_FONT_SUGGESTIONS = 200;

const FALLBACK_FONT_FAMILIES = [
  'Segoe UI',
  'Arial',
  'Calibri',
  'Times New Roman',
  'Verdana',
  'Georgia',
  'Microsoft YaHei',
  'PingFang SC',
  'Helvetica',
  'JetBrains Mono',
  'Cascadia Code',
  'Consolas',
  'Fira Code',
  'Source Code Pro',
  'Menlo',
  'Monaco',
  'Noto Sans Mono',
  'Courier New',
  'monospace',
] as const;

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

function normalizeFontFamilyName(value: string): string {
  return value
    .trim()
    .replace(/^['\"]+|['\"]+$/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeFontFamilyOptions(values: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of values) {
    const fontName = normalizeFontFamilyName(rawValue);
    if (!fontName) {
      continue;
    }

    const key = fontName.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(fontName);
  }

  normalized.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  return normalized;
}

function parseFontFamilyList(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawPart of value.split(',')) {
    const normalized = normalizeFontFamilyName(rawPart);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function serializeFontFamilyList(value: string[]): string {
  const uniqueValues: string[] = [];
  const seen = new Set<string>();

  for (const rawPart of value) {
    const normalized = normalizeFontFamilyName(rawPart);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueValues.push(normalized);
  }

  return uniqueValues.length > 0 ? uniqueValues.join(', ') : DEFAULT_FONT_FAMILY;
}

export function SettingsModal() {
  const settings = useStore((state) => state.settings);
  const toggleSettings = useStore((state) => state.toggleSettings);
  const updateSettings = useStore((state) => state.updateSettings);
  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'about'>('appearance');
  const [defaultExtensions, setDefaultExtensions] = useState<string[]>(FALLBACK_WINDOWS_FILE_ASSOCIATION_EXTENSIONS);
  const [customExtensionInput, setCustomExtensionInput] = useState('');
  const [systemFontFamilies, setSystemFontFamilies] = useState<string[]>(
    normalizeFontFamilyOptions(FALLBACK_FONT_FAMILIES),
  );
  const [fontPickerInput, setFontPickerInput] = useState('');
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);
  const [activeFontSuggestionIndex, setActiveFontSuggestionIndex] = useState(-1);
  const [isUpdatingFileAssociations, setIsUpdatingFileAssociations] = useState(false);
  const [showRestartToast, setShowRestartToast] = useState(false);
  const restartToastTimerRef = useRef<number | null>(null);
  const fontPickerContainerRef = useRef<HTMLDivElement | null>(null);
  const fontDropdownListRef = useRef<HTMLDivElement | null>(null);
  const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);
  const currentLineLabel = tr('settings.highlightCurrentLine');
  const currentLineDesc = tr('settings.highlightCurrentLineDesc');
  const doubleClickCloseTabLabel = tr('settings.doubleClickCloseTab');
  const doubleClickCloseTabDesc = tr('settings.doubleClickCloseTabDesc');
  const wordWrapDesc = tr('settings.wordWrapDesc');
  const appearanceTabDesc = tr('settings.appearanceTabDesc');
  const generalTabDesc = tr('settings.generalTabDesc');
  const aboutTabTitle = tr('settings.about');
  const aboutTabDesc = tr('settings.aboutDesc');
  const aboutPanelDesc = tr('settings.aboutPanelDesc');
  const projectHomeLabel = tr('settings.about.projectUrl');
  const projectHomeOpenLabel = tr('settings.about.openLink');
  const projectHomeValue = 'https://github.com/fonlan/Rutar';
  const aboutSummary = tr('settings.about.summary');

  const controlClassName =
    'flex h-10 w-full rounded-lg border border-input bg-background/70 text-foreground px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50';
  const actionButtonClassName =
    'inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-input bg-background/70 px-3 text-sm shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50';
  const sortButtonClassName =
    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-input bg-background/70 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-40';
  const switchOnText = tr('settings.switchOn');
  const switchOffText = tr('settings.switchOff');
  const isWindows = typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent);

  const windowsContextLabel = tr('settings.windowsContextMenu');
  const windowsContextDesc = tr('settings.windowsContextMenuDesc');
  const windowsFileAssociationLabel = tr('settings.windowsFileAssociations');
  const windowsFileAssociationDesc = tr('settings.windowsFileAssociationsDesc');
  const windowsFileAssociationHint = tr('settings.windowsFileAssociationsHint');
  const addExtensionButtonLabel = tr('settings.add');
  const fontPickerPlaceholder = tr('settings.fontPickerPlaceholder');
  const fontMoveUpLabel = tr('settings.fontMoveUp');
  const fontMoveDownLabel = tr('settings.fontMoveDown');
  const fontRemoveLabel = tr('settings.fontRemove');
  const singleInstanceModeLabel = tr('settings.singleInstanceMode');
  const singleInstanceModeDesc = tr('settings.singleInstanceModeDesc');
  const singleInstanceModeRestartToast = tr('settings.singleInstanceModeRestartToast');

  const handleOpenProjectHome = async () => {
    try {
      await openUrl(projectHomeValue);
    } catch (error) {
      console.error('Failed to open project URL:', error);
    }
  };

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
  const fontPriorityList = useMemo(() => parseFontFamilyList(settings.fontFamily), [settings.fontFamily]);
  const availableSystemFontFamilies = useMemo(() => {
    const selectedFonts = new Set(fontPriorityList.map((font) => font.toLowerCase()));
    return systemFontFamilies.filter((fontName) => !selectedFonts.has(fontName.toLowerCase()));
  }, [fontPriorityList, systemFontFamilies]);
  const filteredFontSuggestions = useMemo(() => {
    const keyword = normalizeFontFamilyName(fontPickerInput).toLowerCase();
    if (!keyword) {
      return availableSystemFontFamilies.slice(0, MAX_FONT_SUGGESTIONS);
    }

    const prefixMatches = availableSystemFontFamilies.filter((fontName) =>
      fontName.toLowerCase().startsWith(keyword),
    );

    const containsMatches = availableSystemFontFamilies.filter((fontName) => {
      const lowerCaseName = fontName.toLowerCase();
      return lowerCaseName.includes(keyword) && !lowerCaseName.startsWith(keyword);
    });

    return [...prefixMatches, ...containsMatches].slice(0, MAX_FONT_SUGGESTIONS);
  }, [availableSystemFontFamilies, fontPickerInput]);

  useEffect(() => {
    if (!isFontDropdownOpen || filteredFontSuggestions.length === 0) {
      setActiveFontSuggestionIndex(-1);
      return;
    }

    if (activeFontSuggestionIndex >= filteredFontSuggestions.length) {
      setActiveFontSuggestionIndex(0);
      return;
    }

    if (activeFontSuggestionIndex === -1) {
      setActiveFontSuggestionIndex(0);
    }
  }, [activeFontSuggestionIndex, filteredFontSuggestions, isFontDropdownOpen]);

  useEffect(() => {
    if (!isFontDropdownOpen || activeFontSuggestionIndex < 0) {
      return;
    }

    const activeElement = fontDropdownListRef.current?.querySelector<HTMLButtonElement>(
      `[data-font-index="${activeFontSuggestionIndex}"]`,
    );
    activeElement?.scrollIntoView({ block: 'nearest' });
  }, [activeFontSuggestionIndex, filteredFontSuggestions, isFontDropdownOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadSystemFonts = async () => {
      try {
        const fonts = await invoke<string[]>('list_system_fonts');
        if (cancelled) {
          return;
        }

        const normalizedFonts = normalizeFontFamilyOptions([...fonts, ...FALLBACK_FONT_FAMILIES]);
        if (normalizedFonts.length === 0) {
          return;
        }

        setSystemFontFamilies(normalizedFonts);
      } catch (error) {
        console.error('Failed to load system fonts:', error);
      }
    };

    void loadSystemFonts();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateFontPriorityList = (nextList: string[]) => {
    updateSettings({
      fontFamily: serializeFontFamilyList(nextList),
    });
  };

  const addFontToPriorityList = (fontName: string) => {
    const normalizedFontName = normalizeFontFamilyName(fontName);
    if (!normalizedFontName) {
      return;
    }

    const nextList = [
      normalizedFontName,
      ...fontPriorityList.filter((font) => font.toLowerCase() !== normalizedFontName.toLowerCase()),
    ];

    updateFontPriorityList(nextList);
  };

  const handleAddFontFromPicker = () => {
    const normalizedFontName = normalizeFontFamilyName(fontPickerInput);
    if (!normalizedFontName) {
      return;
    }

    addFontToPriorityList(normalizedFontName);
    setFontPickerInput('');
    setIsFontDropdownOpen(false);
    setActiveFontSuggestionIndex(-1);
  };

  const handleSelectFontSuggestion = (fontName: string) => {
    addFontToPriorityList(fontName);
    setFontPickerInput('');
    setIsFontDropdownOpen(false);
    setActiveFontSuggestionIndex(-1);
  };

  const handleMoveFont = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= fontPriorityList.length) {
      return;
    }

    const nextList = [...fontPriorityList];
    const [movedFont] = nextList.splice(index, 1);
    nextList.splice(targetIndex, 0, movedFont);
    updateFontPriorityList(nextList);
  };

  const handleRemoveFont = (fontName: string) => {
    const normalizedFontName = normalizeFontFamilyName(fontName);
    const nextList = fontPriorityList.filter((font) => font.toLowerCase() !== normalizedFontName.toLowerCase());
    updateFontPriorityList(nextList);
  };

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
          openSettingsPage: true,
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
              {tr('settings.editorPrefsDesc')}
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

          <button
            onClick={() => setActiveTab('about')}
            className={cn(
              'flex items-start gap-3 px-3 py-3 rounded-lg text-left transition-colors border',
              activeTab === 'about'
                ? 'bg-accent/70 text-accent-foreground border-accent-foreground/10 shadow-sm'
                : 'hover:bg-muted/70 border-transparent'
            )}
          >
            <Info className="w-4 h-4 mt-0.5" />
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight">{aboutTabTitle}</span>
              <span className="block text-xs text-muted-foreground mt-1">{aboutTabDesc}</span>
            </span>
          </button>
        </div>

        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b bg-background/70">
            <div>
              <h2 className="font-semibold text-base">
                {activeTab === 'general' ? tr('settings.general') : activeTab === 'appearance' ? tr('settings.appearance') : aboutTabTitle}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeTab === 'about' ? aboutPanelDesc : activeTab === 'general' ? tr('settings.generalPanelDesc') : tr('settings.appearancePanelDesc')}
              </p>
            </div>
            <button 
                onClick={() => toggleSettings(false)}
                className="hover:bg-destructive/10 hover:text-destructive rounded-md p-1.5 transition-colors"
                aria-label={tr('settings.close')}
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
                  <div className="flex items-center gap-2 text-sm font-medium mb-3">
                    <Type className="w-4 h-4 text-muted-foreground" />
                    {tr('settings.newFileLineEnding')}
                  </div>
                  <div className="space-y-2">
                    <select
                      className={controlClassName}
                      value={settings.newFileLineEnding}
                      onChange={(event) => {
                        updateSettings({
                          newFileLineEnding: event.target.value as typeof settings.newFileLineEnding,
                        });
                      }}
                    >
                      {LINE_ENDING_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {tr('settings.newFileLineEndingDesc')}
                    </p>
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
                            placeholder={tr('settings.customExtensionPlaceholder')}
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
                    {tr('settings.typography')}
                  </div>
                  <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">
                        {tr('settings.fontFamily')}
                      </label>
                      <div className="flex gap-2">
                        <div
                          className="relative flex-1"
                          ref={fontPickerContainerRef}
                          onFocus={() => {
                            setIsFontDropdownOpen(true);
                            setActiveFontSuggestionIndex(filteredFontSuggestions.length > 0 ? 0 : -1);
                          }}
                          onBlur={(event) => {
                            const nextFocusedElement = event.relatedTarget as Node | null;
                            if (!event.currentTarget.contains(nextFocusedElement)) {
                              setIsFontDropdownOpen(false);
                              setActiveFontSuggestionIndex(-1);
                            }
                          }}
                        >
                          <input
                            className={controlClassName}
                            value={fontPickerInput}
                            onChange={(e) => {
                              setFontPickerInput(e.target.value);
                              setIsFontDropdownOpen(true);
                              setActiveFontSuggestionIndex(0);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowDown') {
                                event.preventDefault();
                                if (!isFontDropdownOpen) {
                                  setIsFontDropdownOpen(true);
                                }

                                if (filteredFontSuggestions.length === 0) {
                                  return;
                                }

                                setActiveFontSuggestionIndex((currentIndex) => {
                                  if (currentIndex < 0) {
                                    return 0;
                                  }

                                  return Math.min(currentIndex + 1, filteredFontSuggestions.length - 1);
                                });
                                return;
                              }

                              if (event.key === 'ArrowUp') {
                                event.preventDefault();
                                if (!isFontDropdownOpen) {
                                  setIsFontDropdownOpen(true);
                                }

                                if (filteredFontSuggestions.length === 0) {
                                  return;
                                }

                                setActiveFontSuggestionIndex((currentIndex) => {
                                  if (currentIndex < 0) {
                                    return 0;
                                  }

                                  return Math.max(currentIndex - 1, 0);
                                });
                                return;
                              }

                              if (event.key === 'Enter') {
                                event.preventDefault();

                                if (
                                  isFontDropdownOpen
                                  && activeFontSuggestionIndex >= 0
                                  && activeFontSuggestionIndex < filteredFontSuggestions.length
                                ) {
                                  handleSelectFontSuggestion(filteredFontSuggestions[activeFontSuggestionIndex]);
                                  return;
                                }

                                handleAddFontFromPicker();
                              }

                              if (event.key === 'Escape') {
                                event.preventDefault();
                                setIsFontDropdownOpen(false);
                                setActiveFontSuggestionIndex(-1);
                              }
                            }}
                            placeholder={fontPickerPlaceholder}
                          />

                          {isFontDropdownOpen && filteredFontSuggestions.length > 0 && (
                            <div
                              ref={fontDropdownListRef}
                              className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
                            >
                              {filteredFontSuggestions.map((fontName, index) => (
                                <button
                                  key={fontName.toLowerCase()}
                                  data-font-index={index}
                                  type="button"
                                  className={cn(
                                    'flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                                    index === activeFontSuggestionIndex ? 'bg-muted' : '',
                                  )}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                  }}
                                  onMouseEnter={() => setActiveFontSuggestionIndex(index)}
                                  onClick={() => handleSelectFontSuggestion(fontName)}
                                >
                                  {fontName}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          className={actionButtonClassName}
                          onClick={handleAddFontFromPicker}
                          disabled={!fontPickerInput.trim()}
                        >
                          {addExtensionButtonLabel}
                        </button>
                      </div>

                      <div className="space-y-2 rounded-lg border border-border/70 bg-background/60 p-2">
                        {fontPriorityList.map((fontName, index) => (
                          <div
                            key={fontName.toLowerCase()}
                            className="flex items-center gap-2 rounded-md border border-border/70 bg-background/70 px-2 py-1.5"
                          >
                            <span className="w-5 text-center text-xs text-muted-foreground">{index + 1}</span>
                            <span className="min-w-0 flex-1 truncate text-sm">{fontName}</span>
                            <button
                              type="button"
                              className={sortButtonClassName}
                              onClick={() => handleMoveFont(index, -1)}
                              disabled={index === 0}
                              aria-label={fontMoveUpLabel}
                              title={fontMoveUpLabel}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className={sortButtonClassName}
                              onClick={() => handleMoveFont(index, 1)}
                              disabled={index === fontPriorityList.length - 1}
                              aria-label={fontMoveDownLabel}
                              title={fontMoveDownLabel}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className={sortButtonClassName}
                              onClick={() => handleRemoveFont(fontName)}
                              aria-label={fontRemoveLabel}
                              title={fontRemoveLabel}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>

                      <code className="block truncate rounded-md border border-border/70 bg-background/60 px-2 py-1 text-xs text-muted-foreground">
                        {settings.fontFamily || DEFAULT_FONT_FAMILY}
                      </code>
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
                        {tr('settings.tabWidth')}
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
                        {tr('settings.tabWidthDesc')}
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

            {activeTab === 'about' && (
              <div className="max-w-3xl">
                <section className="rounded-xl border border-border/70 bg-card/80 p-6 shadow-sm">
                  <div className="flex flex-col items-center text-center">
                    <div className="group relative">
                      <div className="pointer-events-none absolute -inset-3 rounded-3xl bg-primary/10 opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100" />
                      <img
                        src={rutarDocumentLogo}
                        alt="Rutar logo"
                        className="relative h-28 w-28 rounded-2xl border border-border/70 bg-background/85 p-3 shadow-sm transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:rotate-[2deg] group-hover:scale-105 group-hover:shadow-lg"
                      />
                    </div>

                    <div className="mt-5 max-w-2xl">
                      <h3 className="text-xl font-semibold tracking-tight">Rutar</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{aboutSummary}</p>
                    </div>

                    <div className="mt-7 w-full max-w-xl rounded-lg border border-border/70 bg-background/70 p-4 text-left">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {projectHomeLabel}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <code className="max-w-full truncate rounded-md border border-border bg-muted/50 px-2 py-1 text-xs">
                          {projectHomeValue}
                        </code>
                        <button
                          type="button"
                          onClick={() => void handleOpenProjectHome()}
                          className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-muted"
                        >
                          {projectHomeOpenLabel}
                        </button>
                      </div>
                    </div>
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
