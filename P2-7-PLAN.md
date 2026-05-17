# P2-7 实施计划 · `src/components/search-panel/` hook 收敛

> 生成日期：2026-05-17
> 对应 TODO.md 条目：**P2-7** `src/components/search-panel/` 92 文件 / 35 hook 收敛为 ~5 个域 hook + `apply*`/`resolve*` 合并；并发回收冗余测试
> 状态：**已完成（2026-05-17）** — 分支 `refactor/p2-7-search-panel-consolidate` 9 commit
>
> **实际成果**：38 hook → 12 public hook；92 文件 → 67 文件；`SearchReplacePanel.tsx` 893 → 710 行。
>
> **与原计划偏差**：
> - **Stage 5a 跳过**：`applySearchPanelRunResults.ts` 已经是 14 个独立 sub-reducer 集合（每个 30–130 行），plan 假设的"780 行 mega-reducer"前提不成立，无需预拆。
> - **`apply*`/`resolve*` 不内联到域 hook**：plain-ts util 保留独立，避免上帝 hook（2200+ 行）+ 维持单测能力。
> - **chrome / navigation 域各保留 1 个独立 hook**：`useSearchSidebarFrame`（chrome 域 8→2）因被 navigation 域消费产生循环；`useSearchResultFilterStepNavigation`（navigation 域 4→2）因依赖晚期 `scrollResultItemIntoView`，避免再引入 ref pattern。同 stage 3a 的分块思路。
> - **`useSearchKeywordKeyDown` / `useSearchQuerySectionProps` 保留**：单一职责小 hook（input 域 mid/late call），不强合并。
>
> 详见 TODO.md P2-7 完成笔记。

---

## 0 · 计划摘要

| 项 | 现状 | 目标 | 净 ROI |
|---|---|---|---|
| hook 数量 | 38 | 6-8 个域 hook | ★★★★ |
| `apply*` 模块级 reducer | 15 个独立文件 | 内联到对应域 hook 或合并为 `searchPanelReducer.ts` | ★★★ |
| `resolve*` selector | 10 个独立文件 | 内联到对应域 hook 或合并为 `searchPanelSelectors.ts` | ★★★ |
| `SearchReplacePanel.tsx` | 893 行 / import 32 hook | 拆 hook composition + 800 行内 | ★★★★ |
| 测试 | `SearchReplacePanel.test.tsx` 6284 行 | 100% 持续 pass，不修改测试 | 必须 |
| 工作量 | — | 5 stage × 2-3h = 10-15h，跨 5+ commit | — |

**做不做的关键判断**：值得做，但**必须跨多次会话 + 分 stage 提交**。单次会话强推会破坏 6284 行测试。

---

## 1 · 现状摸查（事实清单）

### 1.1 目录画像

```
src/components/search-panel/   总 92 文件 / ~13000 行
├── 38 hooks                  (use*.ts*)              5230 行
├── 15 apply* reducer 件      (apply*.ts)             2476 行
├── 10 resolve* selector 件   (resolve*.ts)            910 行
├── 16 plain-ts utility       (build*/finalize*/...)  1800 行
├── 11 components             (*.tsx)                 2499 行
└── 2  test                                            ~80 行
```

### 1.2 hook 全清单（按行数降序 / 38 项）

