---
doc-type: task
mutation: lifecycle
id: T-001
---

# T-001 会话导出为 PDF 的宿主路由与 PDF 视图页

状态: active
类型: 新功能
风险等级: major
风险面: 对外接口（新增 `/api/session.pdf` 路由与状态码）、鉴权（路由承载会话内容导出）
关联需求: R-01-001/AC-01～AC-03、R-01-002/AC-01～AC-03、R-01-003/AC-01～AC-03、R-01-004/AC-01～AC-03、R-01-005/AC-01～AC-03、R-01-006/AC-01～AC-04、R-01-007/AC-01～AC-02、R-01-008/AC-01～AC-02

## 背景与目标

- 背景: 仓库只有 PRD/SOLUTION/RATIONALE，没有实现、task 与可执行测试；SOLUTION 的实现就绪检查把全部需求交给 T-001。东家 2026-11-16 拍板两项口径：用户消息只收 `source.kind === 'user'` 的真人输入；折叠后无内容时新增 `204` 响应。
- 评审后拍板（东家 2026-11-16）: AC-03 的空态可见性改为“宿主渲染该页且会话尚无消息”成立（C-003），因为宿主在 blank 阶段不渲染视图区；会话归属与访问控制明确由宿主鉴权边界承担（C-004），插件只校验格式；子会话记录为“读取后、渲染前拒绝”。另将 R-01-007/AC-01 的 `当…完成后` 规范为 `当…完成时`，语义不变，只为符合 EARS 时态句式。
- 目标: 交付可装载的 DSH Web 插件——宿主半区注册鉴权内的 PDF 路由，浏览器半区注册 `conversation.view` 的 `PDF` 页；页面内先用同源 HEAD 触发并等待生成，再以原生查看器预览，下载复用同一份字节。
- 非目标: 不改宿主、不引入运行时 npm 依赖、不落盘、不做页码/模板/主题（PRD NG-4、NG-5、C-002）；不导出子会话（NG-6）。

## 差距评估

- PRD: 8 条需求、23 条 AC 全部只有文档，没有实现与测试锚点。
- SOLUTION: 契约、失败语义与配置已定义；实现位置原先指向不存在的 TypeScript 路径，已在本 task 内改为 `.mjs` 落点，并补 `204`、子会话 `400`、真人消息口径与字体探测方式。
- DOMAIN: 术语齐备，不需要演进。
- 代码: `src/`、`package.json`、`cordis.patch.yml`、客户端 bundle 均不存在。
- 测试: 无单元测试、无 PDF 集成测试、无 e2e 隔离环境，`.github/workflows/ci.yml` 只跑文档 lint。

## 收敛方案

