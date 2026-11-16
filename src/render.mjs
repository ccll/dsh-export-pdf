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

const USER_ICON =
  '<svg class="avatar" data-role-icon="user" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="5" r="2.6" fill="currentColor"/><path d="M2.8 14.2c0-2.9 2.3-4.8 5.2-4.8s5.2 1.9 5.2 4.8" fill="currentColor"/></svg>'

const ASSISTANT_ICON =
  '<svg class="avatar" data-role-icon="assistant" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 2.2v3" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="2" r="1.1" fill="currentColor"/><rect x="2.8" y="5.2" width="10.4" height="8" rx="2.2" fill="currentColor"/><circle cx="6.2" cy="9" r="1" fill="#ffffff"/><circle cx="9.8" cy="9" r="1" fill="#ffffff"/></svg>'

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
.entry.user { width: fit-content; max-width: 82%; margin-left: auto; }
.entry.assistant { width: fit-content; max-width: 82%; margin-right: auto; }
.role { align-items: center; break-after: avoid; color: #6b6b6b; display: flex; font-size: 8.5pt; font-weight: 600; gap: 1.4mm; letter-spacing: 0.12em; margin: 0 0 1.2mm; }
.entry.user .role { color: #4f6f9f; justify-content: flex-end; }
.entry.assistant .role { justify-content: flex-start; }
.avatar { flex: none; height: 3.4mm; width: 3.4mm; }
.body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.entry.user .body {
  background: #eef3fb;
  border-radius: 2mm;
  box-sizing: border-box;
  padding: 2mm 3mm;
}
.entry.assistant .body { border-left: 1.5pt solid #d0d0d0; padding-left: 3.5mm; }
.entry.tool .body {
  background: #f3f3f3;
  border-radius: 1.2mm;
  box-sizing: border-box;
  color: #333333;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 9pt;
  line-height: 1.5;
  padding: 1.6mm 2.6mm;
  width: 100%;
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
        `<section class="entry user"><div class="role"><span>用户</span>${USER_ICON}</div><div class="body">${escapeHtml(entry.text)}</div></section>`,
      )
    } else if (entry.kind === 'assistant') {
      blocks.push(
        `<section class="entry assistant"><div class="role">${ASSISTANT_ICON}<span>助手</span></div><div class="body">${escapeHtml(entry.text)}</div></section>`,
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
