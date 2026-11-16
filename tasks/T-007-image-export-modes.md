---
doc-type: task
mutation: lifecycle
id: T-007
---

# T-007 图片导出模式：不导出、占位或嵌入原图

状态: completed
类型: UI/UX 改进
风险等级: major
风险面: 对外接口参数、PDF 内容与缓存键变化，并触及会话附件读取与敏感图片边界
决策依据: C-006；东家 2026-11-17 拍板独立三态图片选择，默认占位，文件附件单独控制。

## 背景与目标

- 背景: 当前图片只有“附件占位”一条路径，无法在 PDF 中嵌入原图；占位复选框同时控制图片与文件，也无法表达“图片嵌入、文件仅占位”。
- 目标: 图片提供不导出/占位/嵌入原图三态，默认占位；文件附件独立复选框只控制文件占位；预览、下载、文件名、缓存共享同一图片模式。
- 非目标: 不嵌入任意文件本体，不把 PDF 内图片转成可下载附件，不按外部 URL 抓图，不导出思考块或工具结果。

## 差距评估

- 现状: `foldTranscript` 只产出文本占位；`include=attachments` 同时控制图片与文件；导出器没有附件读取依赖；路由没有图片模式参数。
- 差距: 无三态图片模式；无原图读取与内联渲染；无图片模式缓存隔离、文件名后缀和视图控件。
- 影响面: `src/selection.mjs`、新增 `src/images.mjs`、`src/transcript.mjs`、`src/render.mjs`、`src/exporter.mjs`、`src/route.mjs`、`src/naming.mjs`、`src/host.mjs`、`src/view.mjs`、`src/view-state.mjs`、客户端 bundle、PRD/SOLUTION/DOMAIN 与测试。

## 收敛方案

- 选择契约: `include` 保留 `tools`、`attachments`，但 `attachments` 只控制文件附件；新增 `image=placeholder|embed|none`，缺省 `placeholder`，未知值 400。
- 转录: 消息条目保留文本/图片分段；占位模式把图片转为 `[图片]`，文件只在 `attachments` 选中时转为 `[附件: 文件名]`；不导出模式省略图片；嵌入模式保留图片引用供解析。
- 附件读取: 宿主注入 `ctx.attachments`，导出器用 `readImage(ref)` 读取并校验字节；只读日志中的附件引用，图片失败/缺失/格式不支持回退 `[图片]`，不中断整份导出。
- 渲染: 图片以 data URI 内联到消息原位，限制在版心宽度内，单图不跨页；文本、图片、后续文本保持原顺序。
- 文件名与缓存: 缺省占位不追加图片后缀；`embed` 追加 `-images`，`none` 追加 `-no-images`；缓存键包含图片模式。
- 视图: 标题栏新增“图片”下拉（占位/嵌入原图/不导出）与“文件附件”复选框；选择变化取消旧 HEAD/iframe/下载请求；新会话回到默认占位、文件不勾。
- 无分叉点: 东家已拍板独立三态、默认占位与文件独立；参数名、分段结构与 data URI 实现属实现自由。

## 测试计划

- 转录单测: 三种图片模式、纯图片消息、文件与图片独立、图文顺序。
- 影像解析单测: data URI、重复图片去重、失败回退占位、只接受图片引用。
- 渲染单测: 文本/图片分段顺序、data URI 转义、图片块结构与无图片路径。
- 导出器单测: 图片模式缓存隔离、占位不读图、嵌入读取、失败回退。
- 路由与文件名单测: image 缺省/合法/非法、图片后缀与组合顺序。
- 视图状态单测: URL 带 image、默认省略、选择键与文件名。
- 真实 Chrome PDF: 合成 PNG 嵌入后 `pdfimages` 可见，占位/不导出不可见；图片不越界。
- e2e: 图片下拉默认占位、切嵌入/不导出后 URL 与文件名、预览与下载字节一致；mock 无图片，内容层由真实 Chrome 用例覆盖。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：嵌入原图、占位与图文顺序可用真实 Chrome 复核 | `test/pdf.test.mjs::R-01-012/AC-03`、`test/render.test.mjs::R-01-012/AC-02` |
| 异常 | 适用：非法 image 参数与读取失败回退 | `test/route.test.mjs::R-01-012/AC-01`、`test/images.test.mjs::R-01-012/AC-03` |
| 边界配置 | 适用：三种模式、纯图片消息与文件独立 | `test/transcript.test.mjs::R-01-012/AC-02`、`test/transcript.test.mjs::R-01-012/AC-04` |
| 副作用 | 适用：选择/模式变化取消旧请求，缓存与文件名不跨模式复用 | `test/exporter.test.mjs::R-01-012/AC-05`、`test/view-state.test.mjs::R-01-012/AC-05`、`test/naming.test.mjs::R-01-012/AC-05` |
| 安全 | 适用：只读附件引用，不按外部 URL 抓取 | `test/images.test.mjs::R-01-012/AC-06`、`e2e/specs/pdf-export.mjs::R-01-012/AC-05` |
| 兼容性 | 适用：默认占位仍可用默认地址与文件名 | `test/naming.test.mjs::R-01-011/AC-06`、`e2e/specs/pdf-export.mjs::R-01-012/AC-05` |