1. 宿主入口: `src/host.mjs` 导出 `name`、`inject: ['connection', 'sessionQuery']`、`apply`；用 `ctx.connection.fetch.register` 注册 `GET`/`HEAD /api/session.pdf`，`requestBody: 'buffered'`，路由生命周期挂在 `ctx.effect`。
2. 参数与状态: `sessionId` 非空且长度受限，缺失/非法 `400`；`disposition` 只接受 `inline`/`attachment`，缺省 `inline`，其它值 `400`；会话不存在或日志读失败 `404`；`origin === 'subagent'` 或 `delegationDepth > 0` 的会话 `400`（fork 仍有 `parentSession`，不据此拒绝）；折叠结果为空 `204`；浏览器缺失或中文字体缺失 `503`；渲染失败/超时 `500`。错误响应 `text/plain; charset=utf-8`，只给简要原因，不回显日志内容、stderr 或路径，并带同源机器码 `x-dsh-export-error` 供 HEAD 的页内提示映射。`sessionId` 只接受 ASCII 字母、数字与 `.`、`_`、`:`、`-`；非 GET/HEAD 在 handler 内返回 `405`，但宿主只转发已注册方法，该分支是防御而非对外契约。
3. 转录折叠: 按 `readSession` 返回的事件顺序遍历；`user/message` 仅收 `source.kind === 'user'`，取 `text` 块并按顺序拼接，图片/文件块降为占位符；`assistant/message` 只取 `text` 块，跳过 `reasoning` 与 `tool-call` 块；`tool/call` 生成单行“工具名 + 参数摘要”；`tool/result`、`assistant/attempt`、思考块一律不渲染。不排序、不重排事件。
4. HTML 渲染: 纯函数字符串拼接，全部文本经 HTML 转义；`@page { size: A4; margin: 18mm 16mm }`；中文无衬线字体栈；`white-space: pre-wrap` 与 `overflow-wrap: anywhere` 防止长工具参数越界；不给消息块加 `break-inside: avoid`，保证跨页续排；无页眉页脚、页码、时间戳、会话标题与路径。
5. 打印: 解析 `browserPath`，为空时按 `google-chrome`、`google-chrome-stable`、`chromium`、`chromium-browser`、`microsoft-edge` 探测 PATH；`--headless` + `--no-pdf-header-footer` + 独立 `--user-data-dir`，root 运行时补 `--no-sandbox`；子进程只收到最小环境变量（过滤凭据类键）；临时 HTML/PDF 写在 `mkdtemp` 目录，成功、失败、超时三路都递归删除；超时杀进程组并按失败处理；产物校验 `%PDF-` 魔数与非零字节。
6. 缓存与并发: 每会话缓存 `{日志长度, 字节}`，键为会话标识，日志长度变化即重新渲染；LRU 上限 32 条（内部参数，不对外承诺）；同会话单飞，等待者复用同一 promise，拿到结果后重新读长度决定是否再渲染；跨会话用信号量限制并发渲染数为 `maxConcurrentRenders`，超出排队。
7. 字体: `fc-list :lang=zh` 有输出即视为可用；无 fontconfig 时递归扫描 Linux/macOS/Windows 常见字体目录，按 CJK 字体名匹配；结果缓存在进程内；缺失时在启动浏览器前 `503`。
8. 客户端: `src/view.mjs` 用 React 元素注册 `conversation.view` 条目（`id: 'pdf'`、`order: 20`、固定标签 `PDF`）；`useSession(s => s.blank)` 为空时直接显示空态且不发请求；否则 HEAD 同源路由，200 显示 iframe 预览与下载按钮，204 显示空态，其它状态显示失败原因与重试；生成中显示“正在生成 PDF”，下载按钮在就绪前禁用；下载用 GET + Blob 保存为 `dsh-session-<前 8 位>.pdf`，失败转页内提示。
9. 打包: `package.json` 声明 `dsh.bundle.patch` 与 `dsh.client`，宿主入口 `.dsh-plugin/index.mjs` 转发 `src/host.mjs`；`scripts/build-client.mjs` 把 `src/naming.mjs`、`src/view-state.mjs`、`src/view.mjs`、`src/client.mjs` 拼成 `window.__ModuleLoader__.load({ id: 'dsh-export-pdf', factory })` 并把 `exports.apply` 暴露给宿主模块系统；`cordis.patch.yml` 插入 `export-pdf` 行；构建产物入库并由 `scripts/check.mjs` 校验与源码一致。
10. map: 同步 SOLUTION 的契约表、转录口径、字体探测与实现位置；task 关闭时勾选 PRD 的 8 条索引行并更新 SOLUTION 核对日期。

## 测试计划

