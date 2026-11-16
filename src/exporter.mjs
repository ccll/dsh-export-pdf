import { foldTranscript, normalizeInclude } from './transcript.mjs'
import { renderTranscriptHtml } from './render.mjs'
import { FontUnavailableError, SessionUnavailableError, SubagentExportError } from './errors.mjs'

/** 进程内导出结果缓存的最大条数；超出按最久未使用淘汰。内部参数，不对外承诺。 */
export const MAX_CACHE_ENTRIES = 32

/**
 * 创建导出编排器。把读取、字体探测与打印作为依赖注入，便于单测在同一套
 * 缓存/并发语义上替换真实浏览器。
 * @param {{
 *   readSession: (sessionId: string) => Promise<{ session?: any, events: readonly any[] }>,
 *   renderPdf: (html: string) => Promise<Uint8Array>,
 *   hasCjkFont: () => Promise<boolean>,
 *   maxConcurrentRenders?: number,
 *   cacheMaxEntries?: number,
 *   logError?: (message: string, error: unknown) => void,
 * }} dependencies
 */
export function createExporter(dependencies) {
  const {
    readSession,
    renderPdf,
    hasCjkFont,
    maxConcurrentRenders = 2,
    cacheMaxEntries = MAX_CACHE_ENTRIES,
    logError = () => {},
  } = dependencies
  if (typeof readSession !== 'function') throw new Error('export-pdf: readSession 依赖缺失')
  if (typeof renderPdf !== 'function') throw new Error('export-pdf: renderPdf 依赖缺失')
  if (typeof hasCjkFont !== 'function') throw new Error('export-pdf: hasCjkFont 依赖缺失')

  /** @type {Map<string, { length: number, result: { kind: 'pdf', bytes: Uint8Array } | { kind: 'empty' } }>} */
  const cache = new Map()
  /** @type {Map<string, Promise<{ kind: 'pdf', bytes: Uint8Array } | { kind: 'empty' }>>} */
  const inFlight = new Map()
  const limiter = createLimiter(maxConcurrentRenders)

  /**
   * 导出一个会话。命中缓存直接返回；同会话同选择并发请求合并到一次渲染；
   * 日志长度变化后重读并重新渲染。不同选择使用不同的缓存与单飞键。
   * @param {string} sessionId 会话标识
   * @param {readonly string[]} [include] 导出内容选择
   * @returns {Promise<{ kind: 'pdf', bytes: Uint8Array } | { kind: 'empty' }>}
   */
  async function exportSession(sessionId, include = []) {
    const selected = normalizeInclude(include)
    const key = cacheKey(sessionId, selected)
    for (;;) {
      const snapshot = await readSnapshot(sessionId)
      const length = snapshot.events.length
      const cached = readCache(key)
      if (cached !== undefined && cached.length === length) return cached.result

      const pending = inFlight.get(key)
      if (pending !== undefined) {
        // 同一会话同一选择同一时刻只有一个渲染任务；等待者复用结果后重新核对日志长度。
        await pending
        continue
      }

      const task = renderSnapshot(sessionId, snapshot, selected)
      inFlight.set(key, task)
      try {
        const result = await task
        writeCache(key, { length, result })
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

  async function renderSnapshot(sessionId, snapshot, include) {
    const entries = foldTranscript(snapshot.events, { include })
    if (entries.length === 0) return { kind: 'empty' }
    if (!(await hasCjkFont())) throw new FontUnavailableError()
    const html = renderTranscriptHtml(entries)
    try {
      const bytes = await limiter.run(() => renderPdf(html))
      return { kind: 'pdf', bytes }
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
    cache.delete(key)
    cache.set(key, entry)
    while (cache.size > cacheMaxEntries) {
      const oldest = cache.keys().next().value
      if (oldest === undefined) break
      cache.delete(oldest)
    }
  }

  return { exportSession }
}

/**
 * 缓存与单飞键：会话标识与归一选择的组合。选择为空时保留旧格式的
 * `sessionId\u0000` 前缀，避免与只靠会话标识的旧缓存混淆。
 * @param {string} sessionId 会话标识
 * @param {readonly string[]} include 归一后的选择
 */
function cacheKey(sessionId, include) {
  return `${sessionId}\u0000${include.join(',')}`
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
