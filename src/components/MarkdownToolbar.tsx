import { invoke } from '@tauri-apps/api/core';
import { message, open } from '@tauri-apps/plugin-dialog';
import {
  Binary,
  Bold,
  ChevronDown,
  Code,
  FileCode,
  FileImage,
  Globe,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  ListTodo,
  Minus,
  PaintBucket,
  Palette,
  Pilcrow,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  TextQuote,
  Underline,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { t } from '@/i18n';
import { isMarkdownTab } from '@/lib/markdown';
import { nativePathToFileUrl } from '@/lib/markdownPaths';
import { dispatchMarkdownToolbarAction, type MarkdownHeadingLevel } from '@/lib/markdownToolbar';
import { cn } from '@/lib/utils';
import { isDiffTab, useStore } from '@/store/useStore';

const DEFAULT_TEXT_COLOR = '#1f2937';
const DEFAULT_BACKGROUND_COLOR = '#fff7a8';
const TOOLBAR_ICON_CLASS_NAME = 'h-4 w-4';

function pathBaseName(path: string) {
  const normalizedPath = path.trim().replace(/[\\/]+$/, '');
  const separatorIndex = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));
  return separatorIndex >= 0 ? normalizedPath.slice(separatorIndex + 1) || normalizedPath : normalizedPath;
}

function fileAltText(path: string) {
  const baseName = pathBaseName(path);
  const suffixIndex = baseName.lastIndexOf('.');
  if (suffixIndex <= 0) {
    return baseName || 'image';
  }
  return baseName.slice(0, suffixIndex) || baseName;
}

function renderToolbarIcon(icon: ReactNode) {
  return <span className="pointer-events-none inline-flex items-center justify-center">{icon}</span>;
}

