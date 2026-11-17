---
doc-type: task
mutation: lifecycle
id: T-010
---

# T-010 PDF 正文 Markdown 渲染

状态: completed
类型: UI/UX 改进
风险等级: major
风险面: PDF 正文版式、不可信文本的安全转换与既有纯文本断言
决策依据: C-008；东家要求所有 Markdown 内容显示渲染后的格式，而不是原始标记文本。

## 背景与目标

- 背景: `src/render.mjs` 目前把用户与助手文本整体 `escapeHtml` 后放进 `white-space: pre-wrap` 容器；标题、列表、代码块、表格与行内强调都保留原始标记。
- 目标: 用户与助手正文先经安全 Markdown 子集转换为受控 HTML；代码/原始 HTML 不进 DOM 执行，危险链接与外部图片不进入 PDF。
- 非目标: 不引入运行时依赖，不做语法高亮，不执行原始 HTML，不抓取 Markdown 图片 URL，不改变工具摘要、图片附件、文件名与缓存。

## 差距评估

- 现状: 无 Markdown 解析器；`renderBody` 只区分文本与图片分段，文本全部转义。
- 差距: 无块级/行内解析、无 Markdown 样式、无安全链接与图片占位测试。
- 影响面: `src/markdown.mjs`（新增）、`src/html.mjs`（提取转义函数）、`src/render.mjs`、PAGE_STYLE、测试、README、PRD/SOLUTION/DOMAIN/C-008。

## 收敛方案

- 块级: 标题、无序/有序列表、引用、围栏代码（含语言标记但不高亮）、GFM 表格、分隔线、段落；未识别的标记按普通文本。
- 行内: 加粗、斜体、删除线、行内代码、链接、Markdown 图片占位；代码片段先占位，避免强调解析破坏代码。
- 扩展: 嵌套列表、任务清单、Setext 标题、尖括号自动链接与反斜杠转义按 Markdown 语义处理；复杂 GFM（脚注、嵌套引用等）不在子集内。
- 安全: 所有文本先转义；链接仅允许 `http:`、`https:`、`mailto:`，其余只显示文字；原始 HTML 按文本转义；Markdown 图片不读取 URL，只显示 `[图片: alt]`。
- 渲染: `renderBody` 对文本分段调用 Markdown 渲染，图片分段仍走 data URI；`.body` 改为正常 HTML 流，工具摘要保留 `pre-wrap`。
- 样式: 标题、列表、引用、代码块、表格、链接、分隔线在 A4 版心内可读；代码块允许跨页，避免整块强制上移。
- 无分叉点: 东家诉求明确；无依赖子集与 marked 的取舍已在 C-008 记录。

## 测试计划

- Markdown 单测: 标题、列表、引用、围栏代码、表格、分隔线、段落；加粗、斜体、删除线、行内代码、链接；原始 HTML/脚本转义；危险协议与 Markdown 图片不生成外部资源；纯文本换行。
- 渲染单测: 文本分段经 Markdown、图片分段仍内联、工具摘要不渲染 Markdown。
- 真实 Chrome: Markdown 标题/列表/代码/表格进入 PDF 文本层，代码中的标签以文本呈现，不产生执行或外部请求。
- e2e: 既有选择/图片/移动端路径不回归；不新增 Markdown 专属 UI。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：块级与行内 Markdown 进入 PDF | `test/markdown.test.mjs::R-01-014/AC-01`、`test/markdown.test.mjs::R-01-014/AC-02` |
| 异常 | 适用：代码中的脚本/HTML 只显示文本 | `test/markdown.test.mjs::R-01-014/AC-03` |
| 边界配置 | 适用：纯文本换行与空文本 | `test/markdown.test.mjs::R-01-014/AC-06` |
| 副作用 | 适用：工具摘要不渲染、图片分段不抓 URL | `test/markdown.test.mjs::R-01-014/AC-05`、`test/render.test.mjs::R-01-010/AC-01` |
| 安全 | 适用：危险协议链接只显示文字 | `test/markdown.test.mjs::R-01-014/AC-04` |
| 兼容性 | 适用：既有 PDF/e2e 与 A4 分页不回归 | `test/pdf.test.mjs::R-01-005/AC-02`、`e2e/specs/pdf-export.mjs::R-01-005/AC-02` |