## 自查清单

- [x] 边界：纯图片消息在占位/嵌入保留、不导出省略；纯文件消息只由文件复选框控制。
- [x] 异常：image 非法值 400；附件缺失/损坏/格式不支持回退占位，不返回半份 PDF。
- [x] 回归：A4、分页、中文、右对齐、角色图标、工具摘要与默认文件名不变。
- [x] 交互：切换图片模式或文件复选框会取消旧请求，预览与下载同一模式。
- [x] 安全：只从日志附件引用读图，不读任意路径/URL；PDF 不泄露宿主路径。

## 终态与证据

- 实现: 新增 `image=placeholder|embed|none`（缺省 placeholder）；`include=attachments` 收敛为只控制文件占位；转录保留图文分段，嵌入模式经 `ctx.attachments.readImage(ref)` 读取附件并内联 data URI，单图失败回退 `[图片]`。视图增加图片下拉与“文件附件”复选框；缓存键与文件名按图片模式隔离（`-images`/`-no-images`）；客户端 bundle 已重建。实现提交 `07d2b47`，复审修复 `2ac29fe`。
- 测试: `pnpm verify` 通过——`pnpm test` 66 通过（转录三模式/纯图片/文件独立、images 解析与 URL 拒绝、render 分段与 MIME、exporter 缓存/回退、route image 校验、naming/view-state 后缀与 URL、真实 Chrome 三模式与 800×400 图版心宽度）；`pnpm test:e2e` 两套通过（图片下拉默认占位、embed/none 地址与文件名、预览下载同字节）；`pnpm check` 通过。
- SOLUTION 对照: R-01-012 AC-01..06 与 SOLUTION 产品契约/核心不变量/运行时失败语义一致；R-01-011 默认含图片占位、文件由 `attachments` 独立控制的修订已同步；DOMAIN 附件占位只指文件；未发现残留差异。
- commit: 2ac29fe
- review:
  - 审核方: code-review skill 双轴独立子代理（Standards 4cf91aae / Spec efcbd376），复审由同一审核方执行
  - 目的理解: 让 PDF 的图片可在不导出、占位与嵌入原图之间独立选择，默认占位；文件附件单独控制且从不嵌入；嵌入只读取会话附件引用、失败回退，并让预览/下载/文件名/缓存共享同一模式。
  - 问题与修复: Standards 轴首轮 1 条 blocking——DOMAIN.md:21 的附件占位定义仍把图片算入，已改为只指文件；non-blocking 的 attachmentId URL/路径校验、render MIME 白名单、selectionKey/partsText 重复已修。Spec 轴首轮无 blocking，non-blocking 的 AC-06 证据偏弱、e2e AC-01 锚点与 README 使用段旧口径已修；真实 Chrome 用例改为 800×400 图并断言不超过 505pt 版心。复审结论：Standards blocking 清零，Spec 通过。
  - 复审结论: 两轴均通过、无 blocking；残余风险为 mock e2e 不产生图片（内容层由真实 Chrome 用例覆盖）、嵌入无独立字节上限（受 DSH 附件限制）、attachments 整体缺失时单图回退不可达；累计审计 T-008 已复位。
