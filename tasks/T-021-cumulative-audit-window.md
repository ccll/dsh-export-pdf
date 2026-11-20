---
doc-type: task
mutation: lifecycle
id: T-021
---

# T-021 累计审计——窗口 fe212eb..1cac2f6

状态: completed
类型: 累计审计
风险等级: 免风险分级（累计审计 task 免分级，证据规格按 major 写死）
风险面: 无（只读审计，不改代码与 map；发现按严重度登记）
决策依据: AgentMap 累计审计闸口机械触发——自复位点 T-016 收尾 fe212eb 起窗口 `fe212eb..1cac2f6` 语义行 1196≥800（3 笔提交）；先完成跨改动双轴审计并登记新复位点，T-017～T-020 才能收尾。

## 背景与目标

- 窗口: `fe212eb..1cac2f6`，共 3 笔提交。
  - `24420da`：关闭 T-015 本地图片嵌入。
  - `eb04abf`：AgentMap 规范升级 11、测试先行纪律（文档/流程）。
  - `1cac2f6`：T-017～T-020 审查整改（38 文件、+1239/-177）。
- 目标:
  - 跨改动核验 T-017～T-020 是否兑现 PRD AC、SOLUTION 契约与 CONVENTIONS 门禁。
  - 抽查窗口内 T-015 关闭证据与 T-017～T-020 的 task 证据、测试锚点、提交正文。
  - 登记证据失实与残余，判断窗口能否复位累计审计点。

## 差距评估

- 审计对象: 窗口内源码、测试、文档、CONVENTIONS 与 README 双语。
- 跨改动重点:
  - 安全：私有临时目录、权限、清理与 bundle 门禁。
  - 跨平台与失败语义：字体/浏览器探测、`exportTimeoutMs`、Markdown 深嵌套、缓存字节预算与降级不缓存。
  - 客户端：HEAD→GET 校验、401/403、状态与下载错误作用域。
  - 证据：验证矩阵引用是否对应真实测试；AC-02 锚点是否真实。
- 机械口径: lint 实测窗口语义行 1196，完成 task 数 0，触发条件成立；审计方复核 `check` 25436 字节、单测 136 通过、两套 e2e PASS。

## 收敛方案

1. Spec 轴: 对照 PRD R-01-001～R-01-014 与 AC、SOLUTION 契约/失败语义、PRD 只读与性能承诺，核验 T-017～T-020 的边界、证据与测试锚点。
2. Standards 轴: 对照 CONVENTIONS、AGENTS、SOLUTION 边界契约、DOMAIN 术语、错误处理与吞错基线，核验安全、错误语义、测试先行与文档口径。
3. 增量复核: 对 blocking 由同一审计方复核；本轮无 blocking。
4. 证据更正: 失实按「不改终态原文、登记更正」记入本 task；CONVENTIONS 复位点随本收尾提交更新为 T-021。
- 无分叉点: 审计范围与复位动作由闸口机械划定，无方案抉择。

## 测试计划

- 只读审计，不新增测试。
- 审计方复跑 `node scripts/check.mjs`、`node --test test/*.test.mjs`、`node e2e/run.mjs`、`python3 tools/agentmap_lint.py --report`；执行方复核窗口语义行。
- 关键证据: `test/markdown.test.mjs` 深嵌套/线性扫描、`test/exporter.test.mjs` 超时/字节预算/降级缓存、`test/host.test.mjs` AC-02、`e2e/specs/pdf-failure.mjs` HEAD→GET 失败。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：窗口内正常导出、预览与下载路径 | `e2e/specs/pdf-export.mjs::预览已就绪`、`test/pipeline.test.mjs::从真实源码加载管线，渲染与导出可用` |
| 异常 | 适用：超时、预览 GET 失败、字体/浏览器缺失 | `test/exporter.test.mjs::导出超时返回渲染失败，后续请求可重新开始`、`e2e/specs/pdf-failure.mjs::预览校验失败` |
| 边界配置 | 适用：导出时限、字体文件名、标准安装路径 | `test/config.test.mjs::缺省配置与 SOLUTION 的配置表一致`、`test/fonts.test.mjs::常见中文字体文件名可被识别` |
| 副作用 | 适用：私有缓存清理、降级不缓存、AC-02 无文件 | `test/pipeline.test.mjs::启动清理只删除超过 24 小时且进程已不存在的旧目录`、`test/host.test.mjs::插件装载但未收到导出请求时不创建管线缓存目录` |
| 安全 | 适用：0700 私有目录、深层 Markdown 不溢出、bundle 门禁 | `test/pipeline.test.mjs::默认管线缓存使用随机私有目录，dispose 删除目录`、`test/markdown.test.mjs::列表与引用交替嵌套不会耗尽调用栈`、`scripts/check.mjs::main` |
| 性能 | 适用：Markdown 线性扫描与缓存字节预算 | `test/markdown.test.mjs::40KB 未闭合的链接目标不会让扫描退化为二次方`、`test/exporter.test.mjs::缓存按字节上限淘汰最久未使用结果` |
| 兼容性 | 适用：HTTP 契约、文件名与 iframe 源地址不变 | `test/route.test.mjs::GET 成功返回 PDF 与 inline 文件名`、`e2e/specs/pdf-export.mjs::窄视口链接与预览使用同一份 PDF` |

