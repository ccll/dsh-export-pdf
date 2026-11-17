---
doc-type: task
mutation: lifecycle
id: T-015
---

# T-015 嵌入原图覆盖 Markdown 本地图片

状态: active
类型: 功能
风险等级: major
风险面: 契约（PDF 内容新增消息正文里 Markdown 本地图片的嵌入）
决策依据: C-010（扩展范围）、C-011（读取口径修订）；东家 2026-11-17 拍板选 A 口径——扩展「嵌入原图」，同时覆盖上传附件与消息正文里 Markdown 引用的本地图片。

## 背景与目标

- 背景: 东家在 PDF 视图页把图片模式选成「嵌入原图」，导出结果仍是 `[图片: 改前第 1 页]` 占位。
- 根因: 那两张截图是助手用 Markdown 语法引用的本地文件（`![改前第 1 页](</tmp/dsh-sample/before-1.png>)`），不是消息里的附件图片块；嵌入模式只处理附件引用，Markdown 图片按 R-01-014/AC-05 固定渲染成占位文字。
- 目标: 嵌入原图模式把消息正文里 Markdown 引用的本地图片也嵌入 PDF，与聊天界面显示本地图片的行为对齐。
- 非目标: 不抓取 http、https 远程图片；不导出工具结果里的图片；不改变占位与不导出模式的文本占位；不改变 HTTP 契约、错误码与文件名后缀。

## 差距评估

- 现状: `src/transcript.mjs` 只为消息里的图片块产生引用；`src/images.mjs` 只解析附件引用；`src/markdown.mjs` 对 Markdown 图片一律输出 `[图片: alt]`；宿主未把文件服务注入导出器。
- 差距: 本地路径没有解析入口，也没有经宿主权限策略读取的通道；PRD 的 R-01-012/AC-03、AC-06 与 R-01-014/AC-05 只承诺附件与占位。
- 影响面: `src/images.mjs`、`src/markdown.mjs`、`src/render.mjs`、`src/exporter.mjs`、`src/host.mjs`、`src/page-style.css`、PRD、SOLUTION、DOMAIN、README、测试；导出结果按同一份会话日志复现，嵌入模式位图数 0 → 4。

## 收敛方案

- 解析入口: `resolveMarkdownImages` 扫消息正文的 Markdown 图片地址，按地址去重。
- 地址筛选: 只接受图片扩展名（`png`、`jpg`、`jpeg`、`webp`、`gif`）与本地路径（绝对路径或相对会话工作区）；http、https、`data:`、`file:` 等协议地址与远程地址返回占位。
- 读取通道: 宿主把 `ctx.fs`（`resolve`、`lstat`、`readBytes`）包成 `readLocalImage` 注入导出器；读取权限与聊天界面 `/api/file` 一致——宿主沙箱只约束写入，两侧都用 `lstat` 拒绝最终符号链接（C-011）。
- 读取上限: 取 `ctx.attachments.imageLimits.maxImageBytes`；宿主没有文件服务时只影响本地图片嵌入，导出照常。
- 类型判定: 以字节嗅探 PNG/JPEG/GIF/WebP 为准，扩展名只做读取前筛选；嗅探失败按占位回退。
- 渲染: `images.mjs` 产出「地址 → data URI」索引，`render.mjs` 把它转成 `renderImage` 回调，`markdown.mjs` 命中时输出 `<span class="md-inline-image"><img></span>`，否则保留 `[图片: alt]`。
- 版式: 内联图片宽度不超过消息气泡，最高 220mm，并加 `page-break-inside: avoid`。
- 边框: 与附件图片共用 0.3mm 灰色边框，视觉上不区分来源。
- 失败语义: 单张读取失败、非图片字节或超限记录日志（只带文件名）并回退 `[图片: alt]`。
- 失败隔离: 单图失败不中断整份导出，其余文字与图片照常输出。
- 缓存: 沿用「会话标识 + 选择 + 图片模式 + 日志长度 + 样式版本」键；日志增长或选择变化即失效。
- map 演进: PRD R-01-012 陈述、AC-03、AC-06、新增 AC-07 与 R-01-014/AC-05 改写；SOLUTION 契约、不变量、失败语义、外部集成、安全边界与技术选型同步；DOMAIN 把「Markdown 图片占位」改为「Markdown 图片」并新增「本地图片」。