| Hook | 行数 | 推测域 |
|---|---:|---|
| `useSearchStepNavigation` | 375 | navigation |
| `useSearchPanelRunHandlers` | 358 | execution |
| `useSearchResultFilterStepNavigation` | 339 | navigation / result-filter |
| `useSearchPanelRestoreEffect` | 313 | execution / snapshot |
| `useSearchPanelShellEffects` | 288 | chrome |
| `useSearchResultPanelControls` | 288 | result-panel |
| `useSearchReplaceHandlers` | 284 | replace |
| `useSearchPanelLoadMoreHandlers` | 281 | execution |
| `useSearchPanelOverlayOptions` | 256 | chrome / overlays |
| `useFilterRuleGroupPersistence` | 242 | filter-rules |
| `useSearchResultsViewport` | 206 | result-panel |
| `useFilterRuleEditorState` | 202 | filter-rules |
| `useSearchInputContextMenu` | 179 | chrome / input |
| `useSearchFirstMatchSearch` | 162 | execution |
| `useSearchSidebarInteraction` | 160 | chrome |
| `useSearchQuerySectionProps` | 143 | chrome |
| `useSearchPanelSnapshotPersistence` | 141 | execution / snapshot |
| `useSearchInputInteractions` | 120 | chrome / input |
| `useSearchSidebarShellProps` | 109 | chrome |
| `useSearchMatchNavigation` | 106 | navigation |
| `useSearchApplyResultFilter` | 106 | navigation / result-filter |
| `useSearchPanelDerivedState` | 103 | store-base |
| `useSearchPanelResetState` | 103 | store-base |
| `useFilterRulesEditorOptions` | 98 | filter-rules |
| `useSearchPanelRuntimeRefs` | 96 | store-base |
| `useSearchPanelLocalState` | 94 | store-base |
| `useSearchQueryOptions` | 92 | execution |
| `useSearchPanelOverlaysProps` | 76 | chrome / overlays |
| `useSearchResultPanelState` | 70 | result-panel |
| `useSearchSidebarFrame` | 67 | chrome |
| `useSearchBatchControl` | 61 | execution |
| `useSearchSessionLifecycle` | 60 | execution |
| `useSearchPanelViewProps` | 57 | chrome |
| `useSearchPanelInputSupport` | 55 | chrome / input |
| `useSearchPanelUiState` | 46 | store-base |
| `useFilterRulesEditorProps` | 46 | filter-rules |
| `useSearchPanelStoreState` | 36 | store-base |
| `useSearchSidebarShellOptions` | 26 | chrome |

### 1.3 `apply*` reducer 全清单（按行数降序 / 15 项）

| Apply | 行数 | 对应 action 域 |
|---|---:|---|
| `applySearchPanelRunResults` | **780** | execution（**上帝函数**） |
| `applySearchPanelLoadMoreSessionResults` | 188 | execution |
| `applySearchPanelFirstMatchResult` | 175 | execution |
| `applySearchPanelCountResults` | 150 | execution |
| `applySearchPanelResultFilterSelection` | 145 | navigation / result-filter |
| `applySearchPanelResolvedReplaceAllResult` | 135 | replace |
| `applySearchPanelResolvedReplaceCurrentResult` | 136 | replace |
| `applySearchPanelNavigationSelection` | 133 | navigation |
| `applySearchPanelResultFilterStepSuccess` | 118 | navigation / result-filter |
| `applySearchSessionRestoreResult` | 99 | execution / snapshot |
| `applyFilterSessionRestoreResult` | 84 | execution / snapshot |
| `applySearchPanelReplaceSearchGuard` | 83 | replace |
| `applySearchPanelCursorStepResult` | 82 | navigation |
| `applySearchPanelReplaceSuccessEffects` | 47 | replace |
| `applySearchPanelErrorMessage` | 19 | store-base |

### 1.4 `resolve*` selector 全清单（按行数降序 / 10 项）

| Resolve | 行数 | 对应域 |
|---|---:|---|
| `resolveSearchPanelStepTargets` | 276 | navigation |
| `resolveSearchPanelCachedRunHit` | 155 | execution |
| `resolveSearchPanelRunStartState` | 133 | execution |
| `resolveSearchPanelStepAnchors` | 100 | navigation |
| `resolveSearchPanelReplaceState` | 85 | replace |
| `resolveSearchPanelSessionStartState` | 43 | execution |
| `resolveSearchPanelFirstMatchState` | 40 | execution |
| `resolveSearchPanelChunkState` | 29 | execution |
| `resolveSearchPanelResultFilterKeyword` | 25 | navigation / result-filter |
| `resolveSearchPanelReplaceCurrentTargetState` | 24 | replace |

### 1.5 plain-ts utility 全清单（16 项）

