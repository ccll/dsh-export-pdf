---
doc-type: task
mutation: lifecycle
id: T-011
---

# T-011 累计审计——窗口 22513d8..07a1a50

状态: completed
类型: 累计审计
风险等级: 免风险分级（累计审计 task 免分级，证据规格按 major 写死）
风险面: 无（只读审计，不改代码与 map；发现按严重度登记）
决策依据: AgentMap 累计审计闸口机械触发——自复位点 T-008 起窗口 `22513d8..07a1a50` 语义行 1005≥800（8 笔提交）；先完成跨改动双轴审计并登记新复位点，T-010 才能进入收尾。

## 背景与目标

- 窗口: `22513d8..07a1a50`，共 8 笔提交，覆盖 T-009 窄视口 PDF 打开、T-010 Markdown 渲染与两轮复审修复、T-007 收尾文档。
- 目标: 跨改动核验 R-01-013 与 R-01-014 的 PRD/SOLUTION/DOMAIN 契约、Markdown 安全边界、窄视口链接与桌面 iframe 共存、T-009/T-010 证据结构与 AC 锚点；登记证据失实更正；判断窗口能否复位累计审计点。
- 非目标: 不新增功能、不改 map 语义；只读审计，发现随 T-010 收尾处置。

## 差距评估

- 审计对象: `git diff 22513d8..07a1a50` 的源码、测试、e2e、PRD/SOLUTION/DOMAIN/CONVENTIONS/README、RATIONALE C-007/C-008 与 tasks。
- 跨改动重点: 安全 Markdown 渲染是否在不可信文本边界闭合；窄视口链接是否与桌面 iframe/下载共用同一 PDF；两轮复审修复是否引入新漂移；T-009/T-010 的证据是否可复核。
- 证据互证: T-009 已终态；T-010 仍 active，核对其实现、测试与 SOLUTION 对照素材，避免关闭时自证。
- 机械口径: 窗口 8 笔、语义行 1005（按 lint 算法复核）；只读审计。

## 收敛方案

1. Spec 轴: 对照 PRD R-01-013 AC-01..05、R-01-014 AC-01..06、SOLUTION 产品契约/不变量/失败语义、DOMAIN 窄视口与 Markdown 图片占位，核验移动端承载、Markdown 块级/行内、安全边界、真实 PDF 证据与里程碑勾选。
2. Standards 轴: 对照 CONVENTIONS/AGENTS/DOMAIN 与会涉模块契约，抽查 T-009/T-010 证据结构、测试锚点、链接协议/图片/HTML 安全、client bundle 一致性、文档口径与 lint 累计审计复位。
3. 证据更正: 发现失实按「不改终态原文、登记更正」口径记入本 task；T-010 关闭前可修正的引证随其收尾落地。
- 无分叉点: 审计范围由累计审计闸口机械划定，无方案抉择。

## 测试计划

- 只读审计，不新增测试。
- 审计方实跑 `pnpm test`、`pnpm check`、`pnpm build:client` 与关键真实 Chrome 用例；主代理跑两套 e2e 与 `pnpm verify`；复核 R-01-013/R-01-014 的 AC 锚点。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：窄视口与 Markdown 关键路径 | `e2e/specs/pdf-export.mjs::R-01-013/AC-01`、`test/markdown.test.mjs::R-01-014/AC-01` |
| 异常 | 适用：失败窄视口、代码/脚本转义 | `e2e/specs/pdf-failure.mjs::R-01-013/AC-03`、`test/markdown.test.mjs::R-01-014/AC-03` |
| 边界配置 | 适用：720/721 断点、纯文本换行 | `e2e/specs/pdf-export.mjs::R-01-013/AC-04`、`test/markdown.test.mjs::R-01-014/AC-06` |
| 副作用 | 适用：链接/下载同 PDF、工具摘要不渲染 | `e2e/specs/pdf-export.mjs::R-01-013/AC-02`、`test/render.test.mjs::R-01-010/AC-01` |
| 安全 | 适用：同源链接/noopener、危险协议与图片 | `e2e/specs/pdf-export.mjs::R-01-013/AC-05`、`test/markdown.test.mjs::R-01-014/AC-04`、`test/markdown.test.mjs::R-01-014/AC-05` |
| 兼容性 | 适用：桌面 iframe/真实 PDF/A4 不回归 | `e2e/specs/pdf-export.mjs::R-01-002/AC-03`、`test/pdf.test.mjs::R-01-014/AC-01` |