## 自查清单

- [x] 边界：窗口 3 笔（含 T-015 关闭 24420da）；语义行 1196；复位点 T-016 收尾 fe212eb。
- [x] 异常路径：无 blocking；non-blocking 的锚点失实、mkdtemp 瞬态失败缓存、文档漂移已在复位提交前修正，其余登记为残余。
- [x] 回归：窗口不改 HTTP 状态码/错误码、文件名与 PDF 版式；两套 e2e 复跑 PASS；136 单测通过。

## 审计更正

- E1 窗口笔数: 初始简报写“2 笔”，实为 3 笔——漏计 24420da（T-015 关闭）。该提交终态证据经抽查真实（bundle 22870 字节、117 单测、review 三标签齐全）；本 task 窗口按 3 笔登记。
- E2 验证矩阵失实: T-017 把失败回退/清理/并发挂在私有目录用例上，并以源码 `src/host.mjs::apply` 充当可执行证据；T-018 把字节预算/降级不缓存挂在超时用例上；T-019 的 401/403 行引作用域测试。已在各自 task 中改为真实测试名，并补 host 层 AC-02 用例。
- E3 AC-02 锚点: 原 `test/pipeline.test.mjs` 只证明 loader 构造不建目录，未覆盖插件装载；现补 `test/host.test.mjs::插件装载但未收到导出请求时不创建管线缓存目录`，pipeline 用例保留为组件级补充。
- E4 瞬态失败毒化: `cacheDirectoryPromise ??=` 会缓存 rejected Promise；已改为 rejection 时清空缓存，下一次 load 重试 mkdtemp。该路径无直接故障注入测试，登记为残余。
- E5 缺省值双定义: `DEFAULT_EXPORT_TIMEOUT_MS` 在 config 与 exporter 各有一份；语义已统一为“未显式配置取 max(120000, timeoutMs)，显式值不得小于 timeoutMs”，常量为热加载边界，暂不合并，登记为残余。
- E6 文档漂移: SOLUTION 的“启动时回收”改为“首次加载时回收”；超时路径改为“临时文件回收、子进程由 timeoutMs 终止，请求有界但任务可能占槽”；view/e2e 注释的“HEAD 完成即就绪”同步为 HEAD+GET。
- E7 CONVENTIONS 重复段: 规范 11 插入 managed 块后保留手写 Git 提交规范副本；已删除手写副本，仅保留 managed 块。eb04abf 修改 lint 未带 T-ID/`review:` 行属历史提交，不改写，登记为审计更正。
- E8 测试缺口: host 外层 catch 与 cause 链、fontconfig 空结果回退扫描、生成文件 0600、清理失败只记日志、PID 复用保留策略仍无直接用例；不阻断复位，登记为残余。
- E9 时序图: SOLUTION 图只画预览校验 GET，未画挂载后 iframe 自身 GET；正文已声明该请求不被观测，图注不视为矛盾，登记为残余。

## 终态与证据

- 实现: 独立审计子代理 `audit-window` 对窗口 `fe212eb..1cac2f6`（3 笔、语义行 1196）做 Spec/Standards 双轴审计；无 blocking。non-blocking 的 E2/E3/E4/E6/E7 已在复位提交前修正，E1/E5/E8/E9 登记为更正或残余；`review-host` 与 `review-client` 的逐 task 复核结论一并纳入。
- 测试: `node scripts/check.mjs` 通过（20 个源文件、client bundle 25436 字节）；`node --test test/*.test.mjs` 136 通过 0 失败；`node e2e/run.mjs` 两套 PASS（pdf-export 19458ms、pdf-failure 6512ms）；`python3 tools/agentmap_lint.py --report` 在复位提交前仅剩预期累计审计触发。
- SOLUTION 对照: 窗口内 PRD/SOLUTION/DOMAIN 与实现一致——私有目录/清理、字体与浏览器探测、exportTimeoutMs 语义、Markdown 深度预算、缓存字节与降级、HEAD→GET 校验均有实现与测试对应；残余 E5/E8/E9 不影响交付承诺。
- commit: 1cac2f6
- review:
  - 审核方: `audit-window`（累计审计独立子代理，与实现上下文隔离）；逐 task 复核方 `review-host`、`review-client`。
  - 目的理解: 回答窗口 `fe212eb..1cac2f6`（3 笔、语义行 1196）能否安全复位累计审计点——跨改动核验 T-017～T-020 是否兑现 PRD AC 与 SOLUTION 契约、错误/安全/超时语义是否自洽、证据与测试锚点是否真实。
  - 问题与修复: 无 blocking。non-blocking 九项：窗口少报一笔（E1）、矩阵测试映射失实（E2）、AC-02 锚点不实（E3）、mkdtemp 瞬态失败毒化（E4）、缺省值双定义与超时语义未写全（E5）、文档/注释漂移（E6）、CONVENTIONS 重复段与 eb04abf 无 review 行（E7）、测试缺口（E8）、时序图少画 iframe GET（E9）。E2/E3/E4/E6/E7 已在复位提交前修正；E1/E5/E8/E9 登记为更正或残余。
  - 复审结论: 两轴无 blocking，窗口可复位；CONVENTIONS 复位点随本收尾提交更新为 T-021，新窗口自该提交起算，语义行 1196 为窗口终值。
