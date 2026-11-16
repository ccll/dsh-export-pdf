---
doc-type: task
mutation: lifecycle
id: T-008
---

# T-008 累计审计——窗口 30ccac2..2ac29fe

状态: completed
类型: 累计审计
风险等级: 免风险分级（累计审计 task 免分级，证据规格按 major 写死）
风险面: 无（只读审计，不改代码与 map；发现按严重度登记）
决策依据: AgentMap 累计审计闸口机械触发——自复位点 T-006 起窗口 `30ccac2..2ac29fe` 语义行 951≥800（4 笔提交）；先完成跨改动双轴审计并登记新复位点，T-007 才能进入收尾。

## 背景与目标

- 窗口: `30ccac2..2ac29fe`，共 4 笔提交，覆盖 T-005/T-006 收尾文档、T-007 图片三态导出与复审修复。
- 目标: 跨改动核验 PRD R-01-011 修订与 R-01-012、SOLUTION 契约、DOMAIN 术语与 T-007 证据素材；登记证据失实更正；判断窗口能否复位累计审计点。
- 非目标: 不新增功能、不改 map 语义；只读审计，发现随 active task 收尾处置。

## 差距评估

- 审计对象: `git diff 30ccac2..2ac29fe` 的源码、测试、e2e、PRD/SOLUTION/DOMAIN/CONVENTIONS/README、C-006 与 tasks。
- 跨改动重点: 图片默认占位对 R-01-011 默认语义的影响；文件附件与图片控件是否真正独立；嵌入/失败回退/缓存/文件名契约；T-007 复审修复是否引入漂移。
- 证据互证: T-007 仍 active，终态证据尚未填写；本轮核对其实现、测试与 SOLUTION 对照素材，避免关闭时自证；T-005/T-006 已终态，只核对证据结构。
- 机械口径: 窗口 4 笔、语义行 951（按 lint 算法复核）；只读审计。

## 收敛方案

1. Spec 轴: 对照 PRD R-01-011（修订 AC-01/AC-03）与 R-01-012 AC-01..06、SOLUTION 产品契约/不变量/失败语义、DOMAIN 术语，核验图片三态、文件独立、默认占位、回退、文件名/缓存是否真实兑现。
2. Standards 轴: 对照 CONVENTIONS/AGENTS/DOMAIN 与会涉模块契约，抽查 T-007 证据结构、测试锚点、附件读取安全、client bundle 一致性与文档口径。
3. 证据更正: 发现失实按「不改终态原文、登记更正」口径记入本 task；T-007 关闭前可修正的引证随其收尾落地。
- 无分叉点: 审计范围由累计审计闸口机械划定，无方案抉择。

## 测试计划

- 只读审计，不新增测试。
- 由审计方实跑 `pnpm test`、`pnpm check` 与关键真实 Chrome 用例；主代理跑两套 e2e 与 `pnpm verify`；复核 R-01-012 的 6 条 AC 锚点。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：嵌入/占位/不导出由真实 Chrome 复核 | `test/pdf.test.mjs::R-01-012/AC-03` |
| 异常 | 适用：非法 image 与附件失败回退 | `test/route.test.mjs::R-01-012/AC-01`、`test/images.test.mjs::R-01-012/AC-03` |
| 边界配置 | 适用：纯图片、文件独立、默认占位 | `test/transcript.test.mjs::R-01-012/AC-02`、`test/transcript.test.mjs::R-01-012/AC-04` |
| 副作用 | 适用：缓存/文件名按模式隔离、预览与下载同字节 | `test/exporter.test.mjs::R-01-012/AC-05`、`e2e/specs/pdf-export.mjs::R-01-012/AC-05` |
| 安全 | 适用：只读附件引用、拒绝 URL/路径 | `test/images.test.mjs::R-01-012/AC-06` |
| 兼容性 | 适用：默认占位地址/文件名与既有断言不回归 | `test/naming.test.mjs::R-01-011/AC-06`、`e2e/specs/pdf-export.mjs::R-01-012/AC-05` |

