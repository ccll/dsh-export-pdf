---
doc-type: task
mutation: lifecycle
id: T-005
---

# T-005 导出内容选择：默认最简与内容复选框

状态: completed
类型: UI/UX 改进
风险等级: major
风险面: 对外接口参数、缓存键与视图交互变化，影响下载内容组成（契约与数据正确性）
决策依据: C-005；东家 2026-11-16 拍板：默认最简，用复选框按需加入工具调用摘要与附件占位，预览和下载共用选择。

## 背景与目标

- 背景: 当前 PDF 固定包含工具调用摘要与附件占位，想要干净分享版时必须接受执行细节；东家要求默认只导出消息本体，并在预览页标题栏按需勾选其它内容。
- 目标: 默认只含用户消息与助手回复文本；两个复选框分别控制工具调用摘要、图片/附件占位；选择变化同时作用于页内预览与下载；附加选择的文件名带后缀；新会话回到默认最简。
- 非目标: 不导出思考块、工具输出、失败尝试或内部运行上下文；不持久化选择到本地；不增加第三种导出格式；不改鉴权、子会话拒绝与 A4 版式。

## 差距评估

- 现状: `foldTranscript` 固定保留工具调用，`messageText` 固定把图片/文件转为占位；路由没有内容选择参数，缓存只按会话标识与日志长度区分。
- 差距: 无默认最简行为、无内容选择契约、无选择相关的缓存隔离或文件名后缀、视图没有复选框。
- 影响面: `src/transcript.mjs`、`src/exporter.mjs`、`src/route.mjs`、`src/naming.mjs`、`src/view.mjs`、`src/view-state.mjs`、客户端 bundle 与相应测试；鉴权边界与渲染版式不变。

## 收敛方案

- 路由增加 `include` 参数：缺省为空；只接受 `tools`、`attachments`；逗号分隔、去重后按固定顺序归一，未知值或重复值返回 400。
- 转录折叠接收选择：缺省只保留消息文本；`tools` 才折叠工具调用；`attachments` 才把图片/文件转为占位。纯附件消息在未选 `attachments` 时因无文本而被省略。
- 导出器按 `会话标识 + include 选择 + 日志长度` 缓存与单飞；不同选择不复用字节。
- 文件名按选择追加 `-tools`、`-attachments` 或 `-tools-attachments`；默认最简保持原文件名。
- 视图标题栏增加两个复选框，默认不勾；选择变化取消旧 HEAD/iframe 请求并按新选择重取，当前选择就绪前禁用下载；新会话重置为默认。
- 过滤后为空时沿用 `204`，视图显示“当前选择下没有可导出的内容”的空态提示。
- 无分叉点: 东家已拍板默认最简、复选框、文件名后缀与不跨会话记忆；路由参数形状和缓存实现属实现自由。

## 测试计划

- 转录单测：默认无工具/占位；分别选 `tools`、`attachments`、两者；纯附件消息在未选附件时被省略；消息顺序不变。
- 路由与文件名单测：`include` 缺省、合法组合、顺序归一、重复/未知值 400；下载文件名后缀。
- 导出器单测：同会话不同选择各自渲染、同选择命中缓存、并发单飞按选择隔离；默认最简不含工具摘要。
- 视图状态单测：URL 带选择、204 过滤空态文案。
- 真实 Chrome PDF 用例：显式选 `tools` 保留工具行断言；新增默认最简不含工具行的断言。
- e2e：默认预览地址不带 `include`；勾选工具/附件后请求带对应 `include`、文件名带后缀，预览与下载字节一致；选择变化时下载按钮在就绪前禁用。内容层由真实 Chrome PDF 用例覆盖（mock LLM 不产生工具调用与附件）。
- 目标 AC: R-01-011/AC-01..06，以及 R-01-004/AC-01、AC-02 的修订后语义。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：默认与四种选择组合都能生成对应 PDF | `test/transcript.test.mjs::R-01-011/AC-01`、`test/exporter.test.mjs::R-01-011/AC-02`、`test/pdf.test.mjs::R-01-011/AC-02` |
| 异常 | 适用：非法/重复 `include` 返回 400，不触发渲染 | `test/route.test.mjs::R-01-011/AC-02` |
| 边界配置 | 适用：空选择、纯附件消息、只有工具调用的会话按 204 或省略处理 | `test/transcript.test.mjs::R-01-011/AC-03`、`test/exporter.test.mjs::R-01-011/AC-05`、`test/view-state.test.mjs::R-01-011/AC-05` |
| 副作用 | 适用：切换选择取消旧请求；下载只取当前选择；缓存不跨选择复用 | `test/exporter.test.mjs::R-01-011/AC-04`、`e2e/specs/pdf-export.mjs::R-01-011/AC-04` |
| 安全 | 适用：新参数不改变宿主的鉴权与同源栅栏；非法值不泄露细节 | `test/route.test.mjs::R-01-011/AC-02`、`e2e/specs/pdf-export.mjs::R-01-011/AC-04` |
| 并发 | 适用：不同选择可并行受全局上限约束，同选择单飞 | `test/exporter.test.mjs::R-01-011/AC-04`、`test/exporter.test.mjs::R-01-011/AC-05` |
| 兼容性 | 适用：默认请求仍返回 PDF，文件名保持 `dsh-session-<8位>.pdf` | `test/naming.test.mjs::R-01-011/AC-06`、`e2e/specs/pdf-export.mjs::R-01-011/AC-04` |