## 自查清单

- [x] 边界：空文本、纯文本、连续空行、超长代码块与表格不产生空段落或越界；真实 PDF 单页覆盖标题/列表/代码/表格，跨页表头列为残余。
- [x] 异常：原始 HTML/脚本、安全协议、Markdown 图片地址均按文本/占位处理，不执行、不抓取。
- [x] 回归：工具摘要、图片分段、A4 分页、中文、文件名与选择/图片模式不变。
- [x] 交互：无新增 UI；预览、下载与移动端入口不受影响。
- [x] 安全：链接只生成白名单协议，属性全部转义，外部资源不被读取。

## 终态与证据

- 实现: `src/html.mjs` 收口 HTML 转义；`src/markdown.mjs` 做无依赖安全 Markdown 子集（标题/嵌套列表/任务清单/引用/围栏代码/表格/分隔线/Setext/段落，加粗/斜体/删除线/行内代码/链接/自动链接/图片占位，原 HTML 转义、危险协议只留文字、图片不抓 URL）；`src/render.mjs` 接入文本分段与 A4 Markdown 版式；工具摘要保持原文，图片分段仍走 data URI。实现提交 `cee5e00`，复审修复 `5729895`/`84d1880`/`07a1a50`。
- 测试: `pnpm verify` 通过——79 项单测（Markdown 10 项、真实 Chrome 4 项，含标题/列表/代码/表格文本层与危险协议/图片地址断言）；两套 e2e 通过（桌面 iframe、720/721 窄视口、同源打开、失败无入口、选择/图片模式）；`pnpm check` 通过。正式服务重启后当前会话导出 24 页 A4，标题/段落/链接按版式显示，未出现原始 `#`/`**` 标记。
- SOLUTION 对照: R-01-014 AC-01..06 与 SOLUTION 核心不变量、DOMAIN Markdown 渲染/图片占位、C-008 一致；R-01-013 窄视口与 R-01-002 桌面 iframe、R-01-010 工具摘要、R-01-012 图片分段均不回归；`核对日期` 与实现位置 `src/markdown.mjs`/`src/html.mjs`/`src/render.mjs` 已同步，未发现残留差异。
- commit: 07a1a50
- review:
  - 审核方: code-review skill 双轴独立子代理（Standards 1728f9ff / Spec 55dc8e70），复审由同一审核方执行
  - 目的理解: 将不可信会话正文按安全 Markdown 子集渲染为受控 HTML，让 PDF 显示标题、列表、代码、表格与行内格式，同时不执行原始 HTML、不抓取外部图片、不放行危险协议；工具摘要、图片附件、A4 分页与既有选择/移动端路径不变。
  - 问题与修复: 首轮 Standards blocking 2 条（围栏 info 含空格无法识别、AC-05 证据虚挂在 render 测试）已修；Spec non-blocking 5 条（AC-06 空格折叠、PDF 安全证据、Setext/任务清单/自动链接/反斜杠范围、强调 flanking、图片冒号/表格管道）已处置。复审又发现两条 blocking——缩进列表续行被吞、下划线强调闭合定界符缺失——在 84d1880/07a1a50 修复，并补 `  - a
  b`、`__粗体__`、`这是__重点__。` 等回归断言；`replaceLinks` 无闭合 `[` 一次跳出，40k `[` 约 2ms。最终两轴确认 blocking 清零。
  - 复审结论: Standards 与 Spec 均判定通过、无 blocking；残余为真实 PDF 单页覆盖、跨页表头/复选框字形、代码 span 内裸管道、`[a](` 未闭合括号 O(n²) 与复杂 GFM 不支持，不阻断关闭。
