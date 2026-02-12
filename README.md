# Rutar

Rutar is a high-performance, lightweight code editor built with **Tauri**, **React 19**, and **Rust**. It leverages the power of **Tree-sitter** for accurate, IDE-grade syntax highlighting and **Ropey** for efficient large-scale text manipulation.

## 🚀 Key Features

- **Top-Grade Highlighting**: Syntax tokens are generated in the Rust backend using Tree-sitter, providing accurate and fast highlighting for JS, TS, Rust, Python, JSON, INI, and more.
- **Outline Sidebar**: Supports structured file outlines for JSON / YAML / XML / TOML / INI and symbol outlines for Python / JavaScript / TypeScript / C / C++ / Go / Java / Rust / C# / PHP / Kotlin / Swift. Includes a lightweight search box at the top for quickly filtering outline items.
- **Virtualized Rendering**: Handles massive files with ease using `react-window` to ensure smooth scrolling regardless of file size.
- **Native Performance**: Built on Tauri for a small footprint and native-speed operations.
- **Modern Tech Stack**: React 19, Tailwind CSS 4, and Zustand on the frontend; Rust with `ropey` and `tree-sitter` on the backend.
- **Optimized for Windows**: Custom icons and window controls tailored for a native Windows experience.
- **Multi-language UI**: Supports Simplified Chinese / English and can switch in Settings.
- **Tab Path Tooltip**: Hovering a file tab shows the full file path, and the tooltip flips upward automatically when there is not enough space below.
- **Recent Quick Access**: The toolbar `Open File` and `Open Folder` actions include dropdown arrows for opening recently used files and folders.
- **Cursor Position in Status Bar**: The status bar shows the active caret location as `line:column` and updates in real time while navigating or selecting in the editor.
- **Word Count (Word-style)**: The toolbar includes a word-count action that shows words, characters (with/without spaces), lines, and paragraphs; counting runs in Rust async blocking pool to avoid freezing the UI on large files.
- **External File Change Reminder**: When the app window regains focus, open files are checked for external modifications; if a file changed on disk, Rutar asks whether to reload it.
- **Text Drag Move in Editor**: You can drag selected text to a new caret position in the editor to move/insert it; file drag-and-drop opening remains supported.
- **Markdown Live Preview Panel**: The toolbar includes a preview toggle that opens a right-side Markdown preview panel with draggable width (default 50%); preview updates in real time, has no header, and shares editor vertical/horizontal scrolling behavior.

## Configuration

- User configuration is saved to `%AppData%\Rutar\config.json`.
- Current fields include `language`, `fontFamily`, `fontSize`, `tabWidth`, `newFileLineEnding`, `wordWrap`, `showLineNumbers`, `recentFiles`, `recentFolders`, `rememberWindowState`, `mouseGesturesEnabled`, `mouseGestures`, and `windowState`.
- `newFileLineEnding` controls the default line ending (`CRLF` / `LF` / `CR`) used when creating new empty files.
- `fontFamily` supports comma-separated fallback priority (for example `JetBrains Mono, Cascadia Code, Consolas, monospace`), and Settings provides preset dropdown selection plus priority reordering controls.
- `rememberWindowState` is enabled by default and controls whether window state persistence is active.
- `mouseGesturesEnabled` controls whether right-button drag mouse gestures are active in the editor area.
- `mouseGestures` stores gesture-action bindings, where `pattern` uses `L/R/U/D` sequence (for example `L`, `RD`, `UL`) and `action` maps to editor actions including tab switching, jump to top/bottom, close current/all/other tabs, quit app, and sidebar toggles.
- `windowState` persists main window state across launches: if the window was maximized, only `maximized: true` is stored; when not maximized, `width` and `height` are stored and restored on next startup.
- Main window startup uses hidden-first initialization (`visible: false` in `src-tauri/tauri.conf.json`), restores persisted window state first, and then lets frontend call `show_main_window_when_ready` after app shell render to reduce startup white-screen time and avoid visible size jump from default `800x600` to saved dimensions.
- Main window keeps `dragDropEnabled: true` in `src-tauri/tauri.conf.json` so Tauri native file drag-open remains stable on Windows; editor text drag-move is handled by frontend pointer-driven logic to avoid WebView HTML5 drag-drop inconsistencies.
- Frontend injects a lightweight startup splash (`boot-splash`) before React mount and removes it right after the main window reveal signal is sent, so users see loading feedback instead of a blank frame.

