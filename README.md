# Rutar

[简体中文文档](./README_CN.md)

Rutar is a lightweight, high-performance code editor built with Tauri, React 19, and Rust.

## Highlights

- Monaco-powered file and diff editing experience (single engine for both regular and diff tabs).
- Virtualized editor rendering for smooth large-file editing.
- Smart Enter indentation plus auto-paired brackets and quotes in both the main editor and editable diff panels.
- Outline sidebar for structured files and programming languages, including off-window jump loading for large files.
- Markdown live preview panel with Mermaid support and scroll sync.
- tree-sitter remains enabled on the Rust side for outline and structure-oriented analysis workflows.
- Editable side-by-side diff tabs with backend-aligned line comparison.
- Rust-side search/filter sessions and word count to keep UI responsive.
- Search and replace inputs keep recent-history dropdowns persisted in config.
- External file-change prompts pause while the app is backgrounded, and declining a prompt suppresses repeated prompts until the app next leaves foreground.
- Locked tabs, recent files/folders, and persisted user settings.
- Bilingual UI (English and Simplified Chinese).

## Tech Stack

- Frontend: React 19, TypeScript, Vite, Zustand, Tailwind CSS 4.
- Backend: Rust, Tauri v2, tree-sitter (outline/structure parsing), ropey, dashmap.

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

## Performance

Rutar emits User Timing marks under the `rutar:*` namespace.

- `rutar:boot:start` to `rutar:boot:react-mounted` covers the synchronous bootstrap path.
- `rutar:monaco:env-setup-start` to `rutar:monaco:env-setup` covers Monaco init on first editor open.

Dump them inside DevTools.

```js
performance.getEntriesByType('measure').filter((entry) => entry.name.startsWith('rutar:'));
```

Or call `perfMark.publish()` from `src/lib/perf-mark.ts` to populate `globalThis.__rutarPerfDump`.
Then run `npx tsx scripts/bench-startup.ts` to write a JSON snapshot under `.perf/` for diffing across commits.

## Configuration

- User config file: `%AppData%\Rutar\config.json`.

## Project Structure

- `src/`: React frontend.
- `src-tauri/`: Rust backend and Tauri commands.
- `AGENTS.md`: repository engineering and agent guidelines.

## License

MIT
