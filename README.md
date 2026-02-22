# Rutar

[简体中文文档](./README_CN.md)

Rutar is a lightweight, high-performance code editor built with Tauri, React 19, and Rust.

## Highlights

- Tree-sitter syntax highlighting powered by Rust backend tokens.
- Virtualized editor rendering for smooth large-file editing.
- Outline sidebar for structured files and programming languages.
- Markdown live preview panel with Mermaid support and scroll sync.
- Editable side-by-side diff tabs with backend-aligned line comparison.
- Rust-side search/filter sessions and word count to keep UI responsive.
- Locked tabs, recent files/folders, and persisted user settings.
- Bilingual UI (English and Simplified Chinese).

## Tech Stack

- Frontend: React 19, TypeScript, Vite, Zustand, Tailwind CSS 4.
- Backend: Rust, Tauri v2, tree-sitter, ropey, dashmap.

## Requirements

- Node.js (LTS)
- Rust (stable)

## Quick Start

```bash
npm install --legacy-peer-deps
npm run tauri dev
```

## Common Commands

```bash
# frontend
npm run dev
npm run build
npx tsc
npm run test
npm run test:watch

# tauri / rust
npm run tauri dev
npm run tauri build
cd src-tauri && cargo check
cd src-tauri && cargo test
```

## Configuration

- User config file: `%AppData%\Rutar\config.json`.
- Common options: language, font family/size, tab width, line ending, word wrap, recent items, pinned tabs, window state, mouse gestures.
- Markdown preview currently requires `app.security.freezePrototype = false` in `src-tauri/tauri.conf.json` because of Mermaid runtime compatibility.
- Locked tabs are persisted by path in `pinnedTabPaths` and restored on startup.

## Project Structure

- `src/`: React frontend.
- `src-tauri/`: Rust backend and Tauri commands.
- `AGENTS.md`: repository engineering and agent guidelines.

## License

MIT
