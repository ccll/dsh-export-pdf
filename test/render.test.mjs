// 测试锚点: R-01-005/AC-02 R-01-010/AC-01 R-01-010/AC-02 R-01-012/AC-02 R-01-012/AC-03
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { escapeHtml, renderTranscriptHtml as renderHtmlDocument } from '../src/render.mjs'
import { readPageStyle } from '../src/page-style.mjs'

/** 真实页面样式表：版式断言直接读 CSS，不再依赖 JS 里的样式常量。 */
const PAGE_STYLE = readPageStyle().text
/** 渲染完整 HTML 文档并注入真实页面样式。 */
const renderTranscriptHtml = (entries) => renderHtmlDocument(entries, PAGE_STYLE)

test('渲染需要页面样式文本', () => {
  assert.throws(() => renderHtmlDocument([{ kind: 'user', text: 'x' }], ''), /需要页面样式文本/)
  assert.throws(() => renderHtmlDocument([{ kind: 'user', text: 'x' }], undefined), /需要页面样式文本/)
})

test('HTML 元字符全部转义', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>&\'"'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;&quot;')
})

test('渲染只包含转录条目并转义会话正文', () => {
  const html = renderTranscriptHtml([
    { kind: 'user', text: '<img src=x onerror=alert(1)> 中文问题' },
    { kind: 'assistant', text: '回答\n第二行' },
    { kind: 'tool', name: 'bash', summary: 'command=echo <tag>' },
  ])
  assert.ok(html.startsWith('<!doctype html><html lang="zh-CN">'))
  assert.ok(html.includes('中文问题'))
  assert.ok(html.includes('回答<br>第二行'), 'Markdown 段落保留可读换行')
  assert.ok(!html.includes('<img src=x'))
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  assert.ok(html.includes('工具调用 · <span class="tool-name">bash</span>'))
  assert.ok(html.includes('command=echo &lt;tag&gt;'))
})

test('页面样式固定 A4、中文可读、无页眉页脚与页码规则', () => {
  assert.ok(PAGE_STYLE.includes('size: A4'))
  assert.ok(PAGE_STYLE.includes('margin: 18mm 16mm'))
  assert.ok(PAGE_STYLE.includes('Noto Sans CJK SC'))
  assert.ok(PAGE_STYLE.includes('white-space: pre-wrap'))
  assert.ok(PAGE_STYLE.includes('overflow-wrap: anywhere'))
  assert.ok(!/\.entry\s*\{[^}]*break-inside/.test(PAGE_STYLE), '消息块必须允许跨页续排')
  assert.ok(PAGE_STYLE.includes('.inline-image'), '内联图片有不越界约束')
  assert.ok(!PAGE_STYLE.includes('@bottom-center'), '不生成页码')
  const html = renderTranscriptHtml([{ kind: 'user', text: '你好' }])
  assert.ok(!html.includes('11/16/26'))
  assert.ok(!html.includes('file://'))
  assert.ok(!html.includes('dsh-session-'))
  assert.ok(!html.includes('页码'))
})

test('助手正文不带整体左竖线，引用块的竖线只属于引用内容', () => {
  assert.doesNotMatch(PAGE_STYLE, /\.entry\.assistant \.body[^{]*\{[^}]*border-left/, '助手正文不得有整体左边线')
  assert.doesNotMatch(PAGE_STYLE, /\.entry\.assistant \.body[^{]*\{[^}]*padding-left/, '助手正文不得留下为竖线预留的左内边距')
  assert.match(PAGE_STYLE, /\.md blockquote \{[^}]*border-left/, 'Markdown 引用块仍带竖线')
})

test('用户与助手角色标签各带一个内联 SVG 图标', () => {
  const html = renderTranscriptHtml([
    { kind: 'user', text: '用户消息' },
    { kind: 'assistant', text: '助手回复' },
    { kind: 'tool', name: 'bash', summary: 'command=echo probe' },
  ])
  const userSection = /<section class="entry user">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? ''
  const assistantSection = /<section class="entry assistant">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? ''
  assert.match(userSection, /<svg class="avatar" data-role-icon="user"/)
  assert.match(assistantSection, /<svg class="avatar" data-role-icon="assistant"/)
  assert.equal((userSection.match(/data-role-icon=/g) ?? []).length, 1, '用户消息只带一个图标')
  assert.equal((assistantSection.match(/data-role-icon=/g) ?? []).length, 1, '助手回复只带一个图标')
  assert.ok(userSection.indexOf('data-role-icon="user"') > userSection.indexOf('<span>用户</span>'), '用户图标应在文字右侧')
  assert.ok(assistantSection.indexOf('data-role-icon="assistant"') < assistantSection.indexOf('<span>助手</span>'), '助手图标应在文字左侧')
  assert.doesNotMatch(html, /<img|https?:\/\//, '图标不得依赖位图或外部资源')
})

test('空条目渲染出空正文文档而不是报错', () => {
  const html = renderTranscriptHtml([])
  assert.ok(html.includes('<main>\n\n</main>'))
  assert.ok(html.endsWith('</html>\n'))
})
test('图片分段以 data URI 内联到消息原位，非法地址回退占位', () => {
  const imageUrl = 'data:image/png;base64,iVBORw0KGgo='
  const html = renderTranscriptHtml([
    {
      kind: 'user',
      text: '看图\n后续',
      parts: [
        { type: 'text', text: '看图' },
        { type: 'image', attachment: { attachmentId: 'sha256:img' }, dataUrl: imageUrl },
        { type: 'text', text: '后续' },
      ],
    },
    {
      kind: 'assistant',
      text: '[图片]',
      parts: [{ type: 'image', attachment: { attachmentId: 'bad' }, dataUrl: 'https://example.com/a.png' }],
    },
  ])
  assert.ok(html.includes(`<img src="${imageUrl}" alt="图片">`))
  assert.ok(html.indexOf('看图') < html.indexOf('<figure class="inline-image">'))
  assert.ok(html.indexOf('<figure class="inline-image">') < html.indexOf('后续'))
  assert.ok(!html.includes('https://example.com/a.png'), '非 data:image 地址不得进入图片标签')
  assert.ok(html.includes('[图片]'), '非法图片地址回退占位')
})

test('用户与助手正文按 Markdown 渲染，工具摘要保持原始单行', () => {
  const html = renderTranscriptHtml([
    { kind: 'user', text: '## 用户标题\n\n- **重点**\n- 次要点' },
    { kind: 'assistant', text: '`code` 与 [链接](https://example.com)' },
    { kind: 'tool', name: 'bash', summary: 'command=echo **not markdown**' },
  ])
  assert.match(html, /<h2>用户标题<\/h2>/)
  assert.match(html, /<li><strong>重点<\/strong><\/li>/)
  assert.match(html, /<code class="md-inline-code">code<\/code>/)
  assert.match(html, /<a href="https:\/\/example\.com" rel="noreferrer">链接<\/a>/)
  assert.ok(html.includes('command=echo **not markdown**'), '工具摘要不参与 Markdown')
  assert.ok(!html.includes('<strong>not markdown</strong>'))
})
