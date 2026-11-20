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
 * 宿主的文件服务。不写进 `inject`：宿主没有该服务时插件仍要能装载并导出，
 * 只是 Markdown 本地图片退回占位文字；有该服务时读取权限与 GUI 的 `/api/file`
 * 一致——宿主沙箱只约束写入，读取不受限，两侧都用 `lstat` 拒绝最终符号链接。
 * @param {any} ctx 宿主上下文
 * @returns {any}
 */
function hostFileSystem(ctx) {
  return typeof ctx.get === 'function' ? ctx.get('fs') : undefined
}

/**
 * 构造本地图片读取函数：路径解析、文件类型检查与读取全部交给宿主的文件服务，
 * 读取上限沿用附件图片准入上限，避免单张图把整份导出撑爆。
 * @param {{ getFs: () => any, maxBytes: () => number }} dependencies
 * @returns {(path: string, options?: { cwd?: string }) => Promise<Uint8Array>}
 */
export function createLocalImageReader({ getFs, maxBytes }) {
  if (typeof getFs !== 'function') throw new Error('export-pdf: 本地图片读取器缺少 getFs')
  if (typeof maxBytes !== 'function') throw new Error('export-pdf: 本地图片读取器缺少 maxBytes')
  return async (path, options = {}) => {
    const fs = getFs()
    if (fs === undefined || fs === null) throw readerError('LOCAL_IMAGE_FS_UNAVAILABLE', '宿主文件服务不可用')
    const limit = maxBytes()
    if (!Number.isSafeInteger(limit) || limit <= 0) throw readerError('LOCAL_IMAGE_LIMIT_MISSING', '图片大小上限未配置')
    const scope = options.cwd === undefined ? undefined : { cwd: options.cwd }
    // lstat 按路径判定、不跟随最终符号链接：链接按「不是常规文件」拒绝，与聊天文件服务一致。
    const info = await fs.lstat(path, scope)
    if (info === undefined || info.type !== 'file') throw readerError('LOCAL_IMAGE_NOT_FILE', '图片不是常规文件')
    const target = await fs.resolve(path, scope)
    const data = await fs.readBytes(target, undefined, limit)
    if (!(data instanceof Uint8Array) || data.byteLength === 0) throw readerError('LOCAL_IMAGE_EMPTY', '图片文件为空')
    return data
  }
}

/** 读取失败带稳定机器码，导出层记日志时只留码、不拼接可能含路径的消息。 */
function readerError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/**
 * 把错误与其 cause 链压成一段日志文本；只保留前四层，避免日志被递归原因撑爆。
 * @param {unknown} error 任意抛出的值
 * @returns {string}
 */
function errorDetail(error) {
  const parts = []
  let current = error
  for (let depth = 0; depth < 4 && current !== undefined && current !== null; depth += 1) {
    const detail = current?.detail ?? current?.message ?? String(current)
    parts.push(String(detail))
    current = current?.cause
  }
  return parts.join(' <- ')
}

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
    logger.warn(`${message}: ${String(errorDetail(error)).slice(0, 1_000)}`)
  }

  /** 按源码内容热加载渲染管线；这里只创建一次，缓存与日志随实例走。 */
  const pipelineLoader = createPipelineLoader({ logError })
  // 插件卸载时删除私有临时目录；目录清理失败只记日志，不阻断卸载。
  ctx.effect(() => () => pipelineLoader.dispose(), 'dsh-export-pdf: pipeline cache')
  /** 本地图片读取器：宿主文件服务与附件图片上限在读取时取，便于热路径随宿主状态变化。 */
  const readLocalImage = createLocalImageReader({
    getFs: () => hostFileSystem(ctx),
    maxBytes: () => ctx.attachments.imageLimits.maxImageBytes,
  })
  /** 当前管线版本对应的编排器；管线换版就重建，缓存随之清空。 */
  let active = null

  const exporterFor = (pipeline) => {
    if (active !== null && active.pipeline === pipeline) return active.exporter
    const exporter = pipeline.createExporter({
      readSession: (sessionId) => ctx.sessionQuery.readSession(sessionId),
      readImage: (ref) => ctx.attachments.readImage(ref),
      readLocalImage,
      renderPdf: async (html) => {
        const browserPath = await resolveBrowserPath(config.browserPath)
        return renderPdfWithBrowser({ html, browserPath, timeoutMs: config.timeoutMs })
      },
      hasCjkFont: detectCjkFont,
      loadPageStyle: () => readPageStyle(),
      maxConcurrentRenders: config.maxConcurrentRenders,
      exportTimeoutMs: config.exportTimeoutMs,
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
          const method = request.method.toUpperCase()
          try {
            const pipeline = await pipelineLoader.load()
            return await handlePdfRequest(request, exporterFor(pipeline), { logError, helpers: pipeline })
          } catch (error) {
            logError('导出请求处理失败', error)
            return exportErrorResponse(error, method)
          }
        },
      }),
    'dsh-export-pdf: session.pdf route',
  )
}
