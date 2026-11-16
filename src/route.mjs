import {
  BrowserUnavailableError,
  FontUnavailableError,
  PdfExportError,
  RenderFailedError,
  SessionUnavailableError,
  SubagentExportError,
} from './errors.mjs'
import { pdfFilename } from './naming.mjs'

/** 导出路由在 Connection `/api` 通道下的绝对路径。 */
export const SESSION_PDF_PATH = '/api/session.pdf'
const SESSION_ID_MAX = 200
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/

/**
 * 处理一次导出请求。参数校验、状态码、响应头与 HEAD 语义集中在这里，
 * 不把日志内容、stderr 或宿主路径回给浏览器。
 * @param {Request} request Fetch 请求（已过宿主的 Host/Origin 与浏览器鉴权栅栏）
 * @param {{ exportSession: (sessionId: string) => Promise<{ kind: 'pdf', bytes: Uint8Array } | { kind: 'empty' }> }} exporter 导出编排器
 * @param {{ logError?: (message: string, error: unknown) => void }} [options]
 * @returns {Promise<Response>}
 */
export async function handlePdfRequest(request, exporter, options = {}) {
  const logError = options.logError ?? (() => {})
  const method = request.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    return textResponse(405, '只支持 GET 与 HEAD', method, { code: 'request', headers: { allow: 'GET, HEAD' } })
  }

  const url = new URL(request.url)
  const sessionId = (url.searchParams.get('sessionId') ?? '').trim()
  if (sessionId === '' || sessionId.length > SESSION_ID_MAX || CONTROL_CHARACTER.test(sessionId)) {
    return textResponse(400, '缺少或非法的 sessionId', method, { code: 'request' })
  }
  const disposition = url.searchParams.get('disposition') ?? 'inline'
  if (disposition !== 'inline' && disposition !== 'attachment') {
    return textResponse(400, 'disposition 只能是 inline 或 attachment', method, { code: 'request' })
  }

  let result
  try {
    result = await exporter.exportSession(sessionId)
  } catch (error) {
    if (!(error instanceof PdfExportError)) logError(`会话 ${sessionId} 导出时出现未分类错误`, error)
    return errorResponse(error, method)
  }

  if (result.kind === 'empty') return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  const headers = {
    'content-type': 'application/pdf',
    'content-disposition': `${disposition}; filename="${pdfFilename(sessionId)}"`,
    'content-length': String(result.bytes.byteLength),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  }
  return new Response(method === 'HEAD' ? null : result.bytes, { status: 200, headers })
}

function errorResponse(error, method) {
  if (error instanceof SessionUnavailableError) return textResponse(404, '会话不存在或日志不可读', method, { code: 'session' })
  if (error instanceof SubagentExportError) return textResponse(400, '不支持导出子会话', method, { code: 'subagent' })
  if (error instanceof FontUnavailableError) return textResponse(503, '缺少可用的中文字体，无法导出', method, { code: 'font' })
  if (error instanceof BrowserUnavailableError) return textResponse(503, '没有可用的浏览器，无法导出 PDF', method, { code: 'browser' })
  if (error instanceof RenderFailedError) return textResponse(500, 'PDF 渲染失败', method, { code: 'render' })
  return textResponse(500, '导出失败', method, { code: 'internal' })
}

function textResponse(status, message, method, { code, headers: extraHeaders = {} } = {}) {
  const body = `${message}\n`
  const headers = {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    'cache-control': 'no-store',
    ...extraHeaders,
  }
  // HEAD 按 HTTP 规范不能带正文；用同源可见的机器码让浏览器半区仍能显示具体原因。
  if (code !== undefined) headers['x-dsh-export-error'] = code
  return new Response(method === 'HEAD' ? null : body, { status, headers })
}
