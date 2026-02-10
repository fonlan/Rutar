# Rutar

Rutar is a high-performance, lightweight code editor built with **Tauri**, **React 19**, and **Rust**. It leverages the power of **Tree-sitter** for accurate, IDE-grade syntax highlighting and **Ropey** for efficient large-scale text manipulation.

## 🚀 Key Features

- **Top-Grade Highlighting**: Syntax tokens are generated in the Rust backend using Tree-sitter, providing accurate and fast highlighting for JS, TS, Rust, Python, JSON, and more.
- **Outline Sidebar**: Supports structured file outlines for JSON / YAML / XML / TOML / INI and symbol outlines for Python / JavaScript / TypeScript / C / C++ / Go / Java / Rust / C# / PHP / Kotlin / Swift.
- **Virtualized Rendering**: Handles massive files with ease using `react-window` to ensure smooth scrolling regardless of file size.
- **Native Performance**: Built on Tauri for a small footprint and native-speed operations.
- **Modern Tech Stack**: React 19, Tailwind CSS 4, and Zustand on the frontend; Rust with `ropey` and `tree-sitter` on the backend.
- **Optimized for Windows**: Custom icons and window controls tailored for a native Windows experience.
- **Multi-language UI**: Supports Simplified Chinese / English and can switch in Settings.
- **Tab Path Tooltip**: Hovering a file tab shows the full file path, and the tooltip flips upward automatically when there is not enough space below.
- **Recent Quick Access**: The toolbar `Open File` and `Open Folder` actions include dropdown arrows for opening recently used files and folders.

## Configuration

- User configuration is saved to `%AppData%\Rutar\config.json`.
- Current fields include `language`, `fontFamily`, `fontSize`, `tabWidth`, `newFileLineEnding`, `wordWrap`, `showLineNumbers`, `recentFiles`, and `recentFolders`.
- `newFileLineEnding` controls the default line ending (`CRLF` / `LF` / `CR`) used when creating new empty files.
- `fontFamily` supports comma-separated fallback priority (for example `JetBrains Mono, Cascadia Code, Consolas, monospace`), and Settings provides preset dropdown selection plus priority reordering controls.

### Windows 11 Context Menu Integration

- **Classic context menu (Show more options)**: managed by registry keys under `HKCU\Software\Classes` and can be toggled directly in Settings.
- **File associations**: when enabled in Settings, Rutar writes per-user registry associations, registers itself in Windows `RegisteredApplications` for visibility in Default apps, and opens `ms-settings:defaultapps` so you can confirm/adjust defaults on Windows 11.

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
- `src-tauri/`: Rust backend, IPC commands, and state management.
- `src-tauri/src/commands/config.rs`: App config persistence, filter-group config, and Windows integration submodule.
- `src-tauri/src/commands/document.rs`: Document version and syntax-token generation submodule.
- `src-tauri/src/commands/file_io.rs`: File open/save/new operations and filesystem utility submodule.
- `src-tauri/src/commands/editing.rs`: Edit/undo-redo, document cleanup, and structured format commands submodule.
- `src-tauri/src/commands/formatting.rs`: Structured data formatting/minify helpers for JSON/YAML/XML/TOML.
- `src-tauri/src/commands/syntax.rs`: File extension and syntax-override language resolution plus parser creation.
- `src-tauri/src/commands/settings.rs`: App config types/defaults and normalization helpers (language/theme/tab width).
- `src-tauri/src/commands/types.rs`: Shared command data structures (`FileInfo`, `DirEntry`, `SyntaxToken`, etc.).
- `src-tauri/src/commands/text_utils.rs`: Shared text normalization helpers (for example line-ending normalization).
- `src-tauri/src/commands/constants.rs`: Shared backend constants for editor defaults and runtime limits.
- `src-tauri/src/commands/search_commands.rs`: Tauri command wrappers for search/filter operations.
- `src-tauri/src/commands/file_io_commands.rs`: Tauri command wrappers for document/file I/O operations.
- `src-tauri/src/commands/editing_commands.rs`: Tauri command wrappers for edit/undo/cleanup/format operations.
- `src-tauri/src/commands/search.rs`: Search / filter matching and step-navigation submodule.
- `src-tauri/src/commands/outline.rs`: Outline parsing and symbol extraction submodule.
- `AGENTS.md`: Detailed guidelines for AI coding agents working on this repository.

## 📄 License

MIT
