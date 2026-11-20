---
doc-type: task
mutation: lifecycle
id: T-017
---

# T-017 渲染管线私有临时目录与 bundle 门禁

状态: completed
类型: 安全加固与构建门禁
风险等级: major
风险面: 安全（生成模块的临时目录与写后 import 执行面）；构建门禁（客户端 bundle 一致性）
决策依据: 东家 2026-11-20 按审查推荐批准整改；安全方案采用 `mkdtemp` 私有目录，不引入运行时依赖。

## 背景与目标

- 背景: 审查发现 `src/pipeline.mjs` 使用可预测的 `tmpdir()/dsh-export-pdf/pid-<pid>`，`mkdir` 接受已存在目录，写入后直接 `import`；本机实测目录 0775、文件 0664，并累积 57 个 pid 目录。
- 目标:
  - 每个管线加载器使用 0700 私有临时目录，目录名不可预测。
  - 生成模块原子写入；插件卸载时删除私有目录；启动时清理超龄且进程已不在的旧目录。
  - `scripts/verify.sh`、`package.json` 与 CI 先做 bundle 一致性检查再构建，避免检查被构建顺序抵消。
  - `scripts/check.mjs` 对客户端 bundle 做语法检查，并用字节数而非字符数报告大小。
- 非目标: 不改变导出 HTTP 契约、文件名、渲染输出与页面样式；不为临时目录引入外部依赖。

## 差距评估

- 现状: `createPipelineLoader` 在 `src/pipeline.mjs:116` 计算可预测目录，`src/pipeline.mjs:134-137` 直接 `mkdir`、`writeFile`、`import`；没有 `dispose`，也不回收跨进程目录。
- 门禁: `scripts/verify.sh:6-7`、`package.json:40`、`.github/workflows/ci.yml:53-54` 都是先构建后检查；`scripts/check.mjs:14-16` 的比较因此恒真，`scripts/check.mjs:25-28` 不解析 bundle，`scripts/check.mjs:39` 把字符数写成字节数。
- 影响面: `src/pipeline.mjs`、`src/host.mjs::apply`、`scripts/check.mjs`、`scripts/verify.sh`、`package.json`、CI、`README.md`、`README.zh-CN.md`、`CONVENTIONS.md`、`SOLUTION.md`、相关测试。

## 收敛方案

1. 私有目录:
   - 默认在首次 `load()` 时用 `mkdtemp(join(tmpdir(), 'dsh-export-pdf-'))` 创建；目录权限由 `mkdtemp` 保证 0700。
   - 保留 `cacheDirectory` 选项供测试与显式调用；显式目录用 `mkdir(..., { recursive: true, mode: 0o700 })`。
   - 生成文件先写同目录临时文件，再 `rename`；文件名仍带内容哈希。
2. 生命周期:
   - 暴露 `dispose()`，删除默认私有目录；宿主的 `ctx.effect` 注册 disposer。
   - 首次加载时扫描 `tmpdir()` 下 `dsh-export-pdf-*` 与旧版 `dsh-export-pdf/pid-*`；只删除超过 24 小时且对应 PID 已不存在的目录，避免误删仍在运行的实例。
3. 门禁:
   - `check` 在 `build` 之前运行；CI 构建后加 `git diff --exit-code -- .dsh-plugin/client.js`。
   - `check.mjs` 对 `.dsh-plugin/client.js` 执行 `node --check`；大小输出改用 `Buffer.byteLength`。
4. 文档: 更新 SOLUTION 的临时模块段、CONVENTIONS 的验证顺序与 README 的开发命令。
- 无分叉点: 东家已按审查推荐拍板 `mkdtemp` 方案；不引入新依赖，另一种 `mkdir` + 属主校验无法消除父目录预创建风险，故不采用。

## 测试计划

