---
doc-type: task
mutation: lifecycle
id: T-013
---

# T-013 渲染层免重启热加载与页面样式数据化

状态: completed
类型: 重构
风险等级: major
风险面: 无（不改对外接口、PDF 内容契约、文件名与鉴权边界）
决策依据: C-009；东家 2026-11-17 拍板选 A+B，要求最大程度减少 dsh 重启——主实例同时跑多个会话，重启会打断它们。

## 背景与目标

- 背景: 宿主半区模块在 `dsh web` 启动时一次性 import，上游加载器没有文件监听与运行时热重载。改动渲染逻辑或版式都要重启实例，而本插件迭代以版式与渲染为主。
- 目标: 渲染层改完在下一次导出时生效，不需要重启 dsh。
  - 页面样式抽成数据文件，改 CSS 免重启。
  - 渲染管线按源码内容热加载，改纯逻辑模块免重启。
  - 缓存按管线版本与样式版本失效，不返回旧版式的 PDF。
- 非目标: 不改 HTTP 契约、错误码、文件名、PDF 内容承诺与并发合并语义；不给宿主外壳（路由、配置、字体与浏览器探测）做热加载；不引入运行时依赖或构建步骤。

## 差距评估

- 现状: `src/render.mjs` 的版式是 `PAGE_STYLE` 常量；`src/exporter.mjs` 与 `src/host.mjs` 静态 import。改任一处都要重启。
- 差距: 渲染层没有“改完即生效”的能力；SOLUTION 没有描述热加载与样式数据化。
- 影响面: 新增 `src/pipeline.mjs`、`src/page-style.mjs`、`src/page-style.css`；调整 `src/render.mjs`、`src/exporter.mjs`、`src/route.mjs`、`src/host.mjs` 与相关测试、文档。HTTP 行为与 PDF 字节内容不变。

## 收敛方案

- 页面样式: 抽到 `src/page-style.css`，由 `src/page-style.mjs` 每次导出读文件并按内容取版本；版本进 PDF 缓存键，改样式后旧结果失效。
- 渲染管线: 纯逻辑模块按依赖顺序登记，同一版本复用已加载模块。
  - 加载器把目录、模块名与源码内容一起取哈希，生成自包含模块写入临时目录。
  - 生成的文件名带哈希，再用 import 加载，Node 模块缓存因此不命中旧代码。
- 错误类型: 生成模块从静态 `errors.mjs` 导入错误类，路由的 `instanceof` 映射不因热加载失效。
- 失败语义: 生成或加载失败沿用上一版并记日志；从未成功加载过才让本次导出以 `500` 结束。
- 装配: 宿主为每个管线版本创建一次编排器，换版即重建，PDF 缓存随之清空；路由的 token 词表与命名函数由管线注入，未注入时用静态实现，既有路由测试不受影响。
- 研判: 方案研判在本仓库关闭；候选方案与取舍见 C-009（子进程、打包器、运行时求值、依赖上游均被否）。

## 测试计划

- `test/pipeline.test.mjs`:
  - 生成器剥离 import/export，拒绝不支持的模块语法。
  - 真实源码加载后可渲染与导出；源码变化后换新模块，旧模块保持旧内容。
  - 新版本加载失败沿用上一版并记日志；首次失败抛出。
