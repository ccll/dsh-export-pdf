import { foldTranscript } from './transcript.mjs'
import { normalizeImageMode, normalizeInclude, selectionKey } from './selection.mjs'
import { resolveEmbeddedImages, resolveMarkdownImages } from './images.mjs'
import { renderTranscriptHtml } from './render.mjs'
import { FontUnavailableError, RenderFailedError, SessionUnavailableError, SubagentExportError } from './errors.mjs'

/** 进程内导出结果缓存的最大条数；超出按最久未使用淘汰。内部参数，不对外承诺。 */
export const MAX_CACHE_ENTRIES = 32
/** 进程内导出结果缓存的字节预算。内部参数，不对外承诺。 */
export const MAX_CACHE_BYTES = 128 * 1024 * 1024
/** 单次导出的总时限；读日志、图片解析与打印共用，防止服务卡住时请求永久挂起。 */
export const DEFAULT_EXPORT_TIMEOUT_MS = 120_000

/**
 * 创建导出编排器。把读取、字体探测与打印作为依赖注入，便于单测在同一套
 * 缓存/并发语义上替换真实浏览器。
 * @param {{
 *   readSession: (sessionId: string) => Promise<{ session?: any, events: readonly any[] }>,
 *   readImage?: (ref: any) => Promise<{ data: Uint8Array, ref?: any }>,
 *   readLocalImage?: (path: string, options: { cwd?: string }) => Promise<Uint8Array>,
 *   renderPdf: (html: string) => Promise<Uint8Array>,
 *   hasCjkFont: () => Promise<boolean>,
 *   loadPageStyle: () => { text: string, version: string },
 *   maxConcurrentRenders?: number,
 *   cacheMaxEntries?: number,
 *   cacheMaxBytes?: number,
 *   exportTimeoutMs?: number,
 *   logError?: (message: string, error: unknown) => void,
 * }} dependencies
 */
