/** 单次渲染的缺省截止时间（毫秒）。 */
export const DEFAULT_TIMEOUT_MS = 30_000
/** 单次导出（读日志、图片解析与打印）的缺省截止时间（毫秒）。 */
export const DEFAULT_EXPORT_TIMEOUT_MS = 120_000
/** 同时运行的最大渲染数缺省值。 */
export const DEFAULT_MAX_CONCURRENT_RENDERS = 2

const TIMEOUT_MAX_MS = 600_000
const CONCURRENCY_MAX = 16

/**
 * 校验并归一插件配置。非法配置在装载期直接抛错，不静默回退到缺省值。
 * @param {unknown} raw 宿主传入的插件配置
 * @returns {{ browserPath: string, timeoutMs: number, exportTimeoutMs: number, maxConcurrentRenders: number }}
 */
export function normalizeConfig(raw = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('export-pdf: 配置必须是对象')
  }
  const browserPathValue = raw.browserPath ?? ''
  if (typeof browserPathValue !== 'string') {
    throw new Error('export-pdf: browserPath 必须是字符串')
  }
  const timeoutMs = positiveInteger(raw.timeoutMs ?? DEFAULT_TIMEOUT_MS, 'timeoutMs', TIMEOUT_MAX_MS)
  // 未显式配置总时限时至少覆盖单次渲染时限；否则既有的 timeoutMs > 120000 配置会在升级后装载失败。
  const exportTimeoutMs = raw.exportTimeoutMs === undefined
    ? Math.max(DEFAULT_EXPORT_TIMEOUT_MS, timeoutMs)
    : positiveInteger(raw.exportTimeoutMs, 'exportTimeoutMs', TIMEOUT_MAX_MS)
  if (exportTimeoutMs < timeoutMs) {
    throw new Error('export-pdf: exportTimeoutMs 不能小于 timeoutMs')
  }
  return {
    browserPath: browserPathValue.trim(),
    timeoutMs,
    exportTimeoutMs,
    maxConcurrentRenders: positiveInteger(raw.maxConcurrentRenders ?? DEFAULT_MAX_CONCURRENT_RENDERS, 'maxConcurrentRenders', CONCURRENCY_MAX),
  }
}

function positiveInteger(value, field, maximum) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`export-pdf: ${field} 必须是 1 到 ${maximum} 之间的整数`)
  }
  return value
}