export function MarkdownToolbar() {
  const tabs = useStore((state) => state.tabs);
  const activeTabId = useStore((state) => state.activeTabId);
  const language = useStore((state) => state.settings.language);
  const activeRootTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeTab = activeRootTab && !isDiffTab(activeRootTab) ? activeRootTab : null;
  const tr = (key: Parameters<typeof t>[1]) => t(language, key);
  const [textColor, setTextColor] = useState(DEFAULT_TEXT_COLOR);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND_COLOR);
  const markdownEnabled = !!activeTab && isMarkdownTab(activeTab);

  const dispatchAction = useCallback(
    (action: Parameters<typeof dispatchMarkdownToolbarAction>[1]) => {
      if (!activeTab) {
        return;
      }
      dispatchMarkdownToolbarAction(activeTab.id, action);
    },
    [activeTab],
  );

  const handleImageFileInsert = useCallback(
    async (mode: 'file' | 'base64') => {
      if (!activeTab) {
        return;
      }
      try {
        const selected = await open({
          multiple: false,
          directory: false,
        });
        if (!selected || typeof selected !== 'string') {
          return;
        }
        if (mode === 'file') {
          const fileUrl = nativePathToFileUrl(selected);
          if (!fileUrl) {
            throw new Error('Failed to convert image path to file URL');
          }
          dispatchAction({
            type: 'insert_image_file',
            src: fileUrl,
            alt: fileAltText(selected),
          });
          return;
        }
        const dataUrl = await invoke<string>('encode_image_file_as_data_url', {
          path: selected,
        });
        dispatchAction({
          type: 'insert_image_base64',
          src: dataUrl,
          alt: fileAltText(selected),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const prefix =
          mode === 'base64'
            ? tr('markdownToolbar.image.base64Failed')
            : tr('markdownToolbar.image.insertFailed');
        await message(`${prefix} ${errorMessage}`, {
          title: tr('markdownToolbar.image'),
          kind: 'warning',
        });
      }
    },
    [activeTab, dispatchAction, tr],
  );

  const headingItems = useMemo<
    Array<{ key: MarkdownHeadingLevel; label: string; icon: ReactNode }>
  >(
    () => [
      {
        key: 'body',
        label: tr('markdownToolbar.heading.body'),
        icon: <Pilcrow className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />,
      },
      {
        key: 'h1',
        label: tr('markdownToolbar.heading.h1'),
        icon: <Heading1 className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />,
      },
      {
        key: 'h2',
        label: tr('markdownToolbar.heading.h2'),
        icon: <Heading2 className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />,
      },
      {
        key: 'h3',
        label: tr('markdownToolbar.heading.h3'),
        icon: <Heading3 className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />,
      },
      {
        key: 'h4',
        label: tr('markdownToolbar.heading.h4'),
        icon: <Heading4 className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />,
      },
      {
        key: 'h5',
        label: tr('markdownToolbar.heading.h5'),
        icon: <Heading5 className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />,
      },
      {
        key: 'h6',
        label: tr('markdownToolbar.heading.h6'),
        icon: <Heading6 className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />,
      },
    ],
    [tr],
  );

  const handleToolbarContextMenuCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  if (!markdownEnabled) {
    return null;
  }

  return (
    <div
      className="flex min-h-10 items-center gap-1 overflow-x-auto overflow-y-hidden border-b bg-background px-2 py-1 no-scrollbar z-40"
      data-layout-region="toolbar"
      onContextMenuCapture={handleToolbarContextMenuCapture}
    >
      <MarkdownToolbarMenuButton
        icon={<Heading1 className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.heading')}
        items={headingItems.map((item) => ({
          key: item.key,
          label: item.label,
          icon: item.icon,
          onClick: () => {
            dispatchAction({ type: 'set_heading', level: item.key });
          },
        }))}
      />
      <div className="h-4 w-[1px] bg-border" />
      <MarkdownToolbarButton
        icon={<ListOrdered className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.orderedList')}
        onClick={() => {
          dispatchAction({ type: 'toggle_ordered_list' });
        }}
      />
      <MarkdownToolbarButton
        icon={<List className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.unorderedList')}
        onClick={() => {
          dispatchAction({ type: 'toggle_unordered_list' });
        }}
      />
      <MarkdownToolbarButton
        icon={<ListTodo className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.taskList')}
        onClick={() => {
          dispatchAction({ type: 'toggle_task_list' });
        }}
      />
      <MarkdownToolbarButton
        icon={<TextQuote className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.blockquote')}
        onClick={() => {
          dispatchAction({ type: 'toggle_quote' });
        }}
      />
      <MarkdownToolbarButton
        icon={<ListIndentIncrease className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.indent')}
        onClick={() => {
          dispatchAction({ type: 'indent' });
        }}
      />
      <MarkdownToolbarButton
        icon={<ListIndentDecrease className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.outdent')}
        onClick={() => {
          dispatchAction({ type: 'outdent' });
        }}
      />
      <MarkdownToolbarButton
        icon={<FileCode className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.codeBlock')}
        onClick={() => {
          dispatchAction({ type: 'insert_code_block' });
        }}
      />
      <MarkdownToolbarButton
        icon={<Table className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.table')}
        onClick={() => {
          dispatchAction({ type: 'insert_table' });
        }}
      />
      <MarkdownToolbarButton
        icon={<Minus className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.horizontalRule')}
        onClick={() => {
          dispatchAction({ type: 'insert_horizontal_rule' });
        }}
      />
      <div className="h-4 w-[1px] bg-border" />
      <MarkdownToolbarButton
        icon={<Bold className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.bold')}
        onClick={() => {
          dispatchAction({ type: 'toggle_bold' });
        }}
      />
      <MarkdownToolbarButton
        icon={<Italic className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.italic')}
        onClick={() => {
          dispatchAction({ type: 'toggle_italic' });
        }}
      />
      <MarkdownToolbarButton
        icon={<Underline className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.underline')}
        onClick={() => {
          dispatchAction({ type: 'toggle_underline' });
        }}
      />
      <MarkdownToolbarButton
        icon={<Strikethrough className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.strikethrough')}
        onClick={() => {
          dispatchAction({ type: 'toggle_strikethrough' });
        }}
      />
      <MarkdownToolbarButton
        icon={<Superscript className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.superscript')}
        onClick={() => {
          dispatchAction({ type: 'toggle_superscript' });
        }}
      />
      <MarkdownToolbarButton
        icon={<Subscript className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.subscript')}
        onClick={() => {
          dispatchAction({ type: 'toggle_subscript' });
        }}
      />
      <MarkdownToolbarButton
        icon={<Code className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.inlineCode')}
        onClick={() => {
          dispatchAction({ type: 'toggle_inline_code' });
        }}
      />
      <MarkdownToolbarColorInput
        icon={<Palette className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.textColor')}
        value={textColor}
        onChange={(nextColor) => {
          setTextColor(nextColor);
          dispatchAction({ type: 'apply_text_color', color: nextColor });
        }}
      />
      <MarkdownToolbarColorInput
        icon={<PaintBucket className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.backgroundColor')}
        value={backgroundColor}
        onChange={(nextColor) => {
          setBackgroundColor(nextColor);
          dispatchAction({ type: 'apply_background_color', color: nextColor });
        }}
      />
      <div className="h-4 w-[1px] bg-border" />
      <MarkdownToolbarButton
        icon={<Link2 className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.link')}
        onClick={() => {
          dispatchAction({ type: 'insert_link' });
        }}
      />
      <MarkdownToolbarMenuButton
        icon={<ImagePlus className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />}
        title={tr('markdownToolbar.image')}
        items={[
          {
            key: 'url',
            label: tr('markdownToolbar.image.url'),
            icon: <Globe className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />,
            onClick: () => {
              dispatchAction({ type: 'insert_image_url' });
            },
          },
          {
            key: 'file',
            label: tr('markdownToolbar.image.file'),
            icon: <FileImage className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />,
            onClick: () => {
              void handleImageFileInsert('file');
            },
          },
          {
            key: 'base64',
            label: tr('markdownToolbar.image.base64'),
            icon: <Binary className={TOOLBAR_ICON_CLASS_NAME} aria-hidden="true" />,
            onClick: () => {
              void handleImageFileInsert('base64');
            },
          },
        ]}
      />
    </div>
  );
}

function MarkdownToolbarButton({
  icon,
  title,
  onClick,
  className,
}: {
  icon: ReactNode;
  title: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <span title={title} className="inline-flex flex-shrink-0">
      <button
        type="button"
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          className,
        )}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={onClick}
        aria-label={title}
      >
        {renderToolbarIcon(icon)}
      </button>
    </span>
  );
}

function MarkdownToolbarColorInput({
  icon,
  title,
  value,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  onChange: (nextColor: string) => void;
}) {
  return (
    <label
      title={title}
      className="inline-flex h-8 flex-shrink-0 items-center gap-1 rounded-md px-2 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {renderToolbarIcon(icon)}
      <input
        type="color"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="h-4 w-4 cursor-pointer rounded border border-border bg-transparent p-0"
        aria-label={title}
      />
    </label>
  );
}

function MarkdownToolbarMenuButton({
  icon,
  title,
  items,
}: {
  icon: ReactNode;
  title: string;
  items: Array<{ key: string; label: string; icon?: ReactNode; onClick: () => void }>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({
    position: 'fixed',
    left: 0,
    top: 0,
    minWidth: 160,
    visibility: 'hidden',
  });

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || !rootRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    const handleBlur = () => {
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleEscape, true);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleEscape, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuStyle((previous) =>
        previous.visibility === 'hidden'
          ? previous
          : {
              ...previous,
              visibility: 'hidden',
            },
      );
      return;
    }
    const updateMenuPosition = () => {
      const rootElement = rootRef.current;
      if (!rootElement) {
        return;
      }
      const rect = rootElement.getBoundingClientRect();
      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        top: rect.bottom + 4,
        minWidth: Math.max(176, rect.width),
        visibility: 'visible',
      });
    };
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [menuOpen]);

  return (
    <div ref={rootRef} className="relative flex flex-shrink-0 items-center">
      <button
        type="button"
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-l-md border-r border-transparent text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          menuOpen && 'bg-accent text-accent-foreground',
        )}
        title={title}
        aria-label={title}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          setMenuOpen((previous) => !previous);
        }}
      >
        {renderToolbarIcon(icon)}
      </button>
      <button
        type="button"
        className={cn(
          '-ml-px inline-flex h-8 w-6 items-center justify-center rounded-r-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          menuOpen && 'bg-accent text-accent-foreground',
        )}
        title={title}
        aria-label={title}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          setMenuOpen((previous) => !previous);
        }}
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {menuOpen ? (
        <div style={menuStyle} className="z-50 rounded-md border border-border bg-popover p-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                setMenuOpen(false);
                item.onClick();
              }}
            >
              {item.icon ? renderToolbarIcon(item.icon) : null}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