export function createExporter(dependencies) {
  const {
    readSession,
    readImage,
    readLocalImage,
    renderPdf,
    hasCjkFont,
    loadPageStyle,
    maxConcurrentRenders = 2,
    cacheMaxEntries = MAX_CACHE_ENTRIES,
    cacheMaxBytes = MAX_CACHE_BYTES,
    exportTimeoutMs = DEFAULT_EXPORT_TIMEOUT_MS,
    logError = () => {},
  } = dependencies
  if (typeof readSession !== 'function') throw new Error('export-pdf: readSession 依赖缺失')
  if (typeof renderPdf !== 'function') throw new Error('export-pdf: renderPdf 依赖缺失')
  if (typeof hasCjkFont !== 'function') throw new Error('export-pdf: hasCjkFont 依赖缺失')
  if (typeof loadPageStyle !== 'function') throw new Error('export-pdf: loadPageStyle 依赖缺失')
  if (!Number.isSafeInteger(exportTimeoutMs) || exportTimeoutMs <= 0) {
    throw new Error('export-pdf: exportTimeoutMs 必须是正整数')
  }

  /** @type {Map<string, { length: number, styleVersion: string, bytes: number, result: { kind: 'pdf', bytes: Uint8Array, degraded?: boolean } | { kind: 'empty' } }>} */
  const cache = new Map()
  /** @type {Map<string, Promise<{ kind: 'pdf', bytes: Uint8Array, degraded?: boolean } | { kind: 'empty' }>>} */
  const inFlight = new Map()
  const limiter = createLimiter(maxConcurrentRenders)
  let cacheBytes = 0

  /**
   * 导出一个会话。命中缓存直接返回；同会话同选择并发请求合并到一次渲染；
   * 日志长度变化后重读并重新渲染。不同选择使用不同的缓存与单飞键。
   * @param {string} sessionId 会话标识
   * @param {readonly string[]} [include] 工具与文件附件选择
   * @param {unknown} [imageMode] 图片模式：none、placeholder 或 embed
   * @returns {Promise<{ kind: 'pdf', bytes: Uint8Array } | { kind: 'empty' }>}
   */
  async function exportSession(sessionId, include = [], imageMode = 'placeholder') {
    const selected = normalizeInclude(include)
    const mode = normalizeImageMode(imageMode)
    let pageStyle
    try {
      pageStyle = loadPageStyle()
    } catch (error) {
      logError(`会话 ${sessionId} 的页面样式表不可读`, error)
      throw new RenderFailedError()
    }
    const key = cacheKey(sessionId, selected, mode)
    return runExport(key, sessionId, selected, mode, pageStyle, Date.now() + exportTimeoutMs)
  }

  async function runExport(key, sessionId, selected, mode, pageStyle, deadline) {
    for (;;) {
      const snapshot = await withTimeout(readSnapshot(sessionId), remaining(deadline))
      const length = snapshot.events.length
      const cached = readCache(key)
      if (cached !== undefined && cached.length === length && cached.styleVersion === pageStyle.version) return cached.result

      const pending = inFlight.get(key)
      if (pending !== undefined) {
        // 同一会话同一选择同一时刻只有一个渲染任务；等待者复用结果后重新核对日志长度。
        const result = await withTimeout(pending, remaining(deadline))
        if (result.kind === 'pdf' && result.degraded === true) return result
        continue
      }

      const task = renderSnapshot(sessionId, snapshot, selected, mode, pageStyle.text)
      inFlight.set(key, task)
      try {
        const result = await withTimeout(task, remaining(deadline))
        writeCache(key, {
          length,
          styleVersion: pageStyle.version,
          bytes: result.kind === 'pdf' ? result.bytes.byteLength : 0,
          result,
        })
        return result
      } finally {
        inFlight.delete(key)
      }
    }
  }

  async function readSnapshot(sessionId) {
    let snapshot
    try {
      snapshot = await readSession(sessionId)
    } catch (error) {
      logError(`读取会话 ${sessionId} 失败`, error)
      throw new SessionUnavailableError()
    }
    if (snapshot === null || typeof snapshot !== 'object' || !Array.isArray(snapshot.events)) {
      logError(`会话 ${sessionId} 的日志快照形状非法`, new Error('invalid session snapshot'))
      throw new SessionUnavailableError()
    }
    const header = snapshot.session
    if (header?.origin === 'subagent' || (typeof header?.delegationDepth === 'number' && header.delegationDepth > 0)) {
      throw new SubagentExportError()
    }
    return snapshot
  }

  async function renderSnapshot(sessionId, snapshot, include, imageMode, pageStyle) {
    let entries = foldTranscript(snapshot.events, { include, imageMode })
    if (entries.length === 0) return { kind: 'empty' }
    if (!(await hasCjkFont())) throw new FontUnavailableError()
    let images = new Map()
    let degraded = false
    if (imageMode === 'embed') {
      entries = await resolveEmbeddedImages(entries, { readImage, logError })
      degraded = entries.degraded === true
      images = await resolveMarkdownImages(entries, { readLocalImage, cwd: snapshot.session?.cwd, logError })
      degraded = degraded || images.degraded === true
    }
    const html = renderTranscriptHtml(entries, pageStyle, { images })
    try {
      const bytes = await limiter.run(() => renderPdf(html))
      return { kind: 'pdf', bytes, degraded }
    } catch (error) {
      logError(`会话 ${sessionId} 的 PDF 渲染失败`, error)
      throw error
    }
  }

  function readCache(key) {
    const entry = cache.get(key)
    if (entry === undefined) return undefined
    // 触碰即更新 LRU 顺序。
    cache.delete(key)
    cache.set(key, entry)
    return entry
  }

  function writeCache(key, entry) {
    // 图片回退是暂时性降级；不缓存并清掉同键旧结果，下一次请求重新读取并有机会恢复。
    if (entry.result.kind === 'pdf' && entry.result.degraded === true) {
      const previous = cache.get(key)
      if (previous !== undefined) {
        cacheBytes -= previous.bytes
        cache.delete(key)
      }
      return
    }
    const previous = cache.get(key)
    if (previous !== undefined) cacheBytes -= previous.bytes
    cache.delete(key)
    cache.set(key, entry)
    cacheBytes += entry.bytes
    while (cache.size > cacheMaxEntries || cacheBytes > cacheMaxBytes) {
      const oldest = cache.keys().next().value
      if (oldest === undefined) break
      const removed = cache.get(oldest)
      if (removed !== undefined) cacheBytes -= removed.bytes
      cache.delete(oldest)
    }
  }

  return { exportSession }
}

/**
 * 缓存与单飞键：会话标识、归一选择与图片模式用 NUL 分隔，
 * 避免不同图片模式复用同一份 PDF。
 * @param {string} sessionId 会话标识
 * @param {readonly string[]} include 归一后的工具/文件选择
 * @param {string} imageMode 归一后的图片模式
 */
function cacheKey(sessionId, include, imageMode) {
  return `${sessionId}\u0000${selectionKey(include, imageMode)}`
}

/**
 * 距离导出总时限还剩多少毫秒；已过期时至少给 1ms，让超时错误立即产生。
 * @param {number} deadline 绝对截止时间
 * @returns {number}
 */
function remaining(deadline) {
  return Math.max(1, deadline - Date.now())
}

/**
 * 给一步导出操作加时限；超时以渲染失败结束，不永久占用单飞表。
 * @template T
 * @param {Promise<T>} promise 原始操作
 * @param {number} timeoutMs 时限
 * @returns {Promise<T>}
 */
function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new RenderFailedError('导出超时')), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * 固定并发上限的 FIFO 队列。
 * @param {number} limit 同时执行的任务数
 */
function createLimiter(limit) {
  let active = 0
  /** @type {Array<{ task: () => Promise<any>, resolve: (value: any) => void, reject: (reason: any) => void }>} */
  const queue = []

  function drain() {
    while (active < limit && queue.length > 0) {
      const item = queue.shift()
      if (item === undefined) return
      active += 1
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          active -= 1
          drain()
        })
    }
  }

  return {
    /**
     * @template T
     * @param {() => Promise<T>} task
     * @returns {Promise<T>}
     */
    run(task) {
      return new Promise((resolve, reject) => {
        queue.push({ task, resolve, reject })
        drain()
      })
    },
  }
}
