// 测试锚点: R-01-014/AC-01 R-01-014/AC-02 R-01-014/AC-03 R-01-014/AC-04 R-01-014/AC-05 R-01-014/AC-06
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderMarkdown } from '../src/markdown.mjs'

test('块级 Markdown 渲染标题、列表、引用、代码、表格与分隔线', () => {
  const html = renderMarkdown(`# 一级标题

- 第一项
- 第二项

1. 有序一
2. 有序二

> 引用内容

\`\`\`js
const x = 1
\`\`\`

| 名称 | 值 |
| --- | ---: |
| A | 1 |

---
`)
  assert.match(html, /<h1>一级标题<\/h1>/)
  assert.match(html, /<ul class="md-list"><li>第一项<\/li><li>第二项<\/li><\/ul>/)
  assert.match(html, /<ol class="md-list"><li>有序一<\/li><li>有序二<\/li><\/ol>/)
  assert.match(html, /<blockquote class="md-quote"><p>引用内容<\/p><\/blockquote>/)
  assert.match(html, /<pre class="md-code" data-lang="js"><code>const x = 1<\/code><\/pre>/)
  assert.match(html, /<table class="md-table">/)
  assert.match(html, /<th style="text-align:right">值<\/th>/)
  assert.match(html, /<hr>/)
  assert.ok(!html.includes('# 一级标题'))
  assert.ok(!html.includes('- 第一项'))
})

test('围栏代码信息串含空格仍按代码块渲染', () => {
  const html = renderMarkdown('```js title=x\n<script>alert(1)</script>\n```')
  assert.match(html, /<pre class="md-code" data-lang="js"><code>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/code><\/pre>/)
  assert.ok(!html.includes('<script>'))
})

test('行内 Markdown 渲染强调、删除线、代码与安全链接', () => {
  const html = renderMarkdown('**加粗** *斜体* ~~删除~~ `a < b` [示例](https://example.com) 3 * 4 = 12 * 2')
  assert.match(html, /<strong>加粗<\/strong>/)
  assert.match(html, /<em>斜体<\/em>/)
  assert.match(html, /<del>删除<\/del>/)
  assert.match(html, /<code class="md-inline-code">a &lt; b<\/code>/)
  assert.match(html, /<a href="https:\/\/example\.com" rel="noreferrer">示例<\/a>/)
  assert.ok(html.includes('3 * 4 = 12 * 2'), '非强调星号按原文保留')
  assert.ok(!html.includes('<em> 4 = 12 </em>'))
})

test('原始 HTML、脚本与代码中的标签只按文本呈现', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)> 和 \`<script>alert(2)</script>\`\n\n```html\n<script>alert(3)</script>\n```')
  assert.ok(!html.includes('<img src=x'))
  assert.ok(!html.includes('<script>'))
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(html, /<code class="md-inline-code">&lt;script&gt;alert\(2\)&lt;\/script&gt;<\/code>/)
  assert.match(html, /&lt;script&gt;alert\(3\)&lt;\/script&gt;/)
})

test('危险协议链接只保留文字，不生成 href', () => {
  const html = renderMarkdown('[危险](javascript:alert(1)) [文件](file:///etc/passwd) [邮件](mailto:a@example.com)')
  assert.match(html, /危险/)
  assert.match(html, /文件/)
  assert.match(html, /<a href="mailto:a@example.com" rel="noreferrer">邮件<\/a>/)
  assert.ok(!html.includes('javascript:'))
  assert.ok(!html.includes('file:///etc/passwd'))
  assert.ok(!html.includes('href="javascript'))
})

test('Markdown 图片不抓取地址，只显示占位文字', () => {
  const html = renderMarkdown('![截图](https://evil.invalid/a.png)')
  assert.match(html, /<span class="md-image">\[图片: 截图\]<\/span>/)
  assert.ok(!html.includes('<img'))
  assert.ok(!html.includes('evil.invalid'))
})

test('无 Markdown 标记时保留原文与换行', () => {
  assert.equal(renderMarkdown('第一行\n第二行'), '<p>第一行<br>第二行</p>')
  assert.equal(renderMarkdown('   '), '')
  assert.equal(renderMarkdown('纯文本 <变量>'), '<p>纯文本 &lt;变量&gt;</p>')
  assert.equal(renderMarkdown('第一段\n\n第二段'), '<p>第一段</p>\n<p>第二段</p>')
  assert.equal(renderMarkdown('    四空格缩进'), '<p>    四空格缩进</p>')
})

test('嵌套列表、任务清单、Setext 标题与自动链接', () => {
  const html = renderMarkdown('父项\n\n- 父项\n  - 子项\n    - 三级项\n- [x] 已完成\n\n标题\n===\n\n<https://example.com>')
  assert.match(html, /<li><p>父项<\/p>\s*<ul class="md-list"><li><p>子项<\/p>/)
  assert.match(html, /<span class="md-check">☑<\/span> 已完成/)
  assert.match(html, /<h1>标题<\/h1>/)
  assert.match(html, /<a href="https:\/\/example\.com" rel="noreferrer">https:\/\/example\.com<\/a>/)
  assert.match(html, /<li>三级项<\/li>/)
  assert.ok(!html.includes('- 子项'))
})

test('多行 Setext 标题与表格转义管道', () => {
  const html = renderMarkdown('多行\n标题\n===\n\n| a \\| b | c |\n| --- | --- |\n| 1 | 2 |')
  assert.match(html, /<h1>多行<br>标题<\/h1>/)
  assert.match(html, /<th>a \| b<\/th><th>c<\/th>/)
  assert.match(html, /<td>1<\/td><td>2<\/td>/)
})

test('缩进列表续行与下划线强调不丢原文', () => {
  assert.match(renderMarkdown('  - a\n  b'), /<li><p>a<br>b<\/p><\/li>/)
  assert.match(renderMarkdown('   - a\n   b'), /<li><p>a<br>b<\/p><\/li>/)
  assert.match(renderMarkdown('  - a\n   b'), /<li><p>a<br>b<\/p><\/li>/)
  assert.match(renderMarkdown('  - a\n   bbbbb'), /<li><p>a<br>bbbbb<\/p><\/li>/)
  assert.equal(renderMarkdown('__粗体__'), '<p><strong>粗体</strong></p>')
  assert.equal(renderMarkdown('这是__重点__。'), '<p>这是<strong>重点</strong>。</p>')
  assert.equal(renderMarkdown('___粗斜___'), '<p><strong><em>粗斜</em></strong></p>')
  assert.equal(renderMarkdown('_斜体_'), '<p><em>斜体</em></p>')
})
