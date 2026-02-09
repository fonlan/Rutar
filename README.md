# Rutar

Rutar is a high-performance, lightweight code editor built with **Tauri**, **React 19**, and **Rust**. It leverages the power of **Tree-sitter** for accurate, IDE-grade syntax highlighting and **Ropey** for efficient large-scale text manipulation.

## 🚀 Key Features

- **Top-Grade Highlighting**: Syntax tokens are generated in the Rust backend using Tree-sitter, providing accurate and fast highlighting for JS, TS, Rust, Python, JSON, and more.
- **Virtualized Rendering**: Handles massive files with ease using `react-window` to ensure smooth scrolling regardless of file size.
- **Native Performance**: Built on Tauri for a small footprint and native-speed operations.
- **Modern Tech Stack**: React 19, Tailwind CSS 4, and Zustand on the frontend; Rust with `ropey` and `tree-sitter` on the backend.
- **Optimized for Windows**: Custom icons and window controls tailored for a native Windows experience.
- **Multi-language UI**: Supports Simplified Chinese / English and can switch in Settings.
- **Tab Path Tooltip**: Hovering a file tab shows the full file path, and the tooltip flips upward automatically when there is not enough space below.
- **Recent Quick Access**: The toolbar `Open File` and `Open Folder` actions include dropdown arrows for opening recently used files and folders.

## Configuration

- User configuration is saved to `%AppData%\Rutar\config.json`.
- Current fields include `language`, `fontFamily`, `fontSize`, `wordWrap`, `recentFiles`, and `recentFolders`.

### Windows 11 Context Menu Integration

- **Classic context menu (Show more options)**: managed by registry keys under `HKCU\Software\Classes` and can be toggled directly in Settings.

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
- `AGENTS.md`: Detailed guidelines for AI coding agents working on this repository.

## 📄 License

MIT
