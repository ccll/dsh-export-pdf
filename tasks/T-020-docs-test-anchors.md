---
doc-type: task
mutation: lifecycle
id: T-020
---

# T-020 文档、测试锚点与残留清理

状态: active
类型: 文档与测试证据同步
风险等级: major
风险面: 契约（sessionId 校验边界、测试锚点与 SOLUTION 陈述）
决策依据: 东家 2026-11-20 按审查推荐批准整改；本 task 只同步已批准修复的文档与测试证据，不新增产品承诺。

## 背景与目标

- 背景: 审查发现 CONVENTIONS 热加载清单不完整、SOLUTION 代码位置漏列核心模块且三处陈述强于实现、README 路线图漏 M-008/M-009、部分测试锚点虚标、`sessionId` 校验前先 trim、`messageText`/`resetCjkFontProbe` 无生产调用。
- 目标:
  - CONVENTIONS 明确只有 `PIPELINE_MODULES` 热加载，`errors.mjs`/`process.mjs` 等需要重启。
  - SOLUTION 补齐代码位置，修正 220mm/120mm、取消路径与“下载不会重新渲染”的表述。
  - README 双语路线图补 M-008/M-009，并保持与行为说明一致。
  - 移除虚标锚点、无调用 helper；`sessionId` 不再 trim，严格按契约字符集校验。
  - 测试锚点与 AC 实际断言对齐。
- 非目标: 不改变导出行为、HTTP 契约、错误码集合或 PDF 版式；不新增运行时依赖。

## 差距评估

- 文档: `CONVENTIONS.md` 的生效方式、`SOLUTION.md` 的模块代码位置与三处陈述、`README.md`/`README.zh-CN.md` 路线图与修复前状态不一致。
- 测试: `test/route.test.mjs::缺失或非法 sessionId 返回 400` 标了 R-01-007/AC-02、R-01-012/AC-01；`test/host.test.mjs` 标了 R-01-008/AC-01，但断言不覆盖对应 AC。R-01-007/AC-02 改由 `test/host.test.mjs::插件装载但未收到导出请求时不创建管线缓存目录` 与 `test/pipeline.test.mjs::创建加载器本身不产生缓存目录` 断言。
- 代码: `src/route.mjs:45` 先 trim 再校验；`src/transcript.mjs:76-81` 的 `messageText` 只被测试调用；`src/fonts.mjs:24-27` 的 `resetCjkFontProbe` 无调用。
- 影响面: CONVENTIONS、SOLUTION、README 双语、test/route、test/host、test/transcript、src/route、src/transcript、src/fonts。

## 收敛方案

1. 文档: 按当前实现改写，不留历史；README 双语同步。
2. 锚点: 从 route/host 测试移除未断言 AC，保留 e2e 的真实覆盖。
3. 代码清理: 删除 `messageText` 与 `resetCjkFontProbe`，测试改用 `messageParts`+`partsText`；路由移除 `sessionId.trim()` 并补前导空白 400 用例。
- 无分叉点: 均为已批准修复的文档与证据同步，不涉及新的行为选择。

## 测试计划

- `node --test test/route.test.mjs`、`test/host.test.mjs::插件装载但未收到导出请求时不创建管线缓存目录`、`test/transcript.test.mjs::图片与文件块降为占位符，文本块按顺序拼接`、`test/fonts.test.mjs`、`test/pipeline.test.mjs::创建加载器本身不产生缓存目录`。
- `tools/agentmap_lint.py::--report` 确认追溯矩阵无虚标、无 error。
- 全量单测、两套 e2e、`scripts/check.mjs::main`。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：文档/锚点调整后门禁仍通过 | `scripts/check.mjs::main`、全量单测 |
| 异常 | 适用：sessionId 前导空白按契约拒绝 | `test/route.test.mjs::缺失或非法 sessionId 返回 400` |
| 边界配置 | 适用：测试锚点与 AC 对齐、README 里程碑一致 | `tools/agentmap_lint.py::--report` |
| 副作用 | 适用：删除死代码不改变导出输出 | `test/transcript.test.mjs::图片与文件块降为占位符，文本块按顺序拼接`、`test/exporter.test.mjs::嵌入图片读取失败回退占位，不中断整份导出` |
| 兼容性 | 适用：HTTP 契约与文件名不变 | `test/route.test.mjs::缺失或非法 sessionId 返回 400`、两套 e2e |

## 自查清单

- [ ] 边界：sessionId 只接受契约字符集，前导空白 400；测试锚点不再虚标。
- [ ] 异常：删除 helper 后测试仍覆盖图片/文件占位；文档无残留旧结论。
- [ ] 回归：HTTP 契约、文件名、Markdown/PDF 输出不变；lint 无 error。

## 终态与证据

- 实现: 待补
- 测试: 待补
- SOLUTION 对照: 待补
- commit: 待补
