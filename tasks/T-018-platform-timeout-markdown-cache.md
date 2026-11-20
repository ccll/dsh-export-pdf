---
doc-type: task
mutation: lifecycle
id: T-018
---

# T-018 跨平台探测、导出时限与 Markdown/缓存健壮性

状态: completed
类型: 健壮性与跨平台修复
风险等级: major
风险面: 契约（新增 `exportTimeoutMs` 总时限与 500 render 失败语义）；安全（不可信会话内容的扫描与递归边界）
决策依据: 东家 2026-11-20 按审查推荐批准整改；不引入运行时依赖，沿用现有错误码与 500 失败映射。

## 背景与目标

- 背景: 审查发现字体探测在 Windows/macOS 可能误判、浏览器只探 PATH、读取与图片解析没有总时限、Markdown 链接扫描为二次方且深层引用会 RangeError、图片回退结果会被缓存、缓存没有字节上限。
- 目标:
  - 字体先问 fontconfig，未命中时继续扫描目录，并识别 Windows/macOS 常见文件名。
  - 浏览器先探平台标准安装位置，再探 PATH。
  - 新增 `exportTimeoutMs`，覆盖读日志、图片解析与打印；超时以 500 `render` 结束并清理单飞表。
  - Markdown 链接改线性扫描，引用递归加上限。
  - 图片读取失败降级的 PDF 不缓存并清除同键旧缓存；缓存增加 128 MiB 字节预算。
  - 路由校验导出结果形状，宿主统一兜底未分类异常并记录 cause 链。
- 非目标: 不改变 HTTP 状态码/错误码集合、文件名、PDF 版式与图片三模式语义；不引入新的运行时依赖。

## 差距评估

- 字体: `src/fonts.mjs:8` 白名单漏 `msyh`/`msjh`/`wqy` 等；`src/fonts.mjs:38-42` 在 `fc-list` 成功但为空时直接否定，不再扫描。
- 浏览器: `src/chrome.mjs:21-35` 只探 PATH，macOS/Windows 标准安装默认 503。
- 时限: `src/exporter.mjs` 只有 Chrome 打印超时；读取与图片解析卡住会永久占用单飞表。
- Markdown: `src/markdown.mjs:247-285` 每个未闭合 `[` 扫到末尾；`src/markdown.mjs:133-141` 引用递归无上限。
- 缓存: `src/exporter.mjs:117-118` 单图失败仍按正常结果缓存；`src/exporter.mjs:139-147` 只限条数。
- 兜底: `src/host.mjs:118` 的 `exporterFor` 在 try 外，异常会落到宿主 400；`src/host.mjs:71` 只记 message，丢 cause 链。
- 影响面: `src/fonts.mjs`、`src/chrome.mjs`、`src/config.mjs`、`src/exporter.mjs`、`src/images.mjs`、`src/markdown.mjs`、`src/route.mjs`、`src/host.mjs`、SOLUTION、README 与测试。

## 收敛方案

1. 字体: `probeOnce` 仅在 fontconfig 命中时直接返回 true，否则扫描目录；文件名正则补 Windows/macOS/Linux 实际名称。
2. 浏览器: `resolveBrowserPath` 增加平台、环境、可执行判定注入；探测顺序为配置路径 → 标准安装位置 → PATH。
3. 时限: `config.mjs` 增加 `exportTimeoutMs`（缺省 120000 与 `timeoutMs` 的较大者，1–600000，显式值不得小于 `timeoutMs`）；`createExporter` 以绝对 deadline 给读日志、单飞等待与渲染任务分别加剩余时限，超时抛 `RenderFailedError('导出超时')`。
4. Markdown: 预计算最近 `]` 与括号配对；引用递归上限 32，超过按段落呈现。
5. 缓存: `resolveEmbeddedImages`/`resolveMarkdownImages` 用不可枚举 `degraded` 标记回退；降级 PDF 不缓存并清同键旧条目；缓存条目记录字节，超出 128 MiB 按 LRU 淘汰。
6. 兜底: 路由校验结果形状；宿主 fetch handler 包 try/catch，`logError` 展开 cause 链。
- 无分叉点: 东家已批准推荐方案；新增 `exportTimeoutMs` 沿用现有 500 `render` 错误码，不新增公开错误码；不引入 `@deepseek-ai/schemastery` 等运行时依赖。

## 测试计划