## 自查清单

- 边界：窗口起点为 T-008 复位点 22513d8，终点为 T-010 缩进续行修复 07a1a50；8 笔、语义行 1005；生成物不计语义行。
- 异常路径：证据失实按审计更正登记，不修改终态 task 原文；T-010 active 引证随其关闭修正。
- 回归影响：审计本身不改产品代码；non-blocking 的测试/口径修正随 T-010 收尾落地；复位点登记后新窗口从 T-011 收尾提交起算。
- 残余风险：真实 PDF 对跨页表头/复选框字形覆盖有限；移动端系统查看器分页行为依赖浏览器；Markdown 复杂 GFM（脚注、嵌套引用、代码 span 内裸管道）不在子集内。

## 审计更正

- E1 窗口口径: 初稿写 6 笔/892；Spec 审计按逐提交与 lint 复核，实际窗口 `22513d8..07a1a50` 为 8 笔/语义行 1005。正文与决策依据已统一为 1005；触发条件仍成立。
- E2 AC 映射: T-009 终态矩阵把 AC-02（新标签页同一份 PDF）与 AC-05（同源/noopener/文件名）写反；T-009 已终态不改原文，本 task 矩阵已按 PRD R-01-013 修正并在 E2 登记。
- E3 提交口径: T-010 的 5729895 正文声称修复未闭合 `[` 的二次扫描，实际该修复落在 84d1880；07a1a50 又修复缩进续行。T-010 终态证据引用 07a1a50，不引用 5729895。

## 终态与证据

- 实现: 独立子代理对窗口 `22513d8..07a1a50`（8 笔、语义行 1005）做 Spec/Standards 双轴累计审计。Spec 轴 blocking 为 E1 窗口口径写成 6 笔/892，已统一为 8 笔/1005；Standards 轴在旧窗口 `5729895` 报下划线强调断裂与未闭合 `[` 回退，两处已在 84d1880 修复、缩进续行在 07a1a50 修复，复审清零。non-blocking：T-009 终态 AC 映射写反、T-010 5729895 提交正文失实、`[a](` 未闭合括号仍 O(n²)（80k 约 2.4s）、真实 PDF 单页/跨页覆盖有限、T-009 生成中/空态无直接断言。AC 映射在本 task 矩阵修正并登记 E2；T-010 失实声明登记 E3；性能与 PDF 覆盖列残余。复位动作在本提交更新 CONVENTIONS 复位点。
- 测试: `pnpm verify` 通过——79 项单测（含 Markdown 10 项、真实 Chrome 4 项、Markdown PDF 安全断言）、两套 e2e 通过（窄视口 720/721、同源链接、失败无入口、桌面 iframe、选择/图片模式）；`pnpm check` 与 `pnpm build:client` 通过。
- SOLUTION 对照: R-01-013 AC-01..05 与 R-01-014 AC-01..06 均有实现与测试锚点；窄视口产品契约/不变量、Markdown 安全子集、DOMAIN 窄视口/Markdown 图片占位与 RATIONALE C-007/C-008 一致；未发现需改 map 的漂移。T-010 仍 active 的终态证据由 T-010 收尾提交补齐。
- commit: 07a1a50
- review:
  - 审核方: 累计审计独立子代理（Spec 95569933 / Standards 42bc54b3）
  - 目的理解: 对 T-008 复位点后的 8 笔跨改动做双轴审计，核验 T-009 窄视口 PDF 打开、T-010 Markdown 渲染与两轮复审修复是否兑现 PRD/SOLUTION/DOMAIN，核对 AC 锚点、证据结构与安全边界，判断能否复位累计审计点。
  - 问题与修复: Spec blocking E1（窗口口径 892→1005、6→8 笔）已改；Standards 旧窗口 blocking（`__粗体__` 断裂、未闭合 `[` O(n²)）已在 84d1880 修复并由复审确认，缩进续行由 07a1a50 修复。non-blocking 的 T-009 AC 映射在 T-011 矩阵修正并登记 E2，T-010 提交正文失实登记 E3；`[a](` 性能与 PDF 单页覆盖列为残余。
  - 复审结论: Spec 与 Standards 两轴均确认 blocking 清零、窗口可复位；残余 non-blocking 不阻断复位，CONVENTIONS 复位点随本收尾提交更新。
