---
doc-type: todo
mutation: inbox
owner: 双方
---

# TODO — 想法收集箱

## 条目

- [需求候选] 为导出 PDF 增加页码：候选做法是 CDP 自定义页脚模板、生成后用 pdf-lib 盖章，或换用支持分页媒体页码的渲染引擎；三种都超出当前轻量约束（见 C-002）。
- [维护想法] 优先选用 TTF 轮廓的中文字体，让 Chrome 以 CID TrueType 嵌入而不是 Type 3，减少字体对象数。
