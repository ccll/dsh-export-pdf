---
doc-type: task
mutation: lifecycle
id: T-012
---

# T-012 去掉助手回复左侧的整体竖线

状态: completed
类型: UI/UX 改进
风险等级: minor
风险面: 无（仅 PDF 版式呈现，不改接口、内容与文件名）
决策依据: 东家 2026-11-17 反馈：助手消息正文左侧那条长竖线，看起来像 Markdown 里的引用元素；它与正文内部的引用块叠加后不美观，要求去掉。

## 背景与目标

- 背景: `src/render.mjs` 的 `.entry.assistant .body` 用 `1.5pt` 左边线与 `3.5mm` 左内边距把助手正文整体框出，是 T-003 消息版式里的区分手段。T-010 让助手正文按 Markdown 渲染后，这条整体竖线与正文内部的引用块竖线同时出现，读起来像两层引用。
- 目标: 助手正文不再有整体左竖线，正文左缘与角色图标对齐；Markdown 引用块自己的竖线保留；用户消息的气泡、右对齐与双方区分不变。
- 非目标: 不改消息顺序、左右对齐承诺、82% 版心宽度、工具调用样式、图片模式与下载文件名；不引入依赖。

## 差距评估

- 现状: `src/render.mjs` 的 PAGE_STYLE 含 `.entry.assistant .body { border-left: 1.5pt solid #d0d0d0; padding-left: 3.5mm; }`。
- 差距: 助手正文的左侧多出一条与内容无关的长竖线；无“助手正文无整体竖线”的测试锚点。
- 影响面: 仅 `src/render.mjs` 的 PAGE_STYLE 与 `test/render.test.mjs`、`test/pdf.test.mjs`；路由、缓存、转录内容与 PDF 边界不变。

## 收敛方案

- 删除 `.entry.assistant .body` 的整条规则：左边线与左内边距都是为“整体框线”服务的，留内边距会留下无来由的缩进；正文左缘改由角色标注的图标承担。
- 保留 `.md blockquote` 的左边线，真实引用仍带竖线，避免把“去掉整体竖线”误做成“去掉引用样式”。
- 无分叉点: 东家诉求是去掉竖线；缩进随线一起移除属实现细节，不构成方案抉择。

## 测试计划

- `test/render.test.mjs`: 断言 PAGE_STYLE 不再给 `.entry.assistant .body` 加左边线与左内边距，同时 `.md blockquote` 仍保留左边线。
- `test/pdf.test.mjs`: 真实 Chrome 打印后用 `pdftotext -bbox` 断言助手正文首词贴着版心左边界（改动前比版心多出边线 1.5pt 与内边距 3.5mm，约 11pt），用户右对齐与右缘断言的现有口径不变。
- 目视: 用带标题、列表、引用、代码块与表格的样例渲染 PDF 并转 PNG，确认助手正文左侧没有长竖线、引用块竖线仍在。

## 终态与证据

- 实现: `src/render.mjs` 删除 PAGE_STYLE 中 `.entry.assistant .body` 的 `border-left: 1.5pt` 与 `padding-left: 3.5mm`，助手正文左缘与角色图标对齐；`.md blockquote` 的引用竖线、用户气泡与右对齐不变。实现提交 ec4b375。
- 测试: `pnpm verify` 通过（build:client、check、`node --test` 80 通过、e2e pdf-export 与 pdf-failure 均 PASS）；`agentmap_lint --report` 通过。真实 Chrome 打印后 `pdftotext -bbox`：助手首词 xMin 45.00（版心左缘 45.35，容差 1.5）；把规则临时加回时测得 56.41，两条新断言均按预期失败。样例 PDF（标题/列表/引用/代码块/表格）转 PNG 目视：`/tmp/dsh-sample/before-1.png`（改前，整条消息带左侧长竖线）与 `/tmp/dsh-sample/final-1.png`（改后，外层竖线消失、引用块竖线仍在）。
- SOLUTION 对照: R-01-009 只承诺用户右对齐、助手左对齐与版心内换行，未承诺助手正文的左侧细线；对齐、82% 版心宽度与跨页续排不变，SOLUTION、README 与 PRD 无需改动。
- commit: ec4b375
- review: 独立只读评审（openai/gpt-5.6-luna 子代理，独立上下文）｜目的理解：确认 ec4b375 只移除助手正文外层左竖线，保留 Markdown 引用块竖线、用户右对齐、82% 版心与跨页续排｜结论：通过，blocking 0；3 条 non-blocking——CSS 断言只证明样式串不证明渲染结果、bbox 45.35pt 阈值对字体与 Chrome 版本敏感、目视证据未随附（已补进上面 测试 行）。