- 字体: `test/fonts.test.mjs::常见中文字体文件名可被识别` 覆盖 Windows/macOS/Linux 常见文件名。
- 浏览器: `test/chrome.test.mjs::macOS 标准安装路径无需配置 browserPath 即可被发现` 注入平台/环境/可执行判定，覆盖 macOS、Windows、Linux 与配置优先。
- 时限: `test/exporter.test.mjs::导出超时返回渲染失败，后续请求可重新开始` 覆盖超时后单飞表可继续。
- Markdown: `test/markdown.test.mjs::40KB 未闭合的链接目标不会让扫描退化为二次方`、`test/markdown.test.mjs::深层引用块不会因递归耗尽调用栈` 与 `test/markdown.test.mjs::列表与引用交替嵌套不会耗尽调用栈`。
- 缓存: `test/exporter.test.mjs::缓存按字节上限淘汰最久未使用结果` 与 `test/exporter.test.mjs::图片读取失败降级的 PDF 不缓存，恢复后重新读取` 覆盖字节预算与降级不缓存。
- 结果形状: `test/route.test.mjs::导出结果形状非法时返回 500 render` 覆盖非法导出结果返回 500 render。
- 回归: 全量单测、两套 e2e、`scripts/check.mjs`、AgentMap lint。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：字体/浏览器探测与正常导出路径 | `test/fonts.test.mjs::常见中文字体文件名可被识别`、`test/chrome.test.mjs::macOS 标准安装路径无需配置 browserPath 即可被发现`、`test/exporter.test.mjs::渲染失败不缓存，下一次请求重试` |
| 异常 | 适用：超时、图片读取失败、非法导出结果 | `test/exporter.test.mjs::导出超时返回渲染失败，后续请求可重新开始`、`test/exporter.test.mjs::读取会话卡住也受导出总时限约束`、`test/route.test.mjs::导出结果形状非法时返回 500 render` |
| 边界配置 | 适用：字体文件名、平台标准路径、导出时限上下限 | `test/fonts.test.mjs::常见中文字体文件名可被识别`、`test/chrome.test.mjs::macOS 标准安装路径无需配置 browserPath 即可被发现`、`test/config.test.mjs::缺省配置与 SOLUTION 的配置表一致` |
| 副作用 | 适用：缓存字节淘汰、降级结果不缓存、单飞清理 | `test/exporter.test.mjs::缓存按字节上限淘汰最久未使用结果`、`test/exporter.test.mjs::图片读取失败降级的 PDF 不缓存，恢复后重新读取`、`test/exporter.test.mjs::导出超时返回渲染失败，后续请求可重新开始` |
| 性能 | 适用：Markdown 对抗输入不再二次方 | `test/markdown.test.mjs::40KB 未闭合的链接目标不会让扫描退化为二次方` |
| 安全 | 适用：深层引用不耗尽调用栈 | `test/markdown.test.mjs::未闭合的链接目标不会让扫描退化为二次方` 2 万层引用用例 |
| 兼容性 | 适用：原有 HTTP 契约、图片模式与 PDF 输出不变 | `test/route.test.mjs::导出结果形状非法时返回 500 render`、`test/pdf.test.mjs::真实浏览器打印：A4、多页、中文字形与转录内容正确`、两套 e2e |

## 自查清单

- [x] 边界：字体空结果继续扫描；标准安装路径优先于 PATH；导出时限 1–600000 且显式值不小于 `timeoutMs`。
- [x] 异常：超时清理单飞表；降级结果不缓存；非法导出结果返回 500 render。
- [x] 回归：HTTP 契约、文件名、图片三模式、Markdown 既有用例与 e2e 不变。

## 终态与证据

- 实现: 字体探测在 fontconfig 未命中/空结果/不可用时继续扫描目录，并补 Windows/macOS/Linux 常见文件名；浏览器先探平台标准安装位置再探 PATH；新增 `exportTimeoutMs`（缺省取 max(120000, timeoutMs)，显式值不得小于 `timeoutMs`）以绝对 deadline 约束读日志、单飞等待与渲染；Markdown 链接扫描改线性并加块级递归预算；缓存增加 128 MiB 字节预算、降级 PDF 不缓存并清同键旧条目；路由拒绝非法形状与零字节 PDF，宿主兜底未分类异常并展开 cause 链。
- 测试: 全量 `node --test test/*.test.mjs` 136 通过 0 失败；`test/fonts.test.mjs` 1、`test/chrome.test.mjs` 6、`test/config.test.mjs` 3、`test/markdown.test.mjs` 16、`test/exporter.test.mjs` 26、`test/route.test.mjs` 13 通过；`node scripts/check.mjs` 通过；`node e2e/run.mjs` 两套 PASS。
- SOLUTION 对照: SOLUTION 的运行时/失败语义、外部集成、配置表、缓存生命周期与代码位置已同步；`exportTimeoutMs` 与 `timeoutMs` 的顺序、超时仍可能占用并发槽的边界已写明；HTTP 状态码/错误码、文件名与图片模式未变。
- commit: 1cac2f6
- review:
  - 审核方: `review-host`（独立子代理，双轴审核）
  - 目的理解: 核验跨平台探测、导出总时限、Markdown 与缓存修复是否解决审查发现，同时不破坏既有导出契约与配置兼容。
  - 问题与修复: 无 blocking。non-blocking 为列表/引用交替嵌套仍可溢出（已加块级总深度预算并补三组 4000 层用例）、超时不取消底层任务且可能占槽（已强制 `exportTimeoutMs≥timeoutMs` 并改文档）、timer unref 依赖测试环境（已移除并补 readSession 卡住用例）、字体空结果/host catch 缺口与缺省值双定义（登记为残余）。
  - 复审结论: 探测、时限、扫描与缓存语义自洽，无 blocking；残余风险已文档化。