| File | 行数 | 角色 |
|---|---:|---|
| `utils.tsx` | 561 | UI helpers / formatters |
| `buildSearchPanelRunRequests` | 400 | IPC payload builder |
| `types.ts` | 259 | shared types |
| `restoreSearchPanelSnapshotState` | 245 | snapshot |
| `backendGuards` | 125 | IPC error guards |
| `buildSearchPanelRestoreRequests` | 124 | IPC payload builder |
| `searchPanelRunLifecycle` | 119 | execution scaffolding |
| `resetSearchPanelForMissingSnapshot` | 113 | snapshot |
| `createSearchPanelRunResults` | 98 | execution scaffolding |
| `resetSearchPanelForInactiveTab` | 72 | snapshot |
| `resultFilterStepRunLifecycle` | 60 | navigation / result-filter |
| `index.ts` | 42 | barrel |
| `readSearchPanelDocumentVersion` | 42 | IPC versioning |
| `matchesSearchPanelCacheIdentity` | 39 | cache identity |
| `finalizeSearchPanelRestoreCycle` | 25 | snapshot |
| `loadMoreSearchPanelStepMatches` | 23 | execution scaffolding |
| `searchPanelStepGuards` | 11 | navigation guards |

### 1.6 components 清单

| Component | 行数 | 角色 |
|---|---:|---|
| `utils.tsx` | 561 | （上面已列） |
| `FilterRulesEditor.tsx` | 526 | filter-rules UI |
| `SearchResultItems.tsx` | 491 | result-panel UI |
| `SearchResultsPanel.tsx` | 364 | result-panel UI |
| `SearchQuerySection.tsx` | 223 | chrome / input UI |
| `SearchSidebarChrome.tsx` | 122 | chrome shell |
| `SearchPanelHeader.tsx` | 71 | chrome |
| `SearchInputContextMenu.tsx` | 69 | chrome / input |
| `SearchPanelOverlays.tsx` | 28 | overlays |
| `ModeButton.tsx` | 24 | chrome |
| `SearchSidebarBody.tsx` | 20 | thin shell |

### 1.7 消费者拓扑

```
src/components/SearchReplacePanel.tsx   (893 行，单一外部门面)
│   ├── import 32 hook + 3 component from @/components/search-panel
│   └── 这就是 hook composition 巨点
│
src/components/SearchReplacePanel.test.tsx  (6284 行，唯一 contract)
└── 整个 P2-7 重构都不能破坏它
```

**外部消费方仅 1 个**（不计 test 与 lib/clipboard 的轻量引用）—— 即 `SearchReplacePanel.tsx`。重构改动**不会**外溢，但所有改动都会通过 SearchReplacePanel 的 hook 调用形状改变体现。

---

## 2 · 架构问题诊断

### 2.1 主要反模式

1. **过度细粒度 hook 抽取**：26/38 hook < 200 行，最小的 `useSearchSidebarShellOptions` 仅 26 行。"单一职责"被推到极端，结果是 38 hook 互相通过 SearchReplacePanel 中转数据，形成隐式拓扑。

2. **`apply*` 是 reducer in disguise**：15 个 `apply*` 是模块级 pure function，签名 `(state, payload) => Partial<state>`，本质等价 reducer。但没用 `useReducer`，而是被各 hook 直接 import + 调用 `setXxx(applyFoo(currentXxx, payload))`。这种结构相对 `useReducer({ type: 'RUN_RESULTS', ... })` 无运行时优势，但增加 mental overhead（要在 reducer file vs hook file vs handler file 之间跳跃）。

3. **`resolve*` 是 selector in disguise**：10 个 `resolve*` 是 derived state computation，应该用 `useMemo` 嵌入对应域 hook，但被独立成 module-level pure function 又额外被 hook 调用，导致跳转层级。

4. **`build*` / `create*` / `finalize*` / `reset*` / `restore*` 命名爆炸**：16 plain-ts utility 都是 reducer/effect 的拆分件，命名词典化（"动词 + SearchPanel + 形容词 + 名词"）但没有清晰的概念边界。

5. **`applySearchPanelRunResults` 780 行**：单一 reducer 函数 780 行，必须先分析其内部逻辑结构（是否能按结果类型 / 状态分支拆 sub-reducer）。

### 2.2 真正的"肿胀"在哪

