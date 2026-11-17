import { normalizeConfig } from './config.mjs'
import { detectCjkFont } from './fonts.mjs'
import { renderPdfWithBrowser, resolveBrowserPath } from './chrome.mjs'
import { readPageStyle } from './page-style.mjs'
import { createPipelineLoader } from './pipeline.mjs'
import { SESSION_PDF_PATH, exportErrorResponse, handlePdfRequest } from './route.mjs'

/** 宿主插件名，与 cordis.patch.yml 的插入行一致。 */
export const name = 'dsh-export-pdf'
/** 导出只依赖鉴权路由桥与会话查询服务；日志走宿主 logger。 */
export const inject = ['connection', 'sessionQuery', 'attachments']

/**
 * 注册 `/api/session.pdf` 路由。路由本身由 Connection 的 `/api` 桥完成
 * Host/Origin 与浏览器会话鉴权，插件只做参数校验、导出编排与响应构造。
 *
 * 渲染管线与页面样式在导出时重新加载，所以改被加载的管线模块或样式表不需要
 * 重启宿主；改动本文件、route、config、chrome、fonts，或两个加载器（pipeline、
 * page-style）本身，仍需重启（T-013）。
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

  /** 按源码内容热加载渲染管线；这里只创建一次，缓存与日志随实例走。 */
  const pipelineLoader = createPipelineLoader({ logError })
  /** 当前管线版本对应的编排器；管线换版就重建，缓存随之清空。 */
  let active = null

  const exporterFor = (pipeline) => {
    if (active !== null && active.pipeline === pipeline) return active.exporter
    const exporter = pipeline.createExporter({
      readSession: (sessionId) => ctx.sessionQuery.readSession(sessionId),
      readImage: (ref) => ctx.attachments.readImage(ref),
      renderPdf: async (html) => {
        const browserPath = await resolveBrowserPath(config.browserPath)
        return renderPdfWithBrowser({ html, browserPath, timeoutMs: config.timeoutMs })
      },
      hasCjkFont: detectCjkFont,
      loadPageStyle: () => readPageStyle(),
      maxConcurrentRenders: config.maxConcurrentRenders,
      logError,
    })
    active = { pipeline, exporter }
    return exporter
  }

  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: SESSION_PDF_PATH,
        methods: ['GET', 'HEAD'],
        requestBody: 'buffered',
        fetch: async (request) => {
          let pipeline
          try {
            pipeline = await pipelineLoader.load()
          } catch (error) {
            logError('渲染管线不可用', error)
            return exportErrorResponse(error, request.method.toUpperCase())
          }
          return handlePdfRequest(request, exporterFor(pipeline), { logError, helpers: pipeline })
        },
      }),
    'dsh-export-pdf: session.pdf route',
  )
}