## 自查清单

- 边界：窗口起点为 T-006 复位点 30ccac2，终点为 T-007 复审修复 2ac29fe；4 笔、语义行 951；生成物不计语义行。
- 异常路径：证据失实按审计更正登记，不修改终态 task 原文；T-007 active 引证随其关闭修正。
- 回归影响：审计本身不改产品代码；non-blocking 的 README/测试/口径修正随收尾落地；复位点登记后新窗口从 T-008 收尾提交起算。
- 残余风险：嵌入图片无独立字节上限（受 DSH 附件限制）；mock e2e 不产生图片，内容层由真实 Chrome 与图像解析单测补足；attachments 为必需注入，附件服务整体缺失时走不到单图回退。

## 审计更正

- E1 窗口口径: 初稿写 4 笔/939；按 lint 复核 `30ccac2..2ac29fe` 为 4 笔/语义行 951。939 属 `4a25b93..2ac29fe` 的 3 笔（排除了 T-006 收口提交），已修正正文口径。
- E2 README 旧口径: 英中 README 使用段仍称两个复选框控制图片/附件、文件名只列 `-tools/-attachments`；已同步为图片三态、文件附件独立与 `-images/-no-images`。
- E3 图片越界证据: 初稿用 80×40 图配 595pt 整页上限，移除 max-width 仍会通过；已换成 800×400 图并断言不超过 504pt 版心（取 505pt 容差）。
- E4 CONVENTIONS 复位注释: 注释把 1264 行窗口写成 `0a24638→30ccac2`；1264 对应 `0a24638..a538649`，复位提交是 30ccac2，已更正注释。

## 终态与证据

- 实现: 独立子代理对窗口 `30ccac2..2ac29fe`（4 笔、语义行 951）做 Spec/Standards 双轴审计；无 blocking。**non-blocking 4 条**——README 使用段仍称两个复选框与旧后缀、PDF 越界用例用 80×40 图配 595pt 整页上限、T-008 初稿窗口口径 4 笔/939 与 lint 951 不符、CONVENTIONS 复位注释把 1264 行窗口终点写成 30ccac2——已在 `5e1ca06` 全部处置并登记审计更正 E1–E4。两轴另列残余风险：mock e2e 不产生图片、嵌入无独立字节上限、attachments 必需注入使单图回退在服务整体缺失时不可达。
- 测试: `pnpm verify` 通过——`pnpm test` 66 通过（含真实 Chrome 图片三态与 800×400 图版心宽度断言）；`pnpm test:e2e` 两套通过（含图片下拉默认占位、embed/none 地址与文件名、预览下载同字节）；`pnpm check` 通过。
- SOLUTION 对照: 窗口内 R-01-011 修订与 R-01-012 的默认占位、文件/图片独立、附件读取回退、缓存与文件名契约均与 SOLUTION 产品契约/不变量一致；DOMAIN 附件占位已收敛为只指文件；未发现残留差异。T-007 的完成标记与 M-007/R-01-012 勾选由 T-007 收尾提交完成。
- commit: 5e1ca06
- review:
  - 审核方: 累计审计独立子代理（Spec 56157fdd / Standards dccf5688）
  - 目的理解: 对 T-006 复位点后的 4 笔跨改动做双轴审计，核验 T-005/T-006 收尾、T-007 图片三态实现与复审修复是否兑现 PRD/SOLUTION/DOMAIN，核对 AC 锚点、证据结构与 README/门禁口径，判断能否复位累计审计点。
  - 问题与修复: 无 blocking。non-blocking 4 条全部修复：README 英中同步图片三态、文件附件独立与 `-images/-no-images`；PDF 用 800×400 图并断言不超过 505pt 版心；T-008 口径改为 `30ccac2..2ac29fe` 4 笔/951 并登记 E1；CONVENTIONS 注释区分窗口终点 a538649 与复位提交 30ccac2（E4）。残余风险见上。
  - 复审结论: Spec 轴与 Standards 轴均判定窗口可复位、无 blocking；残余风险不阻断复位。
