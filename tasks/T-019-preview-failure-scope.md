---
doc-type: task
mutation: lifecycle
id: T-019
---

# T-019 预览失败回退与 401/状态作用域

状态: active
类型: 客户端失败态与边界修复
风险等级: major
风险面: 契约（预览就绪判定与 401/403 页内文案）
决策依据: 东家 2026-11-20 按审查推荐批准整改；预览采用“HEAD + GET 校验”方案，不把 PDF 字节驻留浏览器内存。

## 背景与目标

- 背景: 审查发现客户端只用 HEAD 判定就绪，HEAD 成功后预览 iframe 的 GET 失败仍显示“预览已就绪”；401/403 只显示异常状态码；旧会话的空态/错误会在切换后闪现；下载锚点被挂到 `document.body`。
- 目标:
  - HEAD 200 后追加一次同源 GET 校验，只有 GET 返回 PDF 才进入就绪；失败转页内错误并可重试。
  - 401/403 映射为可操作的中文原因。
  - 空态/错误状态带会话与选择作用域，切换后不展示旧状态。
  - 下载锚点不再写入 `document.body`。
  - 明确 Config 为 patch-only、UI 文案为简体中文，不在本插件内引入 locale/schema 依赖。
- 非目标: 不改变 iframe 的源地址（仍为 `/api/session.pdf`），不把 PDF 转为 Blob 预览；不新增 HTTP 状态码或错误码；不新增 PRD 需求。

## 差距评估

- 预览: `src/view.mjs:92-102` 只用 HEAD 分类；`src/view.mjs:231` iframe 不观测加载结果。
- 401/403: `src/view-state.mjs:19-27` 无对应文案，`src/view-state.mjs:109` 落入“意外结果（HTTP 401）”。
- 状态作用域: `src/view.mjs:158-161` 对 `empty`/`error` 不校验会话与选择，切换会话后可能闪现旧状态。
- 锚点: `src/view.mjs:145` 把下载锚点挂到 `document.body`。
- 配置/本地化: `src/host.mjs` 未导出 `Config`；客户端硬编码中文，未注册 locale 字典。
- 影响面: `src/view.mjs`、`src/view-state.mjs`、`e2e/specs/pdf-failure.mjs::GET 失败后显示失败原因`、`test/view-state.test.mjs::视图状态按会话与选择作用域判定`、SOLUTION、README。

## 收敛方案

1. 预览: HEAD 200 后对同一 URL 发起 GET；GET 非 200 按现有状态映射转错误/空态；GET 200 但 Content-Type 非 `application/pdf` 也转错误；校验后取消响应体，不把整份 PDF 留在内存。就绪状态只在 GET 校验成功后设置。
2. 鉴权文案: `messageForStatus` 对 401/403 优先返回中文可操作原因，不直接回显宿主 `unauthorized`/`forbidden` 正文。
3. 状态作用域: `isViewStateInScope` 统一判定 `sessionId`/`selectionKey`；视图状态写入时带上作用域字段；旧作用域状态显示为生成中。
4. 锚点: 直接 `anchor.click()`，不向 `document.body` 追加节点。
5. 配置/本地化: 采用无依赖 fallback——README/SOLUTION 明确 patch-only 配置与简体中文 UI；不引入 `@deepseek-ai/schemastery` 或 Client locale 服务。
- 无分叉点: 东家已批准推荐方案；GET 校验与 Blob 预览相比不改变 iframe 源地址、不增加大 PDF 内存驻留，选 GET 校验；Config/locale 采用文档 fallback，避免引入新依赖。

## 测试计划

- 先加失败断言：401/403 文案、状态作用域 helper、e2e“HEAD 200 后 GET 500 回到错误态”。
- 回归：`test/view-state.test.mjs::视图状态按会话与选择作用域判定`、`e2e/specs/pdf-failure.mjs::GET 失败后显示失败原因`、`e2e/specs/pdf-export.mjs::R-01-013/AC-05`、`node scripts/check.mjs`。
- 真实浏览器验收：在隔离 DSH 环境中跑两套 e2e，确认预览来源仍带 `disposition=inline`、窄视口链接仍同源。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：HEAD 与 GET 成功后进入就绪并显示 iframe | `e2e/specs/pdf-export.mjs::预览已就绪` |
| 异常 | 适用：HEAD 200/GET 500、401/403、网络失败 | `e2e/specs/pdf-failure.mjs::预览校验失败`、`test/view-state.test.mjs::401/403 给出可操作原因` |
| 边界配置 | 适用：401/403 文案与状态作用域边界 | `test/view-state.test.mjs::视图状态按会话与选择作用域判定` |
| 副作用 | 适用：不向 `document.body` 写节点、切换会话不闪现旧状态 | `test/view-state.test.mjs::视图状态按会话与选择作用域判定` 作用域用例 |
| 兼容性 | 适用：iframe 源地址、窄视口链接与下载文件名不变 | `e2e/specs/pdf-export.mjs::窄视口链接与预览使用同一份 PDF` |

## 自查清单

- [ ] 边界：HEAD 200 后 GET 204/500/非 PDF 都进入正确状态；401/403 不显示英文正文。
- [ ] 异常：GET 校验失败可重试；切换会话/选择后旧状态不展示。
- [ ] 回归：iframe 仍指向 `/api/session.pdf`，窄视口链接同源、下载文件名不变；两套 e2e 通过。

## 终态与证据

- 实现: 待补
- 测试: 待补
- SOLUTION 对照: 待补
- commit: 待补
