# dsh-export-pdf

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) | 简体中文

DeepSeek Harness（DSH）Web 插件：在会话视图区增加一个 **PDF 页**。打开该页即可看到当前会话转录生成的 PDF 预览，点一下即可下载同一份文件；不选格式、不填参数、不跳转到外部转换工具。

> **状态：已实现（0.1.0）。** 任务 T-001 已交付插件、测试与浏览器验收。当前通过本地 link 安装，尚未发布带标签的版本。

## 前置条件

- 带 `web` profile 的 DSH 0.2.x。
- 宿主可执行的 Google Chrome 或 Chromium。
- `fc-list :lang=zh` 能看到的 CJK 字体（例如 Noto Sans CJK SC）。

## 安装

```sh
dsh plugin --profile web add /path/to/dsh-export-pdf
dsh web
```

仓库随附构建好的浏览器 bundle（`.dsh-plugin/client.js`），安装时无需构建。修改 `src/` 后运行 `pnpm build:client`；客户端入口是手工拼装的片段包，不是 Vite 工程。

## 使用

打开一个会话，在 Chat 与 Trajectory 旁选择 **PDF** 页。该页生成一次 PDF，用浏览器内置 PDF 查看器就地展示，并启用 **下载 PDF**。下载文件名为 `dsh-session-<会话标识前 8 位>.pdf`；会话标识的 `session-` 前缀先去掉再截取，避免不同会话重名。

页面按日志顺序呈现用户消息与助手回复，不包含思考块与内部运行上下文注入；消息图片默认显示为 `[图片]` 占位，标题栏的**图片**下拉可切换为嵌入原图或不导出。两个复选框分别按需加入文件附件占位与工具调用摘要，文件本体从不嵌入；同一组选择同时驱动预览与下载。选择附加内容或图片模式时，下载文件名追加 `-tools`、`-attachments`、`-images` 或 `-no-images`，避免不同版本互相覆盖。用户消息以浅色气泡右对齐并带小人图标，助手回复左对齐并带机器人图标，长会话里也能一眼区分双方。没有可渲染转录、或当前选择过滤后没有内容的会话显示空态提示，不启动浏览器渲染。

## 配置

插件接受三个配置项，写在 profile 的 patch 层，例如 `$DSH_HOME/profiles/web/cordis.patch.yml`：

```yaml
- id: export-pdf
  config:
    browserPath: /usr/bin/chromium
    timeoutMs: 45000
    maxConcurrentRenders: 1
```

| 配置项 | 默认值 | 含义 |
|---|---|---|
| `browserPath` | 按 `PATH` 探测 | 显式指定 Chrome/Chromium；配置了不存在或不可执行的文件会让每次导出以 `503` 失败 |
| `timeoutMs` | `30000` | 单次渲染超时，1–600000 毫秒 |
| `maxConcurrentRenders` | `2` | 并发浏览器渲染数，1–16；超出排队 |

非法取值在插件装载期报错，不静默回退。

## 行为

- **PDF 页**：会话视图区内的一个视图，同时提供预览与下载。
- **页内预览**：桌面视口下，生成的 PDF 用浏览器内置查看器就地呈现，可浏览全部页面。
- **窄视口（移动端）**：视口宽度不超过 720px 时，页内查看器替换为“打开完整 PDF”链接，在新标签页用系统查看器打开同一份 PDF，可浏览全部页面。
- **下载**：交付同一份字节，文件名固定为上述规则。
- **转录可信**：默认按日志顺序呈现用户消息与助手回复的文本；图片按图片模式处理，标题栏复选框可按需加入文件附件占位与工具调用单行摘要；思考块不进入正文。
- **中文可读**：嵌入中文字形，按 A4 分页；关闭 Chrome 默认页眉页脚，不打印日期、标题或临时文件路径。
- **失败可见**：会话不存在、日志不可读、缺少浏览器、缺少中文字体、渲染失败或超时都会在页内给出明确提示，且不留下半份文件；失败结果不缓存，**重试**会重新生成。
- **只读导出**：导出不写会话日志，也不留下任何文件。
- **仅限已认证的同源请求**：路由注册在 DSH 的 `/api` 通道上，宿主的浏览器鉴权与 Host/Origin 栅栏先于插件生效。
- **图片模式**：标题栏图片下拉提供占位（默认）、嵌入原图与不导出；嵌入只读取本会话消息引用的附件，按版心缩放，读取失败回退 `[图片]`；文件附件从不嵌入。
- **按选择复用**：同一会话、同一内容选择与图片模式的并发请求合并为一次渲染；日志长度或选择变化前复用缓存结果。

## 开发

```sh
pnpm install
pnpm build:client
pnpm check          # bundle 一致性、模块包装、manifest、语法
pnpm test           # 单元测试 + 真实 Chrome PDF 集成
pnpm test:e2e       # 隔离 DSH 环境中的浏览器验收
pnpm lint:agentmap  # AgentMap 结构、追溯与契约覆盖
```

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

## 许可

MIT，见 [LICENSE](LICENSE)。