- `node --test test/transcript.test.mjs`：真人消息过滤、顺序、思考块与工具调用去重、参数摘要、空结果。
- `node --test test/render.test.mjs`：HTML 转义、A4 样式、中文文本保留、无页眉页脚/时间戳、工具单行、跨页可断。
- `node --test test/exporter.test.mjs`：缓存命中不二次打印、日志增长重渲染、同会话单飞、并发上限、超时/失败不缓存、空结果、子会话拒绝、字体缺失前置拒绝。
- `node --test test/route.test.mjs`：400/404/204/500/503、HEAD 无正文且响应头与 GET 一致、disposition、文件名、纯文本错误、不泄露路径。
- `node --test test/pdf.test.mjs`：真实 Chrome 打印，`pdfinfo` 断言 A4 与页数，`pdftotext` 断言中文可抽取、无页眉页脚、无缺字占位。
- `node scripts/check.mjs` 与 `node --test test/view-state.test.mjs`：构建产物契约（模块加载器包装、包 id、apply/inject、无裸 import）与视图状态判定函数。
- `node e2e/run.mjs`：隔离 `DSH_HOME` + mock LLM + 随机端口启动 `dsh web`；创建含中文往返的会话，断言 PDF 页、生成中/就绪、iframe 预览请求、预览与下载字节一致、下载文件名与 PDF 魔数、中文可抽取、A4；空会话不触发路由；无凭据与异源请求被拒；导出前后会话日志字节不变；另起一套把 `browserPath` 配成不存在的文件，断言 503、页内具体原因、预览/下载不可用与重试仍失败。
- `python3 tools/agentmap_lint.py --report`：文档与追溯门禁。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：会话生成 PDF、预览与下载同一份字节 | `e2e/specs/pdf-export.mjs::R-01-002/AC-01`、`test/route.test.mjs::R-01-003/AC-01` |
| 异常 | 适用：会话不存在、浏览器缺失、字体缺失、打印失败、参数非法、子会话 | `test/route.test.mjs::R-01-006/AC-02`、`test/exporter.test.mjs::R-01-006/AC-01`、`e2e/specs/pdf-failure.mjs::R-01-006/AC-01` |
| 边界配置 | 适用：browserPath 为空按 PATH 探测、timeoutMs 与 maxConcurrentRenders 生效、空转录 204、非 ASCII sessionId 400 | `test/config.test.mjs::timeoutMs`、`test/exporter.test.mjs::R-01-003/AC-02` |
| 副作用 | 适用：会话日志只读、临时目录清理、缓存不落盘 | `e2e/specs/pdf-export.mjs::R-01-007/AC-01`、`test/exporter.test.mjs::R-01-007/AC-02` |
| 安全 | 适用：无凭据 401、异源拒绝、错误不回显路径、路由注册在宿主鉴权通道 | `e2e/specs/pdf-export.mjs::R-01-008/AC-01`、`test/host.test.mjs::R-01-008/AC-01` |
| 兼容性 | 适用：HEAD/GET 响应头一致、`conversation.view` 在宿主 0.2.0-rc.2 装载 | `test/route.test.mjs::R-01-006/AC-02`、`e2e/specs/pdf-export.mjs::R-01-001/AC-01` |
| 性能 | 适用：缓存命中不重复渲染、同会话并发合并 | `test/exporter.test.mjs::R-01-003/AC-02` |

## 自查清单

- 边界：空会话/空转录、单条消息、跨页长消息、超长工具参数、无换行长串均不越界且不产生空文件。
- 异常路径：浏览器缺失、字体缺失、打印超时、非零退出、会话不存在、子会话、非法 disposition 均返回契约状态码并保留页内可读提示。
- 回归影响：宿主现有 `/api` 路由不受影响；插件卸载后路由与视图条目移除；导出不写会话日志与不落盘。
- 残余风险：超大日志的 `readSession` 全量校验耗时未做上限；浏览器冷启动实测约 1.45 秒，首个预览有可感知等待；页宽断行由浏览器排版决定，超长不可断行 token 依赖 `overflow-wrap`。
- 环境限制：系统全局安装的 DSH 带有 `dsh-web-auth-disabled 2026-10-13` 补丁，浏览器鉴权恒通过。e2e 因此改用 `devDependencies` 锁定的 0.2.0-rc.2（未打补丁）启动隔离实例，无凭据请求实测 401（R-01-008/AC-01），异源请求实测 403（AC-02）；不使用全局安装做验收。
- CI 闭环：`verify` job 安装 Noto CJK 与 poppler-utils，先验证 `google-chrome`、`fc-list`、`pdfinfo` 可用再跑测试；CI 环境下缺少这些依赖会让 `test/pdf.test.mjs` 直接失败而不是跳过，避免 A4/中文断言零覆盖。

## 终态与证据

关闭时填写实现、测试、SOLUTION 对照、commit 与独立 review 证据。