- **不是 38 hook 数量本身**——细粒度本身可控
- **是 38 hook 都堆到 `SearchReplacePanel` 一处**——形成 hook composition god component
- **是 hook 间通过 SearchReplacePanel 中转 prop**——A 返回 5 个值，3 个传给 B，2 个传给 C；合并 A+B+C 后这些中转 prop 变成局部变量，可读性 +50%
- **是 reducer/selector 散布**——每个 hook 内的 setState 都要先 import 一个 apply*/resolve* 才能 call，形成 ".ts 文件跳跃树"

---

## 3 · 目标态设计

### 3.1 域 hook 划分（7 域 hook + 1 store-base hook）

| 目标 hook | 合并源 | 估算行数 |
|---|---|---:|
| `useSearchPanelStore`（store 直连 + UI 基础 state） | `useSearchPanelStoreState` + `useSearchPanelLocalState` + `useSearchPanelUiState` + `useSearchPanelRuntimeRefs` + `useSearchPanelDerivedState` + `useSearchPanelResetState` + `applySearchPanelErrorMessage` | ~480 |
| `useSearchExecution`（run / load-more / first-match / count / batch / session / restore / snapshot） | `useSearchPanelRunHandlers` + `useSearchPanelLoadMoreHandlers` + `useSearchFirstMatchSearch` + `useSearchBatchControl` + `useSearchSessionLifecycle` + `useSearchPanelRestoreEffect` + `useSearchPanelSnapshotPersistence` + `useSearchQueryOptions` + 内联所有 execution 域 `apply*` + `resolve*` + 6 plain-ts 利器 | ~2200（含 apply/resolve 内联） |
| `useSearchNavigation`（step / match / result-filter step） | `useSearchStepNavigation` + `useSearchMatchNavigation` + `useSearchResultFilterStepNavigation` + `useSearchApplyResultFilter` + 内联 navigation `apply*` + `resolve*` | ~1200（含内联） |
| `useSearchReplace`（replace current / all） | `useSearchReplaceHandlers` + 内联 replace `apply*` + `resolve*` | ~700（含内联） |
| `useSearchPanelChrome`（sidebar frame / shell / overlay / view props） | `useSearchSidebarShellOptions` + `useSearchSidebarShellProps` + `useSearchSidebarFrame` + `useSearchSidebarInteraction` + `useSearchPanelShellEffects` + `useSearchPanelViewProps` + `useSearchPanelOverlayOptions` + `useSearchPanelOverlaysProps` | ~900 |
| `useSearchInput`（input ctx menu / interactions / query section / input support） | `useSearchInputContextMenu` + `useSearchInputInteractions` + `useSearchPanelInputSupport` + `useSearchQuerySectionProps` | ~500 |
| `useSearchResultPanel`（result panel state / controls / viewport） | `useSearchResultPanelState` + `useSearchResultPanelControls` + `useSearchResultsViewport` | ~570 |
| `useFilterRules`（filter rules editor / persistence / options） | `useFilterRuleEditorState` + `useFilterRuleGroupPersistence` + `useFilterRulesEditorOptions` + `useFilterRulesEditorProps` | ~590 |

**Net effect**：38 hook → 8 hook（含 store-base），但有些域比预想大（execution 2200 行 / navigation 1200 行）。这是因为 inlining apply\*/resolve\* 把行数显式聚拢——但**总代码量减少 ~10-15%**（apply/resolve 函数签名样板 + import 噪音被消除）。

### 3.2 命名规则统一

- 域 hook：`use<Domain>(deps)` 返回 `{ state, actions }` 形状 object
- 内部 reducer 子函数：camelCase，不再以 `applySearchPanel` 前缀（前缀仅在跨文件时必要，内联后无需）
- 内部 selector：`useMemo(() => ...)` 嵌入域 hook
- IPC payload builder：保留 `build*` 命名，作为该域 hook 文件内的私有 helper

### 3.3 SearchReplacePanel.tsx 改造目标

