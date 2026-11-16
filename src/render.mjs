const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * 转义会话正文里的 HTML 元字符。导出文档完全由会话内容拼接，
 * 任意消息都可能包含标签或脚本，因此所有文本必须先转义再入模板。
 * @param {unknown} value 待转义文本
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ESCAPES[character])
}

/**
 * 页面样式：A4、固定页边距、中文无衬线字体栈、长串强制断行、无页眉页脚。
 * 不给消息块加 `break-inside: avoid`，让跨页消息按 A4 自然续排。
 */
export const PAGE_STYLE = `
@page { size: A4; margin: 18mm 16mm; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #ffffff; }
body {
  color: #161616;
  font-family: "Noto Sans CJK SC", "Source Han Sans SC", "Noto Sans CJK TC",
    "WenQuanYi Micro Hei", "Microsoft YaHei", "PingFang SC", "Noto Sans", sans-serif;
  font-size: 11.5pt;
  line-height: 1.65;
}
main { display: block; }
.entry { margin: 0 0 5.5mm; }
.entry:last-child { margin-bottom: 0; }
.role { color: #6b6b6b; font-size: 8.5pt; font-weight: 600; letter-spacing: 0.12em; margin: 0 0 1.2mm; }
.body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.entry.user .body { border-left: 2pt solid #8a8a8a; padding-left: 3.5mm; }
.entry.assistant .body { padding-left: 3.5mm; }
.entry.tool .body {
  background: #f3f3f3;
  border-radius: 1.2mm;
  color: #333333;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 9pt;
  line-height: 1.5;
  padding: 1.6mm 2.6mm;
}
.tool-name { font-weight: 600; }
`

/**
 * 把转录条目渲染成完整的 HTML 文档。文档内容只来自转录：不含会话标题、
 * 会话标识、时间戳、页眉页脚与页码（C-002）。
 * @param {readonly { kind: string, text?: string, name?: string, summary?: string }[]} entries 转录条目
 * @returns {string}
 */
export function renderTranscriptHtml(entries) {
  const blocks = []
  for (const entry of entries) {
    if (entry.kind === 'user') {
      blocks.push(
        `<section class="entry user"><div class="role">用户</div><div class="body">${escapeHtml(entry.text)}</div></section>`,
      )
    } else if (entry.kind === 'assistant') {
      blocks.push(
        `<section class="entry assistant"><div class="role">助手</div><div class="body">${escapeHtml(entry.text)}</div></section>`,
      )
    } else if (entry.kind === 'tool') {
      const args = entry.summary === undefined || entry.summary === '' ? '' : ` <span class="tool-args">${escapeHtml(entry.summary)}</span>`
      blocks.push(
        `<section class="entry tool"><div class="body">工具调用 · <span class="tool-name">${escapeHtml(entry.name)}</span>${args}</div></section>`,
      )
    }
  }
  return [
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
    '<title>会话导出</title>',
    `<style>${PAGE_STYLE}</style>`,
    '</head><body><main>',
    blocks.join('\n'),
    '</main></body></html>',
    '',
  ].join('\n')
}
