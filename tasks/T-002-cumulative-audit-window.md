---
doc-type: task
mutation: lifecycle
id: T-002
---

# T-002 累计审计——窗口 dbf914b..0a24638

状态: completed
类型: 累计审计
风险等级: 免风险分级（累计审计 task 免分级，证据规格按 major 写死）
风险面: 无（只读审计，不改代码与 map；发现按严重度登记）
决策依据: AgentMap 累计审计闸口机械触发——自复位点「起点」起窗口语义行 3069 ≥ 800；按「立项与收口同笔」承载，先于 T-001 关闭完成并登记新复位点。

## 背景与目标

- 窗口: `dbf914b..0a24638`，共 8 笔提交，覆盖基线文档修订、README/CI、T-001 实现与其评审修复。
- 目标: 跨改动核验 PRD/SOLUTION 承诺与实现、T-001 的测试锚点与证据素材、README/CI 对外口径；登记证据失实更正；判断窗口能否复位累计审计点。
- 非目标: 不新增功能、不改代码与 map；审计发现只在可随 active task 修正时处置，终态 task 原文不回改。

## 差距评估

- 审计对象: `git diff dbf914b..0a24638` 的源码、测试、e2e、CI、README、PRD/SOLUTION/DOMAIN/CONVENTIONS 与 task。
- 跨改动重点: T-001 首次实现到修复提交的口径变化（AC-03/C-003、会话归属/C-004、子会话拒绝时点）；e2e 长消息分页与预览/下载字节比对；CI 的依赖安装与 fail-closed。
- 证据互证: T-001 仍为 active，终态证据尚未填写；本轮核对 T-001 当前实现、测试结果与 SOLUTION 对照素材，避免关闭时自证。
- 机械口径: 窗口语义行 3069（lint 报告，至 0a24638；审计后 405 处置提交 7074ef7 越窗，登记于审计更正）；本 task 只读，不改源码与 map。

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
| 成功 | 适用：窗口内成功路径由真实 e2e 复核 | `e2e/specs/pdf-export.mjs::R-01-001/AC-01` |
| 异常 | 适用：404/500 的页内失败映射由 e2e 复核 | `e2e/specs/pdf-failure.mjs::R-01-006/AC-02` |
| 边界配置 | 适用：窗口构成、空转录与非法参数由单测复核 | `test/config.test.mjs::timeoutMs`、`test/route.test.mjs::R-01-003/AC-01` |
| 副作用 | 适用：导出前后会话日志字节不变 | `e2e/specs/pdf-export.mjs::R-01-007/AC-01` |
| 安全 | 适用：无凭据 401 与异源 403 的复核 | `e2e/specs/pdf-export.mjs::R-01-008/AC-01` |

## 自查清单

- 边界：窗口起点为基线导入后的首个 lint 生效提交 dbf914b，终点为 T-002 立项提交 0a24638；审计后的 405 处置 7074ef7 越窗，生成物不计语义行。
- 异常路径：证据失实按审计更正登记，不修改终态 task 原文；T-001 active 引证随其关闭修正。
- 回归影响：审计零代码改动；复位点登记后新窗口从 T-002 收尾提交起算。
- 残余风险：浏览器冷启动耗时、超大日志未限时、pdfinfo/pdftotext 依赖由 CI 安装并 fail-closed。

## 审计更正

- E1 窗口与语义行：初稿写 `dbf914b..a5ae53b`/8 笔/2889 行；实测该区间 7 笔/3024 行，至 `0a24638` 为 8 笔/3069 行。本 task 已更正为 `dbf914b..0a24638`/3069，并注明 405 处置 `7074ef7` 越窗。
- E2 R-01-001/AC-03：初稿只有“空态不请求”与 `initialViewState` 断言，未证明空态文案渲染；已新增 `viewNoticeText` 单测（`test/view-state.test.mjs`），AC 按 C-003 限定为宿主渲染该页时成立。
- E3 `pdf-failure.mjs`：初稿锚 R-01-006/AC-01、AC-02 却只测浏览器 503；已补 404/500 页内断言，真实服务端状态码仍由 route 单测覆盖。
- E4 T-001 矩阵：兼容性行曾把 HEAD/GET 一致性锚到 R-01-006/AC-02；已改指 `test/route.test.mjs::HEAD 与 GET 状态码和响应头一致`，异常行保留 AC-02。
- E5 405：SOLUTION 曾承诺“其它方法 405”，宿主只转发 GET/HEAD；已在 7074ef7 撤回契约，handler 防御分支保留并标注不可观测。
- E6 提交告警：6e2aeed/db5da9d 的 `review:` 缺失是 lint 对 README/LICENSE/CI 的启发式告警，正文与当时状态相符，不登记为证据失实。

## 终态与证据

- 实现: 独立子代理对窗口 `dbf914b..0a24638`（8 笔）做 Spec/Standards 双轴审计；两轴共 5 条 blocking——窗口口径、子会话契约漏 delegationDepth、AC-03 空态文案、pdf-failure AC 错配、T-002 矩阵不可执行——均已在 `aa240d2` 处置；非阻塞 204 空文件、idle 死分支、权威入口、poppler fail-closed、超时/垃圾产物也一并修复。
- 测试: `pnpm check` 通过；`pnpm test` 47 通过（含真实 Chrome 的 A4/中文/分页测试与假浏览器超时/坏产物测试）；`pnpm test:e2e` 两套通过（含 404/500 页内、401/403、日志字节不变）；复位后 `scripts/verify.sh` 作为权威入口复跑。
- SOLUTION 对照: 审计未发现残留差异；C-003 空态条件、C-004 归属边界、子会话 `origin`/`delegationDepth`、GET/HEAD 契约、sessionId 字符集、browserPath 请求期 503、CI 安装 poppler 均与实现一致；405 已撤回不可观测承诺。
- commit: 0a24638
- review:
  - 审核方: 累计审计独立子代理（Spec 824daa11 / Standards bbfcef64）
  - 目的理解: 对窗口 8 笔提交做跨改动双轴审计，核验 PRD/SOLUTION 承诺、23 条 AC 锚点、T-001/T-002 证据与 CI/README 口径，判断能否复位累计审计点。
  - 问题与修复: blocking 5 条全部修复（T-002 窗口 0a24638/3069、SOLUTION delegationDepth、viewNoticeText 空态单测、pdf-failure 404/500、T-002 矩阵改可执行锚点）；non-blocking 6 条已处置（204 下载、idle 分支、verify 入口、CI fail-closed、词框边界、事件顺序措辞），405 契约已在 7074ef7 撤回。
  - 复审结论: 双轴 blocking 清零，窗口可复位；残留风险为超大日志未限时、缓存无字节上限、HEAD 后 iframe GET 失败无页内回落，均不阻断复位。
