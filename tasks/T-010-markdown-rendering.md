---
doc-type: task
mutation: lifecycle
id: T-010
---

# T-010 PDF 正文 Markdown 渲染

状态: active
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

- [ ] 边界：空文本、纯文本、连续空行、超长代码块与表格不产生空段落或越界。
- [ ] 异常：原始 HTML/脚本、安全协议、Markdown 图片地址均按文本/占位处理，不执行、不抓取。
- [ ] 回归：工具摘要、图片分段、A4 分页、中文、文件名与选择/图片模式不变。
- [ ] 交互：无新增 UI；预览、下载与移动端入口不受影响。
- [ ] 安全：链接只生成白名单协议，属性全部转义，外部资源不被读取。

## 终态与证据

关闭时填写实现、测试、SOLUTION 对照、commit 与完整 review 三标签；并完成 R-01-014 的里程碑勾选。
