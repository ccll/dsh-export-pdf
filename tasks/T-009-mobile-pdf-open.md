---
doc-type: task
mutation: lifecycle
id: T-009
---

# T-009 窄视口用新标签页打开完整 PDF

状态: active
类型: UI/UX 改进
风险等级: major
风险面: 移动端预览行为与外部可见入口变化；链接同源与 PDF 结果一致性
决策依据: C-007；东家 2026-11-17 拍板“新标签页打开完整 PDF”，否决页内 PDF.js 与保留受限 iframe。

## 背景与目标

- 背景: 手机浏览器把多页 PDF 装进 iframe 后，内置查看器只渲染第 1 页；iframe 内滚动与片段翻页不可靠。桌面浏览器可正常浏览全部页面。PDF 文件本身多页，问题在移动端页内承载。
- 目标: 窄视口（≤720px）隐藏 iframe，显示“打开完整 PDF”；在新标签页用系统查看器打开与预览/下载相同的 PDF URL；桌面视口保持页内预览。
- 非目标: 不引入 PDF.js 或新的 PDF 渲染服务，不新增导出路由，不改变 PDF 字节、文件名、选择与图片模式。

## 差距评估

- 现状: `PdfView` 统一渲染 `iframe`，窄视口没有降级路径；移动端用户只能看到第 1 页。
- 差距: 无窄视口检测、移动端提示与同源打开链接；无对应 PRD/SOLUTION/DOMAIN 承诺与测试锚点。
- 影响面: `src/view.mjs`、`src/view-state.mjs`、客户端 bundle、PRD/SOLUTION/DOMAIN/C-007、e2e 与 README。

## 收敛方案

- 断点: 固定 `(max-width: 720px)`，由 `view-state.mjs` 导出，视图用 `matchMedia` 订阅变化。
- 显示: 预览就绪时，窄视口不渲染 iframe，改为提示卡与 `打开完整 PDF` 链接；生成中、空态、失败分支保持不变，不出现可点击链接。
- 打开: 链接使用当前 `state.url`（与预览同一选择/图片模式的同源 PDF），`target="_blank"`、`rel="noopener noreferrer"`；不重新生成、不改文件名。
- 桌面: 断点以上继续用原生 iframe；视口跨过断点时随 `matchMedia` 变化切换，不重置已生成结果。
- 无分叉点: 东家已在 C-007 拍板新标签页方案；断点值、文案与 React hook 写法属实现自由。

## 测试计划

- view-state 单测: 断点常量与移动端提示文案。
- e2e: 桌面 PDF 就绪后把视口缩到 390px，断言 iframe 消失、提示与链接出现；链接 href 指向同源 session.pdf，target/rel 正确；恢复到桌面后 iframe 回来。
- 既有 e2e: 图片/内容选择、预览下载同字节、失败与空态不回归。
- 真实 Chrome: 不需要新增 PDF 生成用例；移动端不渲染 iframe，PDF 内容层由既有用例覆盖。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
|---|---|---|
| 成功 | 适用：窄视口显示完整 PDF 打开入口 | `e2e/specs/pdf-export.mjs::R-01-013/AC-01` |
| 异常 | 适用：生成中/失败不显示可点击打开 | `test/view-state.test.mjs::R-01-013/AC-03`、`e2e/specs/pdf-failure.mjs::R-01-013/AC-03` |
| 边界配置 | 适用：断点上下切换 iframe 与链接 | `e2e/specs/pdf-export.mjs::R-01-013/AC-04` |
| 副作用 | 适用：链接与下载共用同一份 PDF/文件名，不重复渲染 | `e2e/specs/pdf-export.mjs::R-01-013/AC-05` |
| 安全 | 适用：新标签页链接同源且 noopener | `e2e/specs/pdf-export.mjs::R-01-013/AC-02` |
| 兼容性 | 适用：桌面页内预览、既有选择与图片模式不回归 | `e2e/specs/pdf-export.mjs::R-01-012/AC-05` |

## 自查清单

- [ ] 边界：720px 上下、横竖屏切换不残留错误分支；窄视口不加载 iframe。
- [ ] 异常：生成中、空态、失败不出现打开链接；点击链接不触发二次渲染。
- [ ] 回归：桌面 iframe 全部页面、下载文件名、选择/图片模式与预览一致。
- [ ] 交互：链接在新标签页打开，`rel=noopener`，返回后状态不变。
- [ ] 安全：目标 URL 同源，不拼接宿主路径或外部地址。

## 终态与证据

关闭时填写实现、测试、SOLUTION 对照、commit 与完整 review 三标签；并完成 R-01-013 的里程碑勾选。