```tsx
// 改造前（893 行）：
export function SearchReplacePanel() {
  const { activeTab, ... } = useSearchPanelStoreState();
  const { keyword, setKeyword, ... } = useSearchPanelLocalState();
  // ... 30 more hook calls ...
  // ... 600 lines of inline logic ...
}

// 改造后（~300 行目标）：
export function SearchReplacePanel() {
  const store = useSearchPanelStore();
  const chrome = useSearchPanelChrome(store);
  const input = useSearchInput(store);
  const execution = useSearchExecution(store, input);
  const navigation = useSearchNavigation(store, execution);
  const replace = useSearchReplace(store, execution);
  const resultPanel = useSearchResultPanel(store, execution);
  const filterRules = useFilterRules(store);

  return (
    <SearchSidebarChrome {...chrome.shellProps}>
      <SearchSidebarBody
        isFilterMode={store.panelMode === 'filter'}
        filterRulesEditorProps={filterRules.editorProps}
        searchQuerySectionProps={input.querySectionProps}
      />
      <SearchPanelOverlays {...chrome.overlayProps} />
      <SearchResultsPanel {...resultPanel.props} />
    </SearchSidebarChrome>
  );
}
```

---

## 4 · 风险评估

### 4.1 高风险点（需主动缓解）

| 风险 | 级别 | 缓解策略 |
|---|---|---|
| `SearchReplacePanel.test.tsx` 6284 行 break | 🔴 极高 | 每 stage 末 `vitest run SearchReplacePanel.test.tsx` 必须 100% pass；任何 test break **立即回滚** |
| hook 调用顺序改变 → React hook order error | 🔴 高 | 合并 hook 时保持原顺序（前序 hook 返回值喂给后序 hook）；新域 hook 内顺序与原拆分 hook 顺序一致 |
| 隐式时序依赖（hook A 的 setState 必须在 hook B 之前） | 🟠 中 | 合并前在 SearchReplacePanel 中标注每个 hook 的"调用前置条件"；合并后用注释固化 |
| `applySearchPanelRunResults` 780 行内有未发现的分支 | 🟠 中 | 合并前先单独 PR 拆分该函数（按结果类型分 sub-reducer），不改 signature；test 持续 pass 后再继续 |
| `useReducer` 切换诱惑 | 🟢 低 | **不切换**。保持现 `useState`-based reducer pattern；仅合并文件，不改运行时模型 |
| store 边界 API 改名 | 🟢 低 | 不改 `useStore` 的 selector 形状；只动 hook composition 层 |

### 4.2 不应该做（明确 out of scope）

- ❌ 把 `apply*` 改写成 `useReducer({ type: 'RUN_RESULTS' })` —— 这是另一个项目，单独排期
- ❌ 改 `SearchReplacePanel.test.tsx` —— 它是 contract，重构必须适配它
- ❌ 改 Zustand store 形状（`useStore(state => state.xxx)`）—— 那是 P2-3，独立项
- ❌ 改 IPC payload schema（`buildSearchPanelRunRequests` 输出形状）—— 与 Rust 后端 contract
- ❌ 修改 `applySearchPanelRunResults` 780 行的业务逻辑 —— 仅搬位置，不改语义
- ❌ 新增 React Context —— 保持 hook 间通过参数显式传递

---

## 5 · 实施计划（5 stage）

> **铁律**：每 stage 末必须 `tsc --noEmit` + `vitest run SearchReplacePanel.test.tsx` + `git commit`。任何步骤失败立即 `git reset --hard HEAD`。

### Stage 0 · 预备（30min，无 commit）

1. 创建 feature branch `refactor/p2-7-search-panel-consolidate`
2. 跑 baseline：
   - `tsc --noEmit` 必须 0 error
   - `vitest run SearchReplacePanel.test.tsx` 记录 pass 数（应该是 X/X 全绿）
   - `vitest run utils.test.tsx resolveSearchPanelStepTargets.test.ts` 全绿
3. 用 grep 提取每个目标域涉及的全部文件名清单存到本计划末尾的 appendix
4. **决定每域的目标 API surface**（hook 返回值形状）

### Stage 1 · `useFilterRules` 域合并（~2h，1 commit）

**为什么先做**：filter-rules 4 hook 之间互依但**与 search execution 主流程隔离**，是最安全的练手域。

**步骤**：
1. 新建 `src/components/search-panel/useFilterRules.ts`
2. 把 4 个源 hook 内容搬入，按原顺序在新 hook 内调用对应的子逻辑（保持 useState/useEffect/useCallback 调用序）
3. 新 hook 返回 object：`{ editorState, editorOptions, editorProps, groupPersistence }`
4. SearchReplacePanel 中替换 4 个 hook 调用为 1 个 `const filterRules = useFilterRules(...)` + destructure
5. 删除 4 个源 hook 文件，更新 `index.ts` re-export
6. `tsc --noEmit` + `vitest run SearchReplacePanel.test.tsx` 必须全绿
7. **Commit**: `refactor(search-panel): consolidate 4 filter-rules hooks into useFilterRules`