### Windows 11 Context Menu Integration

- **Classic context menu (Show more options)**: managed by registry keys under `HKCU\Software\Classes` and can be toggled directly in Settings.
- **File associations**: when enabled in Settings, Rutar writes per-user registry associations, registers itself in Windows `RegisteredApplications` for visibility in Default apps, and opens `ms-settings:defaultapps` so you can confirm/adjust defaults on Windows 11.
- **Single-instance file open behavior**: when single-instance mode is enabled, double-clicking an associated file (or using "Open with Rutar") reuses the existing window, opens a new tab, and wakes/restores the window to foreground.

## 🛠 Tech Stack

- **Backend**: Rust, Tauri v2, Tree-sitter, Ropey, DashMap, memmap2.
- **Frontend**: React 19, Vite, TypeScript, Zustand, Tailwind CSS 4, Lucide React.

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (Latest LTS)
- [Rust](https://www.rust-lang.org/) (Latest stable)

### Development

1.  **Install Dependencies**:
    ```bash
    npm install --legacy-peer-deps
    ```

2.  **Start Dev Server**:
    ```bash
    npm run tauri dev
    ```

### Build

To create a production build:
```bash
npm run tauri build
```

## 📂 Project Structure

- `src/`: Frontend React application.
- `src/components/MarkdownPreviewPanel.tsx`: Right-side live Markdown preview panel and scroll-follow behavior.
- `src/lib/markdown.ts`: Markdown file detection helper used by preview features.
- `src-tauri/`: Rust backend, IPC commands, and state management.
- `src-tauri/src/commands/config.rs`: App config persistence, filter-group config, and Windows integration submodule.
- `src-tauri/src/commands/document.rs`: Document version and syntax-token generation submodule.
- `src-tauri/src/commands/file_io.rs`: File open/save/new operations and filesystem utility submodule.
- `src-tauri/src/commands/editing.rs`: Edit/undo-redo, document cleanup, and structured format commands submodule.
- `src-tauri/src/commands/formatting.rs`: Structured data formatting/minify helpers for JSON/YAML/XML/HTML/TOML.
- `src-tauri/src/commands/syntax.rs`: File extension and syntax-override language resolution plus parser creation.
- `src-tauri/src/commands/settings.rs`: App config types/defaults and normalization helpers (language/theme/tab width).
- `src-tauri/src/commands/types.rs`: Shared command data structures (`FileInfo`, `DirEntry`, `SyntaxToken`, etc.).
- `src-tauri/src/commands/text_utils.rs`: Shared text normalization helpers (for example line-ending normalization).
- `src-tauri/src/commands/constants.rs`: Shared backend constants for editor defaults and runtime limits.
- `src-tauri/src/commands/search_commands.rs`: Tauri command wrappers for search/filter operations.
- `src-tauri/src/commands/file_io_commands.rs`: Tauri command wrappers for document/file I/O operations.
- `src-tauri/src/commands/file_io.rs`: Includes async word-count computation (`get_word_count_info`) with chunk iteration over `Rope` to keep large-file interactions responsive.
- `src-tauri/src/commands/editing_commands.rs`: Tauri command wrappers for edit/undo/history/cleanup/format operations.
- `src-tauri/src/commands/search.rs`: Search / filter matching and step-navigation submodule.
- `src-tauri/src/commands/outline.rs`: Outline parsing and symbol extraction submodule.
- `AGENTS.md`: Detailed guidelines for AI coding agents working on this repository.

## Toolbar Button Availability

- Toolbar action states are dynamically derived from current editor context.
- `Save` is enabled only when the active document has unsaved changes.
- `Save All` is enabled only when at least one tab has unsaved changes.
- `Cut` and `Copy` are enabled only when text is selected in the active editor.
- `Undo` / `Redo` are enabled only when corresponding history entries exist.
- Unsaved-change state is anchored to the saved undo checkpoint (undo depth + top operation id), so undoing back to the saved snapshot automatically clears the dirty indicator.

## 📄 License

MIT