- `test/page-style.test.mjs`: 内容不变版本不变；同长度替换换版本；空样式与文件缺失报错。
- `test/render.test.mjs` 与 `test/pdf.test.mjs`: 样式从 CSS 读入并注入 `<style>`；真实 Chrome 打印仍贴版心。
- `test/exporter.test.mjs`: 样式版本变化使缓存失效；样式不可读映射为渲染失败。
- `test/hot-reload.test.mjs`: 按宿主装配方式在临时副本上改 CSS 与 `render.mjs`，断言下一次导出用新样式、新代码，源码不变时不重建编排器。
- e2e: 既有 pdf-export 与 pdf-failure 覆盖新装配下的正常与失败路径。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：改 CSS 或改渲染模块后，下一次导出使用新版本 | `test/hot-reload.test.mjs::改样式表后下一次导出重新渲染并使用新样式`、`test/hot-reload.test.mjs::改渲染模块后下一次导出直接使用新代码` |
| 异常 | 适用：源码读取失败、管线语法不支持、样式表不可读、首次加载失败都有明确结果 | `test/pipeline.test.mjs::源码读取失败时沿用上一版并记录日志`、`test/pipeline.test.mjs::管线语法不支持时沿用上一版而不是抛给调用方`、`test/exporter.test.mjs::页面样式不可读映射为渲染失败` |
| 边界配置 | 适用：空样式文本被拒绝，样式内容版本进缓存键 | `test/render.test.mjs::渲染需要页面样式文本`、`test/page-style.test.mjs::空样式表被拒绝`、`test/exporter.test.mjs::页面样式版本变化使缓存失效并重渲染` |
| 副作用 | 适用：空态与子会话不启动渲染；生成模块只写系统临时目录 | `test/exporter.test.mjs::空转录返回空态，不探测字体也不启动渲染`、`test/pipeline.test.mjs::生成文件落在缓存目录` |
| 并发 | 适用：同版本并发加载复用同一模块，同会话并发导出仍只渲染一次 | `test/pipeline.test.mjs::生成文件落在缓存目录，并发加载复用同一模块`、`test/exporter.test.mjs::同会话并发请求合并为一次渲染`、`test/hot-reload.test.mjs::管线源码未变化时不重建编排器` |
| 兼容性 | 适用：状态码、错误码、文件名与 PDF 字节契约不变 | `test/route.test.mjs::GET 成功返回 PDF 与 inline 文件名`、`test/pdf.test.mjs::真实浏览器打印：A4、多页、中文字形与转录内容正确`、`e2e/specs/pdf-export.mjs::R-01-001/AC-01` |

## 自查清单

- [x] 边界: 首次导出（管线未加载）、样式文本为空、缓存命中三条路径都验证过。
- [x] 异常: 源码语法错误沿用上一版；样式表缺失以 `render` 失败码返回；首次加载失败以 `500` 结束。
- [x] 回归: 状态码、错误码、文件名与 PDF 版式断言不变，e2e 两套通过。
- [x] 并发: 同版本并发加载不重复生成模块，同会话并发导出仍只渲染一次。
- [x] 卫生: 临时模块只写在系统临时目录，仓库与会话日志无写入。

## 终态与证据
- 实现: 新增 `src/pipeline.mjs`（按内容哈希生成自包含模块并 import、任一环节失败沿用上一版）、`src/page-style.mjs` 与 `src/page-style.css`（每次导出读文件、按内容取样式版本）、宿主按管线版本重建导出编排器；`src/exporter.mjs` 增加 `loadPageStyle` 依赖并把样式版本纳入缓存键；`src/route.mjs` 的 token 词表与命名函数改由管线注入，未注入时退回静态实现。实现提交 c0670b9。
- 测试: `pnpm verify` 通过：`pnpm check`（20 个源文件、client bundle 20288 字节）、`node --test` 101 通过 0 失败、e2e pdf-export 与 pdf-failure 均 PASS；`agentmap lint` 通过。新增 `test/hot-reload.test.mjs` 按宿主装配方式在 src 副本上改 CSS 与 `render.mjs`，断言下一次导出用新样式与新代码、源码不变时不重建编排器。
- SOLUTION 对照: SOLUTION 的核心数据与不变量、运行时与失败语义、子系统与模块、横切约束、技术选型、兼容性与版本演进已同步为热加载与样式数据化；PRD 的 R-01-005/006/009/010/014 承诺不变，未新增或删除需求，需求追溯索引无需改行。
- commit: c0670b9
- review:
  - 审核方: 独立双轴评审（code-review skill，Standards 轴与 Spec 轴各由独立子代理执行，openai/gpt-5.6-luna，与实现上下文隔离）
  - 目的理解: 渲染层（纯逻辑模块与页面样式）改动要在下一次导出生效、不重启 dsh；HTTP 状态码、错误码、文件名与 PDF 内容契约保持不变。
  - 问题与修复: 首轮 blocking 2 项——回退只包住 `import()`，读源码/生成/写临时文件失败不沿用上一版；样式版本只看 mtime 与长度，同长度替换可能误判未变。hard 2 项——清理失败静默吞掉；host 注释把管线整体说成需要重启。修复后复审又指出 `prunePipelineFiles` 的 `stat` 静默吞错，改为只跳过并发清理的 `ENOENT`、其余冒泡到日志。
  - 复审结论: 两轴复审通过，blocking 0。残余风险：模块范围用清单登记，新增纯逻辑模块需手动加入 `PIPELINE_MODULES`；集成测试用假 `renderPdf` 与简化装配，真实 host/HTTP 装配由 e2e 覆盖；源码在一次加载期间被改动可能让该次导出用旧快照，下一次按内容哈希重载。
