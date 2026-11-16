---
doc-type: task
mutation: lifecycle
id: T-002
---

# T-002 累计审计——窗口 dbf914b..a5ae53b

状态: active
类型: 累计审计
风险等级: 免风险分级（累计审计 task 免分级，证据规格按 major 写死）
风险面: 无（只读审计，不改代码与 map；发现按严重度登记）
决策依据: AgentMap 累计审计闸口机械触发——自复位点「起点」起窗口语义行 2889 ≥ 800；按「立项与收口同笔」承载，先于 T-001 关闭完成并登记新复位点。

## 背景与目标

- 窗口: `dbf914b..a5ae53b`，共 8 笔提交，覆盖基线文档修订、README/CI、T-001 实现与其评审修复。
- 目标: 跨改动核验 PRD/SOLUTION 承诺与实现、T-001 的测试锚点与证据素材、README/CI 对外口径；登记证据失实更正；判断窗口能否复位累计审计点。
- 非目标: 不新增功能、不改代码与 map；审计发现只在可随 active task 修正时处置，终态 task 原文不回改。

## 差距评估

- 审计对象: `git diff dbf914b..a5ae53b` 的源码、测试、e2e、CI、README、PRD/SOLUTION/DOMAIN/CONVENTIONS 与 task。
- 跨改动重点: T-001 首次实现到修复提交的口径变化（AC-03/C-003、会话归属/C-004、子会话拒绝时点）；e2e 长消息分页与预览/下载字节比对；CI 的依赖安装与 fail-closed。
- 证据互证: T-001 仍为 active，终态证据尚未填写；本轮核对 T-001 当前实现、测试结果与 SOLUTION 对照素材，避免关闭时自证。
- 机械口径: 窗口语义行 2889（lint 报告）；本 task 只读，不改源码与 map。

## 收敛方案

1. Spec 轴: 对照 PRD R-01-001～R-01-008 的 23 条 AC、SOLUTION 契约/不变量/失败语义与 README 承诺，核验实现是否兑现；重点复核 C-003 的空态口径与 C-004 的归属边界是否与代码一致。
2. Standards 轴: 对照 CONVENTIONS/AGENTS/DOMAIN 与会涉模块契约，抽查 task 证据结构、提交引用、测试锚点、CI 配置；检查实现与修复提交是否引入吞错、缺失校验或术语漂移。
3. 证据更正: 发现失实按「不改终态原文、登记更正」口径写入本 task；可在 T-001 关闭前修正的引证随 T-001 收口落地。
- 无分叉点: 审计范围由累计审计闸口机械划定，无方案抉择。

## 测试计划

- 只读审计，不新增测试。
- 实跑 `pnpm check`、`pnpm test`、`pnpm test:e2e`、`python3 tools/agentmap_lint.py --report` 作为证据核验；T-001 的 Chrome/中文断言与 401/403 e2e 由审计方复跑确认。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：窗口双轴审计完成、复位点登记后 lint 恢复通过 | `tools/agentmap_lint.py::累计审计触发` |
| 异常 | 适用：证据失实与跨改动漂移的登记处置 | `tasks/T-002-cumulative-audit-window.md::审计更正` |
| 边界配置 | 适用：窗口构成与语义行排除口径核对 | `tasks/T-002-cumulative-audit-window.md::dbf914b` |
| 副作用 | 适用：审计不改动仓库状态 | `tasks/T-002-cumulative-audit-window.md::只读` |
| 安全 | 适用：鉴权边界与错误响应不泄露路径的复核 | `e2e/specs/pdf-export.mjs::R-01-008/AC-01` |

## 自查清单

- 边界：窗口起点为基线导入后的首个 lint 生效提交 dbf914b，终点为 T-001 修复提交 a5ae53b；生成物不计语义行。
- 异常路径：证据失实按审计更正登记，不修改终态 task 原文；T-001 active 引证随其关闭修正。
- 回归影响：审计零代码改动；复位点登记后新窗口从 T-002 收尾提交起算。
- 残余风险：浏览器冷启动耗时、超大日志未限时、pdfinfo/pdftotext 依赖由 CI 安装并 fail-closed。

## 审计更正

关闭时填写失实条目；无失实则写「无」。

## 终态与证据

关闭时填写实现、测试、SOLUTION 对照、commit 与独立 review 证据。
