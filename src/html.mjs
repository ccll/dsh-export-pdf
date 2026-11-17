const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * 转义会话正文里的 HTML 元字符。所有不可信文本在进入模板或 Markdown 渲染器
 * 之前都必须先经过这里，避免标签与属性注入。
 * @param {unknown} value 待转义文本
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ESCAPES[character])
}