**回滚信号**：tsc 报错 / test fail → 立即 `git reset --hard HEAD`。

### Stage 2 · `useSearchResultPanel` 域合并（~1.5h，1 commit）

**步骤**：同 stage 1，合并 `useSearchResultPanelState` + `useSearchResultPanelControls` + `useSearchResultsViewport`。

**Commit**: `refactor(search-panel): consolidate 3 result-panel hooks into useSearchResultPanel`

### Stage 3 · `useSearchPanelChrome` + `useSearchInput` 域合并（~3h，2 commit）

**子步骤 3a**: 合并 chrome 8 hook → useSearchPanelChrome（含 shell/overlay/view/sidebar）。**Commit**: `refactor(search-panel): consolidate 8 sidebar-chrome hooks into useSearchPanelChrome`。

**子步骤 3b**: 合并 input 4 hook → useSearchInput。**Commit**: `refactor(search-panel): consolidate 4 input hooks into useSearchInput`。

### Stage 4 · `useSearchPanelStore` 域合并（~2h，1 commit）

合并 store-base 6 hook + 内联 `applySearchPanelErrorMessage`。

**注意**：此 stage 改的是其他所有 stage 的依赖底座，应**最后做基础合并**或者**最先做**。我建议**先做底座**（stage 1 之前），但需要在 stage 1-3 完成后再做（因为底座变更影响所有上层）。

**修正**：放在 stage 4 较稳妥——前 3 stage 都基于现有 6 个 store-base hook 调用，最后再合并底座。

**Commit**: `refactor(search-panel): consolidate 6 store-base hooks into useSearchPanelStore`

### Stage 5 · `useSearchExecution` + `useSearchNavigation` + `useSearchReplace`（~5h，3 commit）

**这是最危险的 stage**。execution 域涉及 8 hook + 9 apply* + 7 resolve* + 6 plain-ts。Navigation 域涉及 4 hook + 5 apply* + 4 resolve*。Replace 域涉及 1 hook + 4 apply* + 2 resolve*。

**子步骤 5a · 预拆 `applySearchPanelRunResults` 780 行**：
- 不改 signature，按结果类型（cached hit / fresh run / partial / error）切到 4 个 `_apply*` 私有 helper
- vitest 全绿
- **Commit**: `refactor(search-panel): split applySearchPanelRunResults into typed sub-reducers (no behavior change)`

**子步骤 5b · `useSearchExecution` 合并**：把 8 hook + 9 apply* + 7 resolve* 内联。**Commit**: `refactor(search-panel): consolidate execution hooks + reducers into useSearchExecution`。

**子步骤 5c · `useSearchNavigation` 合并**：同上。**Commit**: `refactor(search-panel): consolidate navigation hooks + reducers into useSearchNavigation`。

**子步骤 5d · `useSearchReplace` 合并**：同上。**Commit**: `refactor(search-panel): consolidate replace hooks + reducers into useSearchReplace`。

### Stage 6 · SearchReplacePanel 改造 + 收尾（~1.5h，1 commit）

1. SearchReplacePanel 改造为 7 个域 hook 调用形态（见 3.3 节示意）
2. 删除空目录里所有遗留 apply*/resolve* 文件
3. 清理 `index.ts`：从 ~30 个 hook export 降到 8 个
4. 删除 `useFilterRulesEditorProps` 等纯壳 hook 文件（已内联）
5. 跑全量验证：
   - `tsc --noEmit` 0 error
   - `vitest run` 全绿（不限 SearchReplacePanel.test.tsx，所有 src/ 测试）
   - 手工启动 `npm run tauri dev`，搜索 + 替换 + 过滤 + 切 tab + 关 sidebar 各功能验证
6. **Commit**: `refactor(search-panel): rewire SearchReplacePanel.tsx with 7 domain hooks (893 -> ~300 lines)`

