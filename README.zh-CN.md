# dsh-export-pdf

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) | 简体中文

DeepSeek Harness（DSH）Web 插件：在会话视图区增加一个 **PDF 页**。打开该页即可看到当前会话转录生成的 PDF 预览，点一下即可下载同一份文件；不选格式、不填参数、不跳转到外部转换工具。

> **状态：已发布（v0.1.0）。** 从 GitHub 安装带标签的版本；同一提交已随附构建好的浏览器 bundle。

## 前置条件

- 带 `web` profile 的 DSH 0.2.x。
- 宿主可执行的 Google Chrome、Chromium 或 Microsoft Edge；插件探测标准安装位置与 `PATH`。
- `fc-list :lang=zh` 能看到的 CJK 字体，或系统字体目录中存在的常见中文字体（例如 Noto Sans CJK SC）。

## 安装

```sh
dsh plugin --profile web add github:ccll/dsh-export-pdf#v0.1.0
dsh web
```

从本地 checkout 开发时改用本地路径安装：`dsh plugin --profile web add /path/to/dsh-export-pdf`。

仓库随附构建好的浏览器 bundle（`.dsh-plugin/client.js`），安装时无需构建。修改 `src/` 后运行 `pnpm build:client`；客户端入口是手工拼装的片段包，不是 Vite 工程。

## 使用

打开一个会话，在 Chat 与 Trajectory 旁选择 **PDF** 页。该页生成一次 PDF，用浏览器内置 PDF 查看器就地展示，并启用 **下载 PDF**。下载文件名为 `dsh-session-<会话标识前 8 位>.pdf`；会话标识的 `session-` 前缀先去掉再截取，避免不同会话重名。

页面按日志顺序呈现用户消息与助手回复，不包含思考块与内部运行上下文注入；消息图片默认显示为 `[图片]` 占位，标题栏的**图片**下拉可切换为嵌入原图或不导出。两个复选框分别按需加入文件附件占位与工具调用摘要，文件本体从不嵌入；同一组选择同时驱动预览与下载。选择附加内容或图片模式时，下载文件名追加 `-tools`、`-attachments`、`-images` 或 `-no-images`，避免不同版本互相覆盖。用户消息以浅色气泡右对齐并带小人图标，助手回复左对齐并带机器人图标，长会话里也能一眼区分双方。没有可渲染转录、或当前选择过滤后没有内容的会话显示空态提示，不启动浏览器渲染。

## 配置

插件接受四个配置项，写在 profile 的 patch 层，例如 `$DSH_HOME/profiles/web/cordis.patch.yml`：

```yaml
- id: export-pdf
  config:
    browserPath: /usr/bin/chromium
    timeoutMs: 45000
    exportTimeoutMs: 120000
    maxConcurrentRenders: 1
```

| 配置项 | 默认值 | 含义 |
|---|---|---|
| `browserPath` | 标准安装路径，再按 `PATH` 探测 | 显式指定 Chrome/Chromium；配置了不存在或不可执行的文件会让每次导出以 `503` 失败 |
| `timeoutMs` | `30000` | 单次渲染超时，1–600000 毫秒 |
| `exportTimeoutMs` | `120000` 与 `timeoutMs` 中较大者 | 单次导出总时限，覆盖读日志、图片解析与打印，1–600000 毫秒；显式设置时不得小于 `timeoutMs` |
| `maxConcurrentRenders` | `2` | 并发浏览器渲染数，1–16；超出排队 |

非法取值（包括 `exportTimeoutMs` 小于 `timeoutMs`）在插件装载期报错，不静默回退。

插件不导出 DSH `Config` schema，因此这些字段只能通过 profile patch 设置，Plugin Manager 不能编辑或做 schema 校验。界面文案为简体中文，客户端半区不注册 locale 字典。

## 行为

