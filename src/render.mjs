import { IMAGE_MEDIA_TYPES } from './images.mjs'

import { escapeHtml } from './html.mjs'
import { renderMarkdown } from './markdown.mjs'

export { escapeHtml } from './html.mjs'

const USER_ICON =
  '<svg class="avatar" data-role-icon="user" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="5" r="2.6" fill="currentColor"/><path d="M2.8 14.2c0-2.9 2.3-4.8 5.2-4.8s5.2 1.9 5.2 4.8" fill="currentColor"/></svg>'

const ASSISTANT_ICON =
  '<svg class="avatar" data-role-icon="assistant" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 2.2v3" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="2" r="1.1" fill="currentColor"/><rect x="2.8" y="5.2" width="10.4" height="8" rx="2.2" fill="currentColor"/><circle cx="6.2" cy="9" r="1" fill="#ffffff"/><circle cx="9.8" cy="9" r="1" fill="#ffffff"/></svg>'

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
 * 会话标识、时间戳、页眉页脚与页码（C-002）。版式由调用方传入的样式表决定，
 * 样式表是数据文件，改它不需要重新加载模块。
 * @param {readonly { kind: string, text?: string, parts?: readonly any[], name?: string, summary?: string }[]} entries 转录条目
 * @param {string} pageStyle 页面样式表文本（由宿主的样式表读取器提供）
 * @returns {string}
 */
export function renderTranscriptHtml(entries, pageStyle) {
  if (typeof pageStyle !== 'string' || pageStyle.trim() === '') {
    throw new Error('dsh-export-pdf: renderTranscriptHtml 需要页面样式文本')
  }
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
    `<style>${pageStyle}</style>`,
    '</head><body><main>',
    blocks.join('\n'),
    '</main></body></html>',
    '',
  ].join('\n')
}
