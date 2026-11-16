import { normalizeConfig } from './config.mjs'
import { createExporter } from './exporter.mjs'
import { detectCjkFont } from './fonts.mjs'
import { renderPdfWithBrowser, resolveBrowserPath } from './chrome.mjs'
import { SESSION_PDF_PATH, handlePdfRequest } from './route.mjs'

/** 宿主插件名，与 cordis.patch.yml 的插入行一致。 */
export const name = 'dsh-export-pdf'
/** 导出只依赖鉴权路由桥与会话查询服务；日志走宿主 logger。 */
export const inject = ['connection', 'sessionQuery', 'attachments']

/**
 * 注册 `/api/session.pdf` 路由。路由本身由 Connection 的 `/api` 桥完成
 * Host/Origin 与浏览器会话鉴权，插件只做参数校验、导出编排与响应构造。
 * @param {any} ctx 宿主上下文
 * @param {unknown} rawConfig 插件配置
 */
export function apply(ctx, rawConfig = {}) {
  const config = normalizeConfig(rawConfig)
  const logger = ctx.logger('dsh-export-pdf')

  const logError = (message, error) => {
    const detail = error?.detail ?? (error instanceof Error ? error.message : String(error))
    logger.warn(`${message}: ${String(detail).slice(0, 1_000)}`)
  }

  const exporter = createExporter({
    readSession: (sessionId) => ctx.sessionQuery.readSession(sessionId),
    readImage: (ref) => ctx.attachments.readImage(ref),
    renderPdf: async (html) => {
      const browserPath = await resolveBrowserPath(config.browserPath)
      return renderPdfWithBrowser({ html, browserPath, timeoutMs: config.timeoutMs })
    },
    hasCjkFont: detectCjkFont,
    maxConcurrentRenders: config.maxConcurrentRenders,
    logError,
  })

  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: SESSION_PDF_PATH,
        methods: ['GET', 'HEAD'],
        requestBody: 'buffered',
        fetch: (request) => handlePdfRequest(request, exporter, { logError }),
      }),
    'dsh-export-pdf: session.pdf route',
  )
}
