# MONACO Migration TODO

## Metadata
- Branch: feat/monaco-migration-lab
- Last Updated: 2026-03-21 22:14 (UTC+8)
- Overall Progress: 100%
- Status Legend: TODO / DOING / DONE / BLOCKED

## Update Rules
- 开始某任务前，把该任务状态改为 `DOING` 并更新 `Last Updated`。
- 完成某任务后，改为 `DONE`，补充 `Verification` 与 `Journal`。
- 若受阻，改为 `BLOCKED`，写明阻塞点与下一步。
- 每实现一个可见功能，必须同步更新本文件，不允许批量补记。
- 任何范围变更必须先在 `Scope Changes` 记录，再实施。

## Scope Changes
- (empty)

## Tasks
- [x] M001 Branch ready: 新建实验分支并确认工作区基线
- [x] M002 Frontend deps: 引入 monaco-editor 与类型依赖，确保构建可过
- [x] M003 Vite integration: Monaco workers 与 chunk 策略接入
- [x] M004 Editor core replace: 用 Monaco 重写主编辑器内部实现（保持组件出口不变）
- [x] M005 Event bridge: 兼容现有 rutar:* 事件（navigate/force-refresh/paste/document-updated）
- [x] M006 Backend API add: 新增 get_document_text 与 apply_text_edits_by_line_column
- [x] M007 History sync: 与 undo/redo/get_edit_history_state 的一致性打通
- [x] M008 Diff replace: Diff 编辑器替换为 Monaco 双实例，保持高一致性功能
- [x] M009 Toolbar/status integration: 工具栏、状态栏、搜索跳转联动修正
- [x] M010 Large file mode: 50MB+ 文件走 Monaco 并启用性能保护参数
- [x] M011 Tests frontend: 更新/新增 App, Editor, DiffEditor 相关单测
- [x] M012 Tests backend: 新增后端新增命令与编辑映射测试
- [x] M013 Performance baseline: 完成对比数据采集并记录结论
- [x] M014 Docs sync: 更新 README 与 AGENTS 中编辑器实现说明

## Verification
- M001: `git checkout -b feat/monaco-migration-lab` succeeded; workspace baseline clean before changes.
- M002: `npm install monaco-editor --save --legacy-peer-deps` succeeded.
- M003: Added Monaco worker bootstrap and Vite chunk split; `npm run build` passed.
- M004: `src/components/Editor.tsx` replaced with Monaco engine (`modelByTabId` + view-state cache), component export path unchanged.
- M005: `Editor.tsx` wired `rutar:navigate-to-line` / `rutar:navigate-to-outline` / `rutar:force-refresh` / `rutar:paste-text` / `rutar:document-updated`.
- M006: Added backend commands `get_document_text` and `apply_text_edits_by_line_column` in `src-tauri/src/commands/file_io*.rs`, `editing*.rs`, and registered in `src-tauri/src/lib.rs`.
- M007: Monaco edit sync goes through backend undo stack (`apply_text_edits_by_line_column`), toolbar history state kept via `get_edit_history_state`; diff history bridge wired via `rutar:diff-history-action`.
- M008: `src/components/DiffEditor.tsx` migrated to dual Monaco instances with source/target independent models, save actions, clipboard bridge, and copy-to-left/right actions.
- M009: `src/components/Toolbar.tsx` integrates Monaco clipboard/history event bridge (`rutar:editor-clipboard-action`, `rutar:diff-clipboard-action`, `rutar:diff-history-action`); App-level regression run passed.
- M010: Monaco large-file guard enabled in Editor/Diff (`minimap off`, `folding off`, `selection highlight off`, `occurrences off`, `validation decorations off`, `smoothScrolling off` when `largeFileMode=true`).
- M011: Frontend tests passed:
  - `npm run test -- src/App.test.ts src/components/Editor.monaco.test.tsx src/components/DiffEditor.monaco.test.tsx`
  - Result: `3 files, 105 tests passed`.
- M012: Backend tests passed:
  - `cd src-tauri && cargo test apply_line_column_edits_should` -> `3 passed`
  - `cd src-tauri && cargo test utf16` -> `4 passed`
- M013: Performance baseline captured with same toolchain (`vite 7.3.1`):
  - Baseline (`main` worktree) `npm run build`: `28.97s`; `Editor` chunk `138.69 kB`, `DiffEditor` chunk `72.10 kB`, no Monaco worker chunks.
  - Monaco branch `npm run build`: `1m 28s`; `Editor` chunk `7.94 kB`, `DiffEditor` chunk `11.02 kB`, plus `monaco-vendor` `4,212.33 kB` and dedicated workers (`editor/json/html/css/ts`).
  - Conclusion: migration trades bundle/build size for runtime editor capability and worker-based parsing/tokenization isolation.
- M014: Docs synced in `README.md`, `README_CN.md`, and `AGENTS.md` (Monaco as primary engine; tree-sitter retained for outline/structure parsing).

## Journal
- 2026-03-21 00:00 | INIT | 创建 TODO 模板
- 2026-03-21 21:30 | M001 DONE | 已创建实验分支并确认基线状态。
- 2026-03-21 21:31 | M002 DOING | 开始引入 Monaco 依赖。
- 2026-03-21 21:32 | M002 DONE | 已安装 monaco-editor 并更新 lockfile。
- 2026-03-21 21:32 | M003 DOING | 开始接入 Monaco worker 与 Vite 分包。
- 2026-03-21 21:33 | M003 DONE | worker 环境与 `monaco-vendor` 分包完成，构建通过。
- 2026-03-21 21:34 | M004/M005 DOING | 开始替换主编辑器并接入事件桥接。
- 2026-03-21 21:37 | M006/M007 DOING | 开始新增 Monaco 编辑后端命令并处理历史一致性。
- 2026-03-21 21:48 | M004 DONE | 主编辑器改为 Monaco，保留原组件出口与 tab/model 缓存策略。
- 2026-03-21 21:53 | M005 DONE | rutar 事件桥接完成（navigate/refresh/paste/document-updated）。
- 2026-03-21 21:57 | M006 DONE | `get_document_text` 与 `apply_text_edits_by_line_column` 命令落地并注册。
- 2026-03-21 22:01 | M007 DONE | 编辑历史链路打通，避免前后端历史状态分叉。
- 2026-03-21 22:03 | M008 DONE | Diff 编辑器替换为 Monaco 双实例并补齐剪贴板/保存/互拷。
- 2026-03-21 22:05 | M009 DONE | 工具栏与状态链路适配 Monaco 事件桥接。
- 2026-03-21 22:06 | M010 DONE | largeFileMode 下 Monaco 降载参数生效。
- 2026-03-21 22:07 | M011 DONE | App + Editor + DiffEditor 迁移回归测试通过。
- 2026-03-21 22:11 | M012 DONE | 后端补齐跨行/UTF-16/批量 edits 单测并通过。
- 2026-03-21 22:14 | M013 DONE | 完成 baseline 对比采集并记录结论。
- 2026-03-21 22:14 | M014 DONE | README/README_CN/AGENTS 完成 Monaco 迁移说明同步。
