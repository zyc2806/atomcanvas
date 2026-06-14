# AtomCanvas UX 改造:Selection → Style 连续工作流

- **Date:** 2026-06-14
- **Status:** Approved (design), ready for implementation plan
- **Scope:** Frontend only (React 19 + TypeScript + MUI v7 + Zustand + R3F). No backend changes.

## 背景与问题

AtomCanvas 的 viewer 功能已恢复完整(Style / Bonds / Scene / Selection 四个右侧抽屉面板)。
本次目标是让**操作流程更符合直觉、降低学习成本**。与用户确认的痛点(全部命中):

- **A. 发现性差** —— 四个面板挤在右上角纯图标里,快捷键只在 tooltip,新用户不知道有这些功能。
- **B. "Advanced Selection" 开关藏一切** —— 默认关闭时整块高级选择 UI(表达式 + 10 个方法)都不可见。
- **C. 10 个 tab 横向滚动** —— Element/Label/Position/Slab/Sphere/Bonded/Percentile/Extend/Special/Connected 一字排开需要滚动,看不全、找不到。
- **D. 每个 tab 重复 4 个操作按钮** —— Replace/Add/Filter/Exclude 在 10 个方法里各抄一遍。
- **E. 操作后反馈弱** —— 除顶部计数外,多数动作完成后无明确提示。
- **F.(用户主诉)选完原子改颜色还得切面板** —— 选择在 Selection 面板、改色在 Style 面板,select→recolor 循环被打断。

## 目标 / 非目标

**目标**
- 选中原子后,常用外观动作(改色/改大小/隐藏)零面板切换即可完成。
- Selection 面板一屏可见全部方法,无横向滚动、无 all-or-nothing 开关、无重复操作按钮。
- 关键动作有即时反馈。
- 顶栏面板入口可读(非纯图标)。

**非目标**
- 不改后端、不改 selection 表达式解析语义(沿用现有 `selectionService`)。
- 不重写 3D 渲染管线。
- 不做面板合并(用户已否决"合并 Selection+Style"方案 C);Style 面板保留用于精细逐元素样式。

## 设计

六个独立单元,各有单一职责;尽量复用现有 store setter,保证可单独测试。

### ① 浮动选择操作条 `SelectionActionBar`(治 F,核心)

