/** 导出内容选择的 token 顺序与文件名后缀集中在这里；新增类型仍需接入视图文案。 */
export const INCLUDE_TOKENS = ['tools', 'attachments']
/** 图片呈现模式；缺省为占位。 */
export const IMAGE_MODES = ['none', 'placeholder', 'embed']

/**
 * 把合法 token 归一为固定顺序，丢弃未知值；路由负责在边界上报错。
 * @param {unknown} value 原始选择（数组）
 * @returns {string[]}
 */
export function normalizeInclude(value) {
  const selected = Array.isArray(value) ? value : []
  return INCLUDE_TOKENS.filter((token) => selected.includes(token))
}

/**
 * 文件名后缀：只有附加内容选择时追加，默认最简不加后缀。
 * @param {unknown} value 原始选择（数组）
 * @returns {string}
 */
export function includeSuffix(value) {
  const selected = normalizeInclude(value)
  const tools = selected.includes('tools')
  const attachments = selected.includes('attachments')
  return tools && attachments ? '-tools-attachments' : tools ? '-tools' : attachments ? '-attachments' : ''
}

/**
 * 归一图片模式，未知值退回缺省占位；路由负责在边界上报错。
 * @param {unknown} value 原始模式
 * @returns {'none' | 'placeholder' | 'embed'}
 */
export function normalizeImageMode(value) {
  return IMAGE_MODES.includes(value) ? value : 'placeholder'
}

/**
 * 图片模式的文件名后缀：占位是缺省，不追加；嵌入与不导出追加可区分后缀。
 * @param {unknown} value 原始模式
 * @returns {string}
 */
export function imageModeSuffix(value) {
  const mode = normalizeImageMode(value)
  return mode === 'embed' ? '-images' : mode === 'none' ? '-no-images' : ''
}

/**
 * 视图/缓存使用的选择键：包含工具、文件与图片模式，避免不同模式互相复用。
 * @param {readonly string[]} include 归一后的工具/文件选择
 * @param {unknown} imageMode 图片模式
 * @returns {string}
 */
export function selectionKey(include, imageMode) {
  return `${normalizeImageMode(imageMode)}\u0000${include.join(',')}`
}
