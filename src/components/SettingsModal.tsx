import { X, Type, Monitor } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export function SettingsModal() {
  const { settings, toggleSettings, updateSettings } = useStore();
  const [activeTab, setActiveTab] = useState<'general' | 'appearance'>('appearance');

  if (!settings.isOpen) return null;

  return (
    <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" 
        onClick={() => toggleSettings(false)}
        role="presentation"
    >
      <div 
        className="w-[600px] h-[400px] bg-background border rounded-lg shadow-lg flex overflow-hidden ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {/* Sidebar */}
        <div className="w-48 bg-muted/30 border-r p-2 flex flex-col gap-1">
          <div className="text-xs font-semibold text-muted-foreground px-2 py-2 mb-2">Settings</div>
          
          <button
            onClick={() => setActiveTab('general')}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left",
              activeTab === 'general' ? "bg-accent text-accent-foreground" : "hover:bg-muted"
            )}
          >
            <Monitor className="w-4 h-4" />
            General
          </button>
          
          <button
            onClick={() => setActiveTab('appearance')}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left",
              activeTab === 'appearance' ? "bg-accent text-accent-foreground" : "hover:bg-muted"
            )}
          >
            <Type className="w-4 h-4" />
            Appearance
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold">{activeTab === 'general' ? 'General' : 'Appearance'}</h2>
            <button 
                onClick={() => toggleSettings(false)}
                className="hover:bg-destructive/10 hover:text-destructive rounded-sm p-1"
            >
                <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'general' && (
              <div className="text-sm text-muted-foreground">
                General settings are currently empty.
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Font Family
                  </label>
                  <input
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={settings.fontFamily}
                    onChange={(e) => updateSettings({ fontFamily: e.target.value })}
                    placeholder='Consolas, "Courier New", monospace'
                  />
                  <p className="text-[0.8rem] text-muted-foreground">
                    The font family used in the editor.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Font Size
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      className="flex h-9 w-24 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      value={settings.fontSize}
                      onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value) || 12 })}
                      min={8}
                      max={72}
                    />
                    <span className="text-sm text-muted-foreground">px</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