- **新组件**,DOM 覆盖层(非 R3F),由 `App.tsx` 渲染在 `ViewerCanvas` 之上、视口底部居中。
- **可见性**:仅当 `selectedAtoms.length > 0` 时显示;选区清空即消失。与当前打开哪个面板无关。
- **动作**(全部写入已有 store 状态,天然进 undo/redo 历史):
  - **颜色**:色块 → 取色 popover → 对每个选中 index 写 `colorOverrides`。
  - **大小**:− / + → 对选中 index 调整 `radiusOverrides`(复用既有 resize-selected 能力 #5)。
  - **隐藏 / 显示**:对选中 index 把 `opacityOverrides` 设为 0(再点恢复,即移除这些 index 的 opacity override)。
  - **清除选择**:`updateSelection([], 'replace')`。
  - **聚焦相机(可选 / stretch)**:缩放/平移到选区中心。需先确认相机控制 API;**不阻塞主线**,缺失则本轮不做。
- **接口**:只读 `selectedAtoms`,调用 store 的 `setColorOverrides / setRadiusOverrides / setOpacityOverrides / updateSelection`。不持有业务逻辑分支以外的本地状态(仅 popover 开合等 UI 态)。

### ② 共享操作模式 `OperationModeSelector`(治 D)

- Replace/Add/Filter/Exclude 抽成 Selection 面板顶部的 **segmented control**;当前模式提升为 `SelectionPanel` 的单一状态。
- 各方法子组件不再各自渲染 4 个按钮,改为:渲染自己的输入 + 一个"应用"按钮(或回车),应用时读取当前共享模式。
- `processSelection` / `combineExpressions` 现有逻辑保留;仅改"模式从哪来"(从共享状态而非每按钮硬编码)。

### ③ 方法平铺格子(治 C)

- 用一个**换行 chip 网格**替换 `<Tabs variant="scrollable">`,10 个方法一屏全可见。
- 选中某 chip → 下方渲染该方法的输入区(替代当前 `TabPanel`)。
- 10 个方法的输入逻辑沿用现有组件(SphereTab / BondedTab / … 及内联的 Element/Label/Position/Slab),仅去掉各自的 4 按钮(交给 ②)。

### ④ 去掉 Advanced 开关 + 表达式降级为可折叠高级区(治 B)

- 移除 `advancedSelection` 开关;方法格子常驻显示。
- 现"表达式输入 + AST 树"(`SelectionInput`)移入 Selection 面板底部 `▸ Expression (advanced)` 折叠区(默认收起)。
- 表达式框继续实时反映 chip 操作生成的表达式(`selectionExpression`),兼作过程反馈。
- 注意保留现有副作用:原 `advancedSelection` 的 effect 管理 `selectionMode`('single'/'slab'/'disabled')、`colorOverrides`、`clusterIndices`、`slabTarget`。去掉开关后,这些需迁移为"按当前选中的方法"驱动(例如选中 Slab 方法 → `selectionMode='slab'`),不能丢。

### ⑤ 顶栏面板按钮加文字标签(治 A)

- `TopBar` 的四个 IconButton 改为带文字:`🎨 Style / 🔗 Bonds / 🎛 Scene / ▣ Select`。
- 保留 tooltip 里的快捷键提示与 `aria-label`、active 高亮。

### ⑥ 动作后 toast 反馈(治 E)

- **新组件** `Toaster`(MUI `Snackbar`)+ UI slice 增一个轻量 `notify(message)` / `notification` 状态。
- 在选择、改色、改大小、隐藏等动作后触发短提示,如 "已选中 12 个原子" / "已隐藏 12 个原子"。
- 单一出口,组件只订阅 `notification` 渲染,避免散落的 alert。

## 受影响文件(预估)

| 单元 | 文件 |
|------|------|
| ① 浮动条 | 新增 `components/overlay/SelectionActionBar.tsx`(+test);`App.tsx` 挂载 |
| ② 操作模式 | 新增 `components/panels/selection/OperationModeSelector.tsx`;`SelectionPanel.tsx` 持有状态;各 `tabs/*Tab.tsx` 去掉自带按钮 |
| ③ 方法格子 | `SelectionPanel.tsx`(Tabs → chip grid) |
| ④ 表达式折叠 | `SelectionPanel.tsx`;复用 `selection/SelectionInput.tsx` |
| ⑤ 顶栏标签 | `components/shell/TopBar.tsx` |
| ⑥ toast | 新增 `components/shell/Toaster.tsx`(+test);`store/slices/createUISlice.ts` 增 `notification`/`notify`;`App.tsx` 挂载 |

## 关键技术风险

**`colorOverrides` 合并冲突**:浮动条(①)与 Style 面板都会写 `colorOverrides` / `opacityOverrides`。`StylePanel` 用 `perAtomColorRef` / `perAtomOpacityRef` 防止"按元素改色"覆盖逐原子色。浮动条改色必须正确接进这套 per-atom 合并逻辑,否则之后在 Style 面板改元素色会冲掉浮动条设的色。实现时需:浮动条写入后,StylePanel 的 ref 能感知到最新 per-atom override(或将 per-atom override 的"真相源"统一到 store,StylePanel 从 store 读而非仅靠本地 ref)。**此点需专门测试覆盖。**

## 测试策略

- 沿用 Vitest + Testing Library;每个新组件配 `*.test.tsx`。
- ①:有/无选区时浮动条出现/消失;点颜色/大小/隐藏后对应 override 正确写入选中 index;清除选择生效。
- ②:切换模式后,任一方法应用走对应 Replace/Add/Filter/Exclude 分支。
- ③:全部 10 个方法 chip 可见;点击切换输入区。
- ④:无 Advanced 开关后,选 Slab 方法时 `selectionMode` 正确切到 'slab';表达式折叠区可展开且实时反映表达式。
- ⑥:动作触发 `notification`,Snackbar 渲染对应文案。
- 回归:浮动条改色 + Style 元素改色 不互相覆盖(对应"关键技术风险")。
- 绿门:`tsc -b` + `eslint .` + `vite build` + 全量 vitest,每步保持。

## 实施顺序建议

1. ⑤ 顶栏标签 + ⑥ toast 基建(小、独立,先铺反馈通道)。
2. ② 共享操作模式 + ③ 方法格子 + ④ 去开关/表达式折叠(Selection 面板重构,一组)。
3. ① 浮动操作条(依赖反馈通道,且需处理颜色合并风险,放最后单独攻坚)。
