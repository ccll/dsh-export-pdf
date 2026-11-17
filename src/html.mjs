const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * 转义会话正文里的 HTML 元字符。模板拼接前必须经过这里；Markdown 渲染器
 * 也在输出前对文本与属性做同样转义，避免标签与属性注入。
 * @param {unknown} value 待转义文本
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ESCAPES[character])
}
