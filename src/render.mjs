import { IMAGE_MEDIA_TYPES } from './images.mjs'

import { escapeHtml } from './html.mjs'
import { renderMarkdown } from './markdown.mjs'

export { escapeHtml } from './html.mjs'

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
.body { margin: 0; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
.body > .md > :first-child { margin-top: 0; }
.body > .md > :last-child { margin-bottom: 0; }
.md p { margin: 0 0 1.4mm; white-space: pre-wrap; }
.md h1, .md h2, .md h3, .md h4, .md h5, .md h6 { break-after: avoid; line-height: 1.35; margin: 2.2mm 0 1.2mm; }
.md h1 { font-size: 15pt; }
.md h2 { font-size: 13.5pt; }
.md h3 { font-size: 12pt; }
.md h4, .md h5, .md h6 { font-size: 11.5pt; }
.md ul, .md ol { margin: 0 0 1.4mm; padding-left: 5.5mm; }
.md li { margin: 0.5mm 0; }
.md li > p { margin: 0; }
.md li > .md-list { margin: 0.4mm 0 0; }
.md .md-check { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; margin-right: 0.6mm; }
.md blockquote { border-left: 1.2pt solid #c8c8c8; color: #555555; margin: 1.2mm 0; padding-left: 3mm; }
.md hr { border: 0; border-top: 0.4mm solid #d8d8d8; margin: 2mm 0; }
.md a { color: #2f5f9f; text-decoration: underline; }
.md code { background: #f1f1f1; border-radius: 0.7mm; font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 9.5pt; padding: 0 0.6mm; }
.md pre.md-code { background: #f3f3f3; border: 0.25mm solid #dddddd; border-radius: 1mm; box-sizing: border-box; margin: 1.2mm 0; overflow-wrap: anywhere; padding: 1.8mm 2.4mm; white-space: pre-wrap; }
.md pre.md-code code { background: transparent; font-size: 9pt; line-height: 1.45; padding: 0; white-space: inherit; }
.md .md-image { color: #6b6b6b; }
.md table { border-collapse: collapse; font-size: 9.5pt; margin: 1.2mm 0; table-layout: fixed; width: 100%; }
.md th, .md td { border: 0.25mm solid #d0d0d0; overflow-wrap: anywhere; padding: 0.8mm 1.2mm; vertical-align: top; }
.md th { background: #f3f3f3; font-weight: 600; }
.entry.user .body {
  background: #eef3fb;
  border-radius: 2mm;
  box-sizing: border-box;
  padding: 2mm 3mm;
}
.entry.assistant .body { border-left: 1.5pt solid #d0d0d0; padding-left: 3.5mm; }
.entry.tool .body {
  background: #f3f3f3;
  white-space: pre-wrap;
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
.inline-image { margin: 1.5mm 0; page-break-inside: avoid; }
.inline-image img { border: 0.3mm solid #d8d8d8; display: block; height: auto; max-height: 120mm; max-width: 100%; object-fit: contain; }
`

function renderBody(entry) {
  const parts = Array.isArray(entry.parts) ? entry.parts : [{ type: 'text', text: entry.text }]
  return parts
    .map((part) => {
      if (part?.type !== 'image') {
        const text = String(part?.text ?? '')
        return text === '' ? '' : `<div class="md">${renderMarkdown(text)}</div>`
      }
      // dataUrl 只由导出器的附件解析器生成；非 data:image 值一律回退占位，避免注入。
      if (
        typeof part.dataUrl !== 'string' ||
        !IMAGE_MEDIA_TYPES.some((type) => part.dataUrl.startsWith(`data:${type};base64,`))
      ) {
        return `<div class="md">${renderMarkdown('[图片]')}</div>`
      }
      return `<figure class="inline-image"><img src="${escapeHtml(part.dataUrl)}" alt="图片"></figure>`
    })
    .filter((html) => html !== '')
    .join('\n')
}

/**
 * 把转录条目渲染成完整的 HTML 文档。文档内容只来自转录：不含会话标题、
 * 会话标识、时间戳、页眉页脚与页码（C-002）。
 * @param {readonly { kind: string, text?: string, parts?: readonly any[], name?: string, summary?: string }[]} entries 转录条目
 * @returns {string}
 */
export function renderTranscriptHtml(entries) {
  const blocks = []
  for (const entry of entries) {
    if (entry.kind === 'user') {
      blocks.push(
        `<section class="entry user"><div class="role"><span>用户</span>${USER_ICON}</div><div class="body">${renderBody(entry)}</div></section>`,
      )
    } else if (entry.kind === 'assistant') {
      blocks.push(
        `<section class="entry assistant"><div class="role">${ASSISTANT_ICON}<span>助手</span></div><div class="body">${renderBody(entry)}</div></section>`,
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
