---
doc-type: task
mutation: lifecycle
id: T-008
---

# T-008 累计审计——窗口 30ccac2..2ac29fe

状态: active
类型: 累计审计
风险等级: 免风险分级（累计审计 task 免分级，证据规格按 major 写死）
风险面: 无（只读审计，不改代码与 map；发现按严重度登记）
决策依据: AgentMap 累计审计闸口机械触发——自复位点 T-006 起窗口语义行 939≥800；先完成跨改动双轴审计并登记新复位点，T-007 才能进入收尾。

## 背景与目标

- 窗口: `30ccac2..2ac29fe`，共 4 笔提交，覆盖 T-005/T-006 收尾文档、T-007 图片三态导出与复审修复。
- 目标: 跨改动核验 PRD R-01-011 修订与 R-01-012、SOLUTION 契约、DOMAIN 术语与 T-007 证据素材；登记证据失实更正；判断窗口能否复位累计审计点。
- 非目标: 不新增功能、不改 map 语义；只读审计，发现随 active task 收尾处置。

## 差距评估

- 审计对象: `git diff 30ccac2..2ac29fe` 的源码、测试、e2e、PRD/SOLUTION/DOMAIN/CONVENTIONS/README、C-006 与 tasks。
- 跨改动重点: 图片默认占位对 R-01-011 默认语义的影响；文件附件与图片控件是否真正独立；嵌入/失败回退/缓存/文件名契约；T-007 复审修复是否引入漂移。
- 证据互证: T-007 仍 active，终态证据尚未填写；本轮核对其实现、测试与 SOLUTION 对照素材，避免关闭时自证；T-005/T-006 已终态，只核对证据结构。
- 机械口径: 窗口 4 笔、语义行 939（按 lint 算法复核）；只读审计。

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

- 边界：窗口起点为 T-006 复位点 30ccac2，终点为 T-007 复审修复 2ac29fe；生成物不计语义行。
- 异常路径：证据失实按审计更正登记，不修改终态 task 原文；T-007 active 引证随其关闭修正。
- 回归影响：审计零代码改动；复位点登记后新窗口从 T-008 收尾提交起算。
- 残余风险：嵌入图片无独立字节上限（受 DSH 附件限制）；mock e2e 不产生图片，内容层由真实 Chrome 与图像解析单测补足。

## 终态与证据

关闭时填写实现、测试、SOLUTION 对照、commit 与完整 review 三标签；并更新 CONVENTIONS 复位点。
