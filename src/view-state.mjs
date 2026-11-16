import { normalizeInclude } from './selection.mjs'

/** 视图页固定文案。 */
export const EMPTY_TEXT = '该会话还没有消息，暂无可导出的内容。'
export const FILTERED_EMPTY_TEXT = '当前选择下没有可导出的内容。'
export const GENERATING_TEXT = '正在生成 PDF…'
export const READY_TEXT = '预览已就绪'
export const DOWNLOAD_TEXT = '下载 PDF'
export const DOWNLOADING_TEXT = '正在下载…'
export const RETRY_TEXT = '重试'
export const FALLBACK_ERROR_TEXT = '导出服务返回了意外结果'
export const NETWORK_ERROR_TEXT = '无法连接导出服务'

/** 错误响应头机器码到页内文案；正文存在时仍以正文为准。 */
const ERROR_MESSAGES = {
  request: '导出请求参数无效',
  session: '会话不存在或日志不可读',
  subagent: '不支持导出子会话',
  font: '缺少可用的中文字体，无法导出',
  browser: '没有可用的浏览器，无法导出 PDF',
  render: 'PDF 渲染失败',
  internal: '导出失败',
}

/**
 * 浏览器半区使用的导出地址。宿主在 index 里注入 `<base href="./">`，
 * 因此按 document.baseURI 解析成部署前缀下的绝对地址；与宿主其他
 * document-relative 路由一致。
 * @param {string} sessionId 会话标识
 * @param {{ base?: string, disposition?: 'inline' | 'attachment', include?: readonly string[] }} [options]
 * @returns {string}
 */
export function pdfRouteUrl(sessionId, options = {}) {
  const base = options.base ?? document.baseURI
  const disposition = options.disposition ?? 'inline'
  const include = normalizeInclude(options.include)
  const includeQuery = include.length === 0 ? '' : `&include=${encodeURIComponent(include.join(','))}`
  return new URL(
    `api/session.pdf?sessionId=${encodeURIComponent(sessionId)}&disposition=${encodeURIComponent(disposition)}${includeQuery}`,
    base,
  ).href
}

/**
 * 视图页首次渲染的同步状态：空会话直接进空态且不发起请求，其余先进生成中。
 * @param {boolean | undefined} blank 会话是否尚无消息
 * @returns {{ kind: 'empty' } | { kind: 'loading' }}
 */
export function initialViewState(blank) {
  return blank === true ? { kind: 'empty' } : { kind: 'loading' }
}

/**
 * 空态与生成中共用的提示文案；视图主体直接用它渲染，避免文案与状态分支漂移。
 * @param {{ kind: string }} state
 * @returns {string}
 */
export function viewNoticeText(state) {
  if (state.kind !== 'empty') return GENERATING_TEXT
  return typeof state.message === 'string' && state.message !== '' ? state.message : EMPTY_TEXT
}

/**
 * 把导出路由的响应压成页内状态。200 为就绪，204 为空态，其它状态优先进
 * 正文；正文为空（HEAD 无正文）时用 `x-dsh-export-error` 机器码。
 * @param {number} status HTTP 状态码
 * @param {string} body 响应正文
 * @param {string | null} [code] `x-dsh-export-error` 响应头
 * @returns {{ kind: 'ready' } | { kind: 'empty', message?: string } | { kind: 'error', message: string }}
 */
export function classifyExportResponse(status, body, code) {
  if (status === 200) return { kind: 'ready' }
  if (status === 204) return { kind: 'empty', message: FILTERED_EMPTY_TEXT }
  return { kind: 'error', message: messageForStatus(status, body, code) }
}

/**
 * 错误机器码对应的中文原因；未知码返回 undefined。
 * @param {string | null | undefined} code
 * @returns {string | undefined}
 */
export function messageForErrorCode(code) {
  return Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : undefined
}

/**
 * 失败原因的展示文案。正文可用时以正文为准；HEAD 没有正文，回落到机器码
 * 或状态码兜底，避免把空正文或 HTML 错误页显示成空白。
 * @param {number} status HTTP 状态码
 * @param {string} body 响应正文
 * @param {string | null} [code] `x-dsh-export-error` 响应头
 * @returns {string}
 */
export function messageForStatus(status, body, code) {
  const text = String(body ?? '').trim()
  if (text !== '' && !text.startsWith('<')) return text
  const mapped = messageForErrorCode(code)
  if (mapped !== undefined) return mapped
  if (status === 400) return '导出请求参数无效'
  if (status === 404) return '会话不存在或日志不可读'
  if (status === 500) return 'PDF 渲染失败'
  if (status === 503) return '导出服务当前不可用'
  return `${FALLBACK_ERROR_TEXT}（HTTP ${status}）`
}
