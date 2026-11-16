// 测试锚点: R-01-005/AC-02 R-01-010/AC-01 R-01-010/AC-02
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PAGE_STYLE, escapeHtml, renderTranscriptHtml } from '../src/render.mjs'

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
  assert.ok(html.includes('回答\n第二行'))
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
  assert.ok(!PAGE_STYLE.includes('break-inside: avoid'), '消息块必须允许跨页续排')
  assert.ok(!PAGE_STYLE.includes('@bottom-center'), '不生成页码')
  const html = renderTranscriptHtml([{ kind: 'user', text: '你好' }])
  assert.ok(!html.includes('11/16/26'))
  assert.ok(!html.includes('file://'))
  assert.ok(!html.includes('dsh-session-'))
  assert.ok(!html.includes('页码'))
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