## 自查清单

- [x] 边界：纯附件消息、只含工具调用的会话、空选择各有明确结果，不产生空白 PDF（transcript AC-03、exporter AC-05、真实 Chrome 四组合）。
- [x] 异常：非法/重复 `include` 在路由边界返回 400；过滤为空返回 204；失败不缓存，切换选择会取消旧请求（route AC-02、exporter AC-04、view AbortController）。
- [x] 回归：默认最简保留双方文本；真实 Chrome 验证 A4、分页、中文、右对齐与角色图标；e2e 两套通过。
- [x] 交互：HEAD/iframe 随选择取消，下载用 AbortController 取消在途请求；当前选择就绪前按钮禁用（e2e AC-04）。
- [x] 安全：`include` 只过滤已读快照；宿主的鉴权与同源栅栏不变，e2e 401/403 通过。

## 终态与证据

- 实现: 新增 `include` 协议与选择归一（`src/selection.mjs`）；转录默认只保留消息文本，按 `tools`/`attachments` 加入工具摘要与附件占位；导出器按“会话 + 选择 + 日志代次”缓存/单飞，文件名按选择追加后缀；视图标题栏提供两个默认不勾的复选框，选择变化取消旧 HEAD/iframe/下载请求，过滤为空显示中性空态；客户端 bundle 已重建。
- 测试: `pnpm verify` 通过：`pnpm test` 55 通过（含真实 Chrome 默认最简与四种选择组合、A4/中文/分页）；`pnpm test:e2e` 两套通过（默认/工具/附件变体文件名、预览与下载同字节、空会话零导出请求）；`pnpm check` 只读比对已提交 bundle 通过；T-006 累计审计复位后 lint 无阻断。
- SOLUTION 对照: R-01-004 修订后的 AC-01/AC-02 与 R-01-011 AC-01..06 全部有实现与测试锚点；DOMAIN 已登记导出内容选择/工具调用摘要/附件占位；C-005 记录默认最简与复选框取舍；缓存、文件名、空态与鉴权行为一致，无未承接差距。
- commit: a538649
- review:
  - 审核方: code-review skill 双轴独立子代理（Standards c8f57ef1 / Spec 05755b5b）；T-006 累计审计独立子代理（Spec 5afa1497 / Standards 9eb4821c）
  - 目的理解: 让 PDF 默认只呈现用户与助手消息文本，用标题栏复选框按需加入工具调用摘要与附件占位，并让预览、下载、文件名和缓存共享同一选择；保持既有鉴权、A4 版式、角色图标与只读边界。
  - 问题与修复: 首轮 blocking 1 条（DOMAIN 不变量与按选择缓存冲突）已修；non-blocking 包括 token 散落、route JSDoc 漏 include、cacheKey 注释失实、死分支、useCallback 依赖、204 文案失准、include= 空值未定义、真实 Chrome/e2e 证据缺口，已在 a538649 处置。T-006 审计又发现 README 行为段漂移、check 自证、下载竞态与 204 文案问题，已在 30ccac2 修复。
  - 复审结论: Standards 与 Spec 两轴复审均通过，blocking 清零；T-006 判定窗口可复位且无 blocking。残余风险：mock e2e 不产生工具/附件，内容层由真实 Chrome 用例补足；图标形状仍靠手工截图验收；取消勾选路径未单独断言 disabled，均不阻断关闭。