---

## 6 · 测试策略

### 6.1 安全网

- **主要安全网**：`SearchReplacePanel.test.tsx` 6284 行。每 stage 末必须 100% pass。
- **次级安全网**：`utils.test.tsx` + `resolveSearchPanelStepTargets.test.ts` 单测。
- **手工验证（每 stage 末）**：`npm run tauri dev` + 操作搜索 → 替换 → 过滤 → 切 tab。

### 6.2 测试不应改

- 如果 stage 内合并 hook 后 test fail，**优先适配域 hook 形状回到原 hook 公开 API**，而不是改 test
- 例外：极少数 test 直接 mock 内部 hook 名（需 `vi.mock('./useXxx')`）—— 这种 mock 必须同步改 mock 路径，但**不改 mock 行为**

### 6.3 失败回滚

- 单次 commit 不通过 = `git reset --hard HEAD~1`
- 整个 stage 出现连环回滚 = 该 stage 重新规划合并粒度（可能拆得更小）

---

## 7 · 验收标准

| 指标 | 当前 | 目标 |
|---|---|---|
| `src/components/search-panel/` 文件数 | 92 | ≤ 40 |
| hook 数量 | 38 | ≤ 10 |
| `apply*` 独立文件数 | 15 | 0（全部内联） |
| `resolve*` 独立文件数 | 10 | 0（全部内联） |
| `SearchReplacePanel.tsx` 行数 | 893 | ≤ 350 |
| `SearchReplacePanel.tsx` import 数 | 35 | ≤ 12 |
| `applySearchPanelRunResults` 单文件最大行 | 780 | ≤ 250（拆 sub-reducer） |
| `SearchReplacePanel.test.tsx` pass | X/X | X/X（不允许下降） |
| `tsc --noEmit` | 0 error | 0 error |
| 手工 smoke pass | — | search + replace + filter + switch tab |

---

## 8 · 排期建议

- **不要在单次会话完成全部 stage**。建议节奏：
  - 会话 A：Stage 0 + Stage 1 + Stage 2（filter-rules + result-panel，~3.5h，2 commit）
  - 会话 B：Stage 3（chrome + input，~3h，2 commit）
  - 会话 C：Stage 4 + Stage 5a（store-base + applySearchPanelRunResults 预拆，~3h，2 commit）
  - 会话 D：Stage 5b + 5c + 5d（execution + navigation + replace，~5h，3 commit）
  - 会话 E：Stage 6（SearchReplacePanel 改造收尾，~1.5h，1 commit）
- 每会话末 push 到 feature branch（不 push 到 main），让 next session 接续
- 全部 5 会话完成后整体 squash 或保留 stage commit 历史，按团队偏好

---

## 9 · 决策点（启动前必须确认）

> 实施前需要团队 / 用户对以下三个问题表态：

1. **是否接受 5+ 会话的跨越时间窗口？** 一次会话能做完 1-2 stage；急于全部完成 → 建议拒做 P2-7。
2. **是否接受 SearchReplacePanel.tsx 的 hook composition shape 变化？**（即让所有外部消费者通过 8 个 domain hook 而非 32 个独立 hook 拿能力）—— 这是 P2-7 的**核心 visible 改动**。
3. **是否同意 stage 5a 单独 commit `applySearchPanelRunResults` 拆分**（780 行内部拆 4 sub-reducer，无 behavior change）作为 stage 5 的先决条件？

---

## Appendix A · 当前 38 hook 与目标域映射详表

（实施时按此映射搬迁；先做完域内合并，再做 `SearchReplacePanel.tsx` 改造）

