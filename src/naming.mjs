/**
 * 导出文件名固定为 `dsh-session-<会话标识前 8 位>.pdf`（SOLUTION#产品契约）。
 * 会话标识常带 `session-` 前缀；去掉该公共前缀后再取前 8 位，否则所有会话
 * 会得到同一个文件名，不满足 R-01-003/AC-01 的“包含会话标识”。
 * @param {string} sessionId 会话标识
 * @returns {string} 下载文件名
 */
export function pdfFilename(sessionId) {
  const raw = String(sessionId)
  const identity = raw.startsWith('session-') ? raw.slice('session-'.length) : raw
  const prefix = identity === '' ? raw : identity
  return `dsh-session-${prefix.slice(0, 8)}.pdf`
}