## 测试计划

- 单测: 地址筛选与字节嗅探（`test/images.test.mjs`）；渲染上下文替换占位（`test/markdown.test.mjs`）；导出器解析、去重、回退与缓存（`test/exporter.test.mjs`）；宿主读取器的路径、上限与非常规文件（`test/host.test.mjs`）。
- 真实打印: 临时目录写 PNG，嵌入后 `pdfimages` 出现位图且文本层无占位；删图后位图数为 0 且文本层为 `[图片: alt]`（`test/pdf.test.mjs`）。
- 回归: merge-base 基线的 101 个单测与两套 e2e 全绿；本次新增用例后共 117 个单测，placeholder/none 模式的占位行为与文件名后缀不变。
- 人工: 用东家报告的会话日志复现，嵌入模式位图 0 → 4，占位模式与改动前同字节；样例页目视图片按气泡宽度显示、不越出页面。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：本地图片可读时嵌入原图并按版心缩放 | `test/exporter.test.mjs::嵌入原图同时嵌入 Markdown 本地图片，占位与不导出模式不读取`、`test/pdf.test.mjs::真实浏览器打印：注入的 Markdown 本地图片进入 PDF，缺图回退占位文字` |
| 异常 | 适用：读取失败、非图片字节、远程地址与协议地址都回退占位 | `test/images.test.mjs::本地图片读取失败、非图片字节或相对路径无工作区时跳过并记录日志`、`test/exporter.test.mjs::Markdown 本地图片读取失败回退占位文字，相对路径按会话工作区解析` |
| 边界配置 | 适用：扩展名白名单、尖括号含空格地址、相对路径需要工作区、图片大小上限与空文件 | `test/images.test.mjs::图片媒体类型按字节嗅探，扩展名只做读取前筛选`、`test/markdown.test.mjs::尖括号包裹的目标地址保留空格，代码块与行内代码里的图片语法不扫描`、`test/images.test.mjs::相对路径按会话工作区读取`、`test/host.test.mjs::本地图片读取器把宿主超限与空文件错误原样交给调用方` |
| 副作用 | 适用：占位与不导出模式不读文件，文件服务缺失不阻止导出 | `test/exporter.test.mjs::嵌入原图同时嵌入 Markdown 本地图片，占位与不导出模式不读取`、`test/images.test.mjs::没有本地图片读取器时返回空索引，不报错` |
| 安全 | 适用：只读、限图片字节、不抓远程地址、日志不带完整路径 | `test/images.test.mjs::Markdown 本地图片解析为 data URI，按地址去重且不读远程地址`、`test/images.test.mjs::本地图片读取失败、非图片字节或相对路径无工作区时跳过并记录日志` |
| 兼容性 | 适用：协议、状态码、文件名后缀与占位文字不变 | `test/route.test.mjs::GET 成功返回 PDF 与 inline 文件名`、`test/exporter.test.mjs::图片三模式独立缓存：占位不读图，嵌入读图，失败回退占位`、`e2e/specs/pdf-export.mjs::R-01-012/AC-05` |

## 自查清单

- [x] 边界: 尖括号包裹的目标地址（含空格路径）、带查询串/片段、相对路径有/无会话工作区、非图片扩展名、UNC 与控制字符、最终符号链接都验证过。
- [x] 异常: 读取失败、字节嗅探失败、宿主文件服务缺失、大小上限未配置都有明确回退或失败，不中断导出。
- [x] 回归: 占位与不导出模式、附件图片嵌入、文件名后缀、协议参数守卫与既有 PDF 版式断言不变。
- [x] 安全: 只走宿主文件服务，只读、限图片字节、不抓 http/https，日志只记文件名。
- [x] 卫生: 真实打印用例的临时文件在用例结束删除；未改动会话日志与导出缓存键语义。

## 终态与证据

- 实现: 待补
- 测试: 待补
- SOLUTION 对照: 待补
- commit: 待补