```
useSearchPanelStore  (store-base, 6→1)
  ├─ useSearchPanelStoreState
  ├─ useSearchPanelLocalState
  ├─ useSearchPanelUiState
  ├─ useSearchPanelRuntimeRefs
  ├─ useSearchPanelDerivedState
  └─ useSearchPanelResetState

useSearchExecution  (execution, 8→1)
  ├─ useSearchPanelRunHandlers
  ├─ useSearchPanelLoadMoreHandlers
  ├─ useSearchFirstMatchSearch
  ├─ useSearchBatchControl
  ├─ useSearchSessionLifecycle
  ├─ useSearchPanelRestoreEffect
  ├─ useSearchPanelSnapshotPersistence
  └─ useSearchQueryOptions

useSearchNavigation  (navigation, 4→1)
  ├─ useSearchStepNavigation
  ├─ useSearchMatchNavigation
  ├─ useSearchResultFilterStepNavigation
  └─ useSearchApplyResultFilter

useSearchReplace  (replace, 1→1)
  └─ useSearchReplaceHandlers

useSearchPanelChrome  (chrome, 8→1)
  ├─ useSearchSidebarShellOptions
  ├─ useSearchSidebarShellProps
  ├─ useSearchSidebarFrame
  ├─ useSearchSidebarInteraction
  ├─ useSearchPanelShellEffects
  ├─ useSearchPanelViewProps
  ├─ useSearchPanelOverlayOptions
  └─ useSearchPanelOverlaysProps

useSearchInput  (chrome / input, 4→1)
  ├─ useSearchInputContextMenu
  ├─ useSearchInputInteractions
  ├─ useSearchPanelInputSupport
  └─ useSearchQuerySectionProps

useSearchResultPanel  (result-panel, 3→1)
  ├─ useSearchResultPanelState
  ├─ useSearchResultPanelControls
  └─ useSearchResultsViewport

useFilterRules  (filter-rules, 4→1)
  ├─ useFilterRuleEditorState
  ├─ useFilterRuleGroupPersistence
  ├─ useFilterRulesEditorOptions
  └─ useFilterRulesEditorProps
```

合计 38 → 8（store-base + 7 域）。

---

## Appendix B · apply*/resolve* 内联归属表

```
useSearchPanelStore 内联：
  └─ applySearchPanelErrorMessage  (19 lines)

useSearchExecution 内联：
  ├─ applySearchPanelRunResults                    (780, 需先在 stage 5a 拆 sub-reducer)
  ├─ applySearchPanelLoadMoreSessionResults        (188)
  ├─ applySearchPanelFirstMatchResult              (175)
  ├─ applySearchPanelCountResults                  (150)
  ├─ applySearchSessionRestoreResult               (99)
  ├─ applyFilterSessionRestoreResult               (84)
  ├─ resolveSearchPanelCachedRunHit                (155)
  ├─ resolveSearchPanelRunStartState               (133)
  ├─ resolveSearchPanelSessionStartState           (43)
  ├─ resolveSearchPanelFirstMatchState             (40)
  └─ resolveSearchPanelChunkState                  (29)

useSearchNavigation 内联：
  ├─ applySearchPanelResultFilterSelection         (145)
  ├─ applySearchPanelNavigationSelection           (133)
  ├─ applySearchPanelResultFilterStepSuccess       (118)
  ├─ applySearchPanelCursorStepResult              (82)
  ├─ resolveSearchPanelStepTargets                 (276)
  ├─ resolveSearchPanelStepAnchors                 (100)
  └─ resolveSearchPanelResultFilterKeyword         (25)

useSearchReplace 内联：
  ├─ applySearchPanelResolvedReplaceAllResult      (135)
  ├─ applySearchPanelResolvedReplaceCurrentResult  (136)
  ├─ applySearchPanelReplaceSearchGuard            (83)
  ├─ applySearchPanelReplaceSuccessEffects         (47)
  ├─ resolveSearchPanelReplaceState                (85)
  └─ resolveSearchPanelReplaceCurrentTargetState   (24)
```

`utils.tsx` / `types.ts` / `backendGuards.ts` / `build*Requests.ts` / `searchPanelStepGuards.ts` 等真正可复用的 plain-ts 保留不动（不是 reducer，不需要内联）。

---

## Appendix C · 启动前 checklist

- [ ] feature branch 已建（`refactor/p2-7-search-panel-consolidate`）
- [ ] `main` 干净（`git status` clean）
- [ ] baseline `tsc --noEmit` 通过
- [ ] baseline `vitest run SearchReplacePanel.test.tsx` 通过，记录 pass 数 X
- [ ] `npm run tauri dev` 跑得起来（搜索面板能开能搜）
- [ ] 团队 / 用户已同意第 9 节三个决策点
- [ ] 排期已确认 5+ 会话窗口
