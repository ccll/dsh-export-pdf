---
doc-type: task
mutation: lifecycle
id: T-003
---

# T-003 用户消息右对齐的消息版式

状态: completed
类型: UI/UX 改进
风险等级: minor
风险面: 无（仅 PDF 版式呈现）
决策依据: 东家 2026-11-16 在 Tailscale 验收 PDF 后要求用户消息右对齐，参照 DSH 会话窗口；PRD 新增 R-01-009 与 M-004 承接。

## 背景与目标

- 背景: 当前 PDF 中用户与助手消息都从版心左侧起排，用户消息只有左侧竖线，长会话里不易区分；东家要求像 DSH 会话窗口一样把用户消息右对齐。
- 目标: 用户消息整块右对齐并带浅色底，助手回复左对齐；长消息在版心内换行，跨页续排不变。
- 非目标: 不改转录内容与顺序、不改路由/缓存/鉴权、不引入前端依赖、不改 PDF 页眉页脚。

## 差距评估

- 现状: `src/render.mjs` 的 `.entry.user` 仅给正文左边框，用户与助手都从版心左侧起排。
- 差距: 缺少右对齐与视觉区分；无对应 AC 与测试锚点。
- 影响面: 仅 `src/render.mjs` 样式与 PDF 词框断言；接口、缓存与日志行为不变。

## 收敛方案

- 用户消息块用块级 `width: fit-content; max-width: 82%; margin-left: auto` 右对齐，浅蓝底、圆角与内边距。
- 助手消息块用 `width: fit-content; max-width: 82%; margin-right: auto` 左对齐，保留左侧细线；工具调用保持整行左对齐。
- 角色标签随消息块对齐；正文保持左对齐与 `pre-wrap`，长串强制断行。
- 无分叉点: 东家已指定“右对齐、像 DSH 会话窗口”，气泡底色与圆角属实现自由，不另开候选。

## 测试计划

- 在 `test/pdf.test.mjs` 的真实 Chrome PDF 用例中加唯一标记，读取 `pdftotext -bbox`：用户标记词 xMin 明显大于助手标记词 xMin；正文最大 xMax 不超过版心右边界。
- 现有 60 段用户消息跨页断言继续覆盖 AC-03；另用 `pdftoppm` 生成第一页 PNG 目视检查。
- 目标 AC: R-01-009/AC-01、R-01-009/AC-02、R-01-009/AC-03。

## 终态与证据

- 实现: `src/render.mjs` 用户消息块用 `width: fit-content; max-width: 82%; margin-left: auto` 右对齐，浅蓝底与圆角；助手块 `margin-right: auto` 左对齐并保留左侧细线；工具调用整行左对齐；角色标签 `break-after: avoid`，避免页尾孤立“用户”标签。
- 测试: `pnpm test` 47 通过；`pnpm test:e2e` 两套通过。`test/pdf.test.mjs` 的真实 Chrome + `pdftotext -bbox` 断言用户标记 xMin=144.35、助手标记 xMin=56.41、用户角色标签 xMin=530.7、助手标签 xMin=45.0、maxRight=548.7<550；60 段用户消息跨 7 页，末段在末页且无孤立标签。Tailscale 实例下载 PDF 实测用户消息 xMin=449、助手 xMin=56。
- SOLUTION 对照: R-01-009/AC-01..03 均有实现与可执行锚点；仅渲染层样式变化，路由、缓存、鉴权、转录内容与 PDF 边界承诺不变；README 中英文已同步。
- commit: bdedb50
- review: 只读独立评审｜目的理解：用户消息右对齐、助手左对齐，长消息在版心内跨页续排、无越界或孤立标签（R-01-009/AC-01..03）｜结论：通过，无 blocking，2 条 non-blocking（e2e 末页守卫、bbox 余量/角色标签）已随 bdedb50 处置。