- **PDF 页**：会话视图区内的一个视图，同时提供预览与下载。
- **页内预览**：桌面视口下，生成的 PDF 用浏览器内置查看器就地呈现，可浏览全部页面。
- **窄视口（移动端）**：视口宽度不超过 720px 时，页内查看器替换为“打开完整 PDF”链接，在新标签页用系统查看器打开同一份 PDF，可浏览全部页面。
- **下载**：交付同一份字节，文件名固定为上述规则。
- **转录可信**：用户消息与助手回复按日志顺序呈现，标题、列表、引用、围栏代码、表格与行内强调按 Markdown 渲染；原始 HTML 只按文本转义，链接仅放行 http/https/mailto，Markdown 图片按图片模式处理（占位文字或嵌入本地原图）。图片模式之外的标题栏复选框可按需加入文件附件占位与工具调用单行摘要；思考块不进入正文。
- **中文可读**：嵌入中文字形，按 A4 分页；关闭 Chrome 默认页眉页脚，不打印日期、标题或临时文件路径。
- **失败可见**：会话不存在、日志不可读、缺少浏览器、缺少中文字体、渲染失败或超时都会在页内给出明确提示，且不留下半份文件；单次导出总时限也覆盖卡住的日志或图片读取。失败结果不缓存，**重试**会重新生成；图片读取失败的降级结果同样不缓存，重试可恢复原图。
- **只读导出**：导出不写会话日志，也不留下会话内容产物；热加载管线缓存位于 0700 私有临时目录，插件卸载时删除。
- **仅限已认证的同源请求**：路由注册在 DSH 的 `/api` 通道上，宿主的浏览器鉴权与 Host/Origin 栅栏先于插件生效。
- **图片模式**：标题栏图片下拉提供占位（默认）、嵌入原图与不导出。嵌入同时覆盖上传的图片与本会话正文里用 Markdown 语法引用的本地图片：上传图片取自附件库，本地图片经宿主文件服务读取（读取权限与宿主进程一致，宿主沙箱只约束写入；拒绝最终符号链接；只接受常见图片扩展名与真实图片字节），统一按版心缩放，读取失败回退 `[图片]` 或 `[图片: alt]`；http、https 远程图片地址从不抓取，其它文件从不嵌入。
- **按选择复用**：同一会话、同一内容选择与图片模式的并发请求合并为一次渲染；日志长度或选择变化前复用缓存结果。

## 开发

```sh
pnpm install
pnpm check          # 已提交 bundle 一致性、bundle/源码语法、manifest
pnpm build:client   # 改动 src 后重建 bundle
pnpm test           # 单元测试 + 真实 Chrome PDF 集成
pnpm test:e2e       # 隔离 DSH 环境中的浏览器验收
pnpm lint:agentmap  # AgentMap 结构、追溯与契约覆盖
```

改动生效方式：

- `PIPELINE_MODULES`（`src/pipeline.mjs`）列出的模块与 `src/page-style.css` 在导出时热加载，改完刷新 PDF 视图即可，不需要重启 `dsh`。`src/errors.mjs`、`src/process.mjs` 与宿主装配不热加载。
- 客户端 bundle 改动走 `pnpm build:client`，由客户端 HMR 自动重载页面。
- 宿主装配与外壳（`src/host.mjs`、`src/route.mjs`、`src/config.mjs`、`src/chrome.mjs`、`src/fonts.mjs`、`src/errors.mjs`、`src/process.mjs`、`src/pipeline.mjs`、`src/page-style.mjs`、依赖与 `cordis.patch.yml`）在启动时固定，改动仍需重启。

`pnpm test` 在宿主缺少 Chrome 或 CJK 字体时跳过真实浏览器集成。`pnpm test:e2e` 会创建临时 `$DSH_HOME`、启动 mock LLM、安装本仓库、用随机端口运行 `dsh web`，再通过 `playwright-core` 驱动系统 Chrome；不触碰正在运行的 GUI 或用户的 web profile。Chrome 不在 `/usr/bin/google-chrome` 时用 `CHROME_PATH` 指定。

Git 钩子位于 `.githooks/`，需要在每个克隆中单独启用：

```sh
git config core.hooksPath .githooks
```

## 设计文档

- [PRD.md](PRD.md) —— 目标、非目标、里程碑、需求与验收点。
- [SOLUTION.md](SOLUTION.md) —— 架构、产品契约、不变量与失败语义。
- [DOMAIN.md](DOMAIN.md) —— 文档共用的领域词汇。
- [RATIONALE/](RATIONALE/) —— 关键选择的决策依据。
- [tasks/](tasks/) —— 每次变更的方案与执行证据。

## 里程碑

| 里程碑 | 范围 | 状态 |
|---|---|---|
| M-001 PDF 页 | 视图页、页内预览、页内下载 | 由 T-001 交付 |
| M-002 转录正确性 | 事件顺序、中文、分页 | 由 T-001 交付 |
| M-003 失败与边界 | 失败可见、只读导出、请求鉴权 | 由 T-001 交付 |
| M-004 消息版式 | 用户消息右对齐、助手回复左对齐 | 由 T-003 交付 |
| M-005 角色图标 | 用户小人、助手机器人 | 由 T-004 交付 |
| M-006 导出内容选择 | 默认最简，按需加入工具摘要与文件附件占位 | 由 T-005 交付 |
| M-007 图片导出模式 | 图片占位、嵌入原图或不导出 | 由 T-007 交付 |
| M-008 移动端 PDF 访问 | 窄视口在新标签页打开完整 PDF | 由 T-009 交付 |
| M-009 Markdown 渲染 | 标题、列表、引用、围栏代码、表格、行内强调 | 由 T-010 交付 |

## 许可

MIT，见 [LICENSE](LICENSE)。
