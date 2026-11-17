---
doc-type: conventions
mutation: living
owner: agent 主笔，项目属主审批
---

# CONVENTIONS — 本项目开发规范

## 高频规则

- 开发期不得重启或停掉正在运行的 dsh 主实例；需要实测浏览器时，另起独立实例。
  - 主实例指东家正在使用的 `dsh web` / `dsh life` 进程；重启时机由东家决定。
  - 独立实例用隔离的 `DSH_HOME` 与随机端口（`dsh web --port 0`，e2e 运行器自带），验证后自行清理。
- 改动生效方式：渲染层（`src/` 纯逻辑模块与 `src/page-style.css`）在导出时热加载，改完直接刷新 PDF 视图即可。
  - 客户端 bundle 改动走 `pnpm build:client`，由客户端 HMR 自动重载。
  - 宿主装配与外壳（`host.mjs`、`route.mjs`、`config.mjs`、`chrome.mjs`、`fonts.mjs`、`pipeline.mjs`、`page-style.mjs`、依赖或 `cordis.patch.yml`）仍需重启，重启时机由东家决定。

## Git 提交规范

- 标题使用 `emoji 中文类型(scope): 中文结果描述`；标题与正文之间须空一行（commit-msg 校验）。
- emoji/type 固定配对：⭐ 功能、✨ 改进、🐛 修复、📝 文档、🧪 测试、📌 计划、🧹 维护、⚙️ 配置、♻️ 重构、🚀 发布。
- `scope` 使用小写字母、数字和连字符，首字符须为字母或数字，不使用 subscope。
- 普通提交正文必须包含 `## 原因`、`## 影响`、`## 取舍`；Merge、Revert、fixup 与 squash 使用 Git 生成标题。
- 实现、修正或关闭 task 的提交：正文须引用对应 `T-nnn`。
  - 目的：`git blame` → commit → task 可反查。
  - 不涉及 task 的提交：不要求引用。
  - 被引用的 task 必须真实存在，commit-msg 校验。
- `.githooks/commit-msg` 校验当前提交，`.githooks/pre-push` 重检 outgoing commits；项目附加规则放入 `.githooks/commit-msg.d/NN-name.sh`。

## 主题索引

- Git 提交规范: #git-提交规范
- AgentMap 本地参数: #agentmap-本地参数
- 验证门禁: #验证门禁
- 项目追加厚重主题时，在此登记一句话 + 锚点。

## AgentMap 本地参数

- 需求组按 `需求组 gg: 角色` 登记为编号账本（登记项永久保留，已退役组保留登记防复用）；活跃组的角色映射以 PRD 需求清单分节为准，两处不一致时 lint 报错并以分节为准修正。
- 需求组 01: 会话操作者
- agentmap 规范版本: 10
- 验证矩阵起始 task: T-001
- 代码审核起始 task: T-001
- 语义行阈值: 50
- 语义行排除路径: `*-lock.*`, `yarn.lock`, `*.min.js`, `*.min.css`, `dist/`, `build/`, `*.snap`, `*.pb.go`, `*_pb2.py`
- 累计审计 task 间隔: 10
- 累计审计行数间隔: 800
- 累计审计复位点: T-014 <!-- 累计审计收口：窗口 c3fda4c..c0670b9（4 笔）覆盖 T-012 助手左竖线、免重启规则与 T-013 渲染层热加载，语义行 907≥800 触发；复位于 T-014 收尾提交；每次累计审计收尾提交更新 -->
- 关键路径: 无
- 测试锚定模式: lite
- 测试锚点路径: test/*.test.mjs; e2e/specs/*.mjs
- 测试锚点排除路径: 无
- 代码锚点: 关闭
- 方案研判: 关闭
- 核心文档上限理由: canonical AGENTS.md 固定占 47695 字节，方案层与需求层需要约 20KB。
- 核心文档上限: 100000 字节

## 验证门禁

- `.d/` hook 统一使用 `NN-name.sh`，两位编号在同一目录内唯一；dispatcher 以 `LC_ALL=C` 按文件名顺序执行并在首个失败处停止。
- `.githooks/pre-push`：先对 outgoing commits 重放 `.githooks/commit-msg`，再执行 `pre-push.d/`。
- 权威验证入口: scripts/verify.sh
- pre-push 只重放 commit-msg 与 AgentMap lint；完整验证由 scripts/verify.sh 与 CI 承载。
- CI 门禁: 适用：`.github/workflows/ci.yml` 配置 docs 与 verify 两个 job；verify 跑构建、契约检查、单测与 e2e（锁定 DSH 0.2.0-rc.2、系统 Chrome 与 Noto CJK）
- `.githooks/pre-commit.d/20-agentmap-lint.sh`：AgentMap 结构、追溯与派生报告。
- `.githooks/pre-push.d/20-agentmap-lint.sh`：校验待推送历史的 AgentMap 不可变契约。
- 扫描来源：`.`（`.` 即仓库根；登记 bootstrap 时实际检查过的 manifest、CI、Makefile 与测试根目录）
