import { X, Type, Monitor, Palette, Languages } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { t } from '@/i18n';

export function SettingsModal() {
  const settings = useStore((state) => state.settings);
  const toggleSettings = useStore((state) => state.toggleSettings);
  const updateSettings = useStore((state) => state.updateSettings);
  const [activeTab, setActiveTab] = useState<'general' | 'appearance'>('appearance');
  const tr = (key: Parameters<typeof t>[1]) => t(settings.language, key);
  const currentLineLabel = settings.language === 'zh-CN' ? '高亮当前行' : 'Highlight Current Line';
  const currentLineDesc =
    settings.language === 'zh-CN'
      ? '在编辑器中突出显示光标所在行。'
      : 'Highlight the line where the caret is currently placed.';
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
                      <p className="text-sm font-medium leading-none">{tr('toolbar.toggleWordWrap')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{wordWrapDesc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSettings({ wordWrap: !settings.wordWrap })}
                      className={cn(
                        'h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors flex items-center overflow-hidden',
                        settings.wordWrap ? 'bg-primary justify-end' : 'bg-muted-foreground/30 justify-start'
                      )}
                      aria-pressed={!!settings.wordWrap}
                      aria-label={tr('toolbar.toggleWordWrap')}
                    >
                      <span className="h-5 w-5 rounded-full bg-white shadow" />
                    </button>
                  </div>
                </section>
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
                        'h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors flex items-center overflow-hidden',
                        settings.highlightCurrentLine
                          ? 'bg-primary justify-end'
                          : 'bg-muted-foreground/30 justify-start'
                      )}
                      aria-pressed={!!settings.highlightCurrentLine}
                      aria-label={currentLineLabel}
                    >
                      <span className="h-5 w-5 rounded-full bg-white shadow" />
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