- 先加失败测试：默认加载器生成私有目录（0700）、`dispose` 删除目录、两个加载器目录不同、旧目录清理只删除超龄且 PID 不在的目录。
- 门禁脚本按新顺序执行：`node scripts/check.mjs` 在 `node scripts/build-client.mjs` 之前通过；手工改 `src/view.mjs` 后未重建时 check 应失败（用副本验证，不改工作区）。
- 回归：现有 `test/pipeline.test.mjs::默认管线缓存使用随机私有目录，dispose 删除目录`、`test/hot-reload.test.mjs::改渲染模块后下一次导出直接使用新代码`、`node scripts/check.mjs`、两套 e2e。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：私有目录创建、模块加载与热更新仍可用 | `test/pipeline.test.mjs::默认管线缓存使用随机私有目录，dispose 删除目录`、`test/hot-reload.test.mjs::改渲染模块后下一次导出直接使用新代码` |
| 异常 | 适用：首次加载失败、目录清理失败、旧目录不可删除 | `test/pipeline.test.mjs::新版本加载失败时沿用上一版并记录日志`、`test/pipeline.test.mjs::源码读取失败时沿用上一版并记录日志` |
| 边界配置 | 适用：显式 `cacheDirectory`、超龄目录、PID 复用与跨平台 | `test/pipeline.test.mjs::启动清理只删除超过 24 小时且进程已不存在的旧目录`、`test/pipeline.test.mjs::两个加载器的默认缓存目录互不共用` |
| 副作用 | 适用：卸载清理、并发加载、旧目录回收 | `test/pipeline.test.mjs::生成文件落在缓存目录，并发加载复用同一模块`、`test/host.test.mjs::插件装载但未收到导出请求时不创建管线缓存目录` |
| 安全 | 适用：目录 0700、不可预测路径、原子写入 | `test/pipeline.test.mjs::默认管线缓存使用随机私有目录，dispose 删除目录` |
| 兼容性 | 适用：热更新、导出输出与 HTTP 契约不变 | `test/hot-reload.test.mjs::管线源码未变化时不重建编排器`、`test/route.test.mjs::GET 成功返回 PDF 与 inline 文件名` |

## 自查清单

- [x] 边界：默认目录随机且 0700；显式目录仍可用；旧目录清理只删超龄且 PID 不在的目录。
- [x] 异常：mkdtemp/write/rename/import 失败时沿用上一版；清理失败只记日志。
- [x] 回归：热加载、导出输出、HTTP 契约与 e2e 不变；bundle 门禁在构建前可失败。

## 终态与证据

- 实现: 默认缓存改为 `mkdtemp` 生成的 0700 私有目录（前缀含 PID），生成模块先写 0600 临时文件再 rename；`dispose()` 删除私有目录并注册到宿主 `ctx.effect`；启动首次加载时回收超龄且 PID 已不存在的旧目录。bundle 门禁改为 check 先于 build，CI 构建后校验 `git diff`，check 对 bundle 做 `node --check` 并按 UTF-8 字节报告。
- 测试: `node --test test/pipeline.test.mjs` 13 通过、`test/hot-reload.test.mjs` 4 通过；全量 `node --test test/*.test.mjs` 136 通过 0 失败；`node scripts/check.mjs` 通过（20 源文件、bundle 25436 字节）；临时副本追加字节后 check 退出 1，证明构建前可发现漂移；`node e2e/run.mjs` 两套 PASS。
- SOLUTION 对照: SOLUTION 的临时模块段、CONVENTIONS 验证门禁与 README 开发命令已同步私有目录、首次加载回收、check→build→drift 的顺序；HTTP 契约与导出输出未变。
- commit: 1cac2f6
- review:
  - 审核方: `review-host`（独立子代理，双轴审核）
  - 目的理解: 核验可预测共享临时目录写后 import 的风险是否被私有目录、原子写与生命周期清理消除，以及 bundle 门禁是否在构建前真正可失败。
  - 问题与修复: 无 blocking。non-blocking 为 hot-reload 测试仍落默认目录（已改 fixture 内显式 cacheDirectory，实测 tmpdir 25→25）、`pnpm verify` 缺构建后 drift diff（已补）、pipeline 测试会清扫真实 tmpdir 与 PID 复用漏删（登记为残余）。
  - 复审结论: 私有目录权限/随机名/原子写/清理路径与门禁顺序均成立，无 blocking；残余不阻断交付。
