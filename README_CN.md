# Rutar

[English README](./README.md)

Rutar 是一个基于 Tauri、React 19 和 Rust 构建的轻量高性能代码编辑器。

## 核心特性

- 使用 Rust 后端 + Tree-sitter 生成语法高亮 Token。
- 基于虚拟化渲染，支持大文件流畅编辑。
- 提供大纲侧栏，支持结构化文件和多种编程语言符号。
- 提供实时 Markdown 预览面板，支持 Mermaid，并与编辑器滚动同步。
- 提供可编辑的左右对比视图，行对齐与差异计算由后端完成。
- 搜索/筛选会话与字数统计在 Rust 侧执行，减少前端卡顿。
- 支持锁定标签页、最近文件/文件夹、用户配置持久化。
- 支持英文与简体中文界面切换。

## 技术栈

- 前端：React 19、TypeScript、Vite、Zustand、Tailwind CSS 4。
- 后端：Rust、Tauri v2、tree-sitter、ropey、dashmap。

## 环境要求

- Node.js（LTS）
- Rust（stable）

## 快速开始

```bash
npm install --legacy-peer-deps
npm run tauri dev
```

## 常用命令

```bash
# 前端
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

## 配置说明

- 用户配置文件：`%AppData%\Rutar\config.json`。
- 常见配置项：语言、字体、字号、Tab 宽度、换行符、自动换行、最近记录、锁定标签、窗口状态、鼠标手势。
- Mermaid 兼容性要求：`src-tauri/tauri.conf.json` 中 `app.security.freezePrototype` 当前需保持 `false`。
- 锁定标签会以路径形式保存在 `pinnedTabPaths`，并在启动时恢复。

## 项目结构

- `src/`：React 前端。
- `src-tauri/`：Rust 后端与 Tauri 命令层。
- `AGENTS.md`：仓库工程规范与代理协作说明。

## 许可证

MIT
