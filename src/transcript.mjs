import { normalizeImageMode, normalizeInclude } from './selection.mjs'

/** 工具调用参数摘要的最大字符数。 */
export const TOOL_ARGUMENT_SUMMARY_MAX = 160
const TOOL_ARGUMENT_VALUE_MAX = 60

/**
 * 判断一条 user/message 是否真人输入。当前日志以 `source.kind === 'user'`
 * 标记真人输入；旧格式日志缺少 source，无法区分内部注入，按真人输入处理，
 * 避免历史会话导出为空。
 * @param {any} event 会话事件
 * @returns {boolean}
 */
export function isHumanUserMessage(event) {
  if (event?.type !== 'user/message') return false
  const source = event.data?.source
  if (source === undefined || source === null) return true
  return source.kind === 'user'
}

/**
 * 把消息内容块拆成可渲染分段：文本原样保留；图片按模式省略、占位或保留
 * 附件引用；文件仅在选中文件附件时降为占位。reasoning 与 tool-call 块忽略。
 * @param {readonly any[] | undefined} blocks 内容块
 * @param {{ imageMode?: unknown, includeFiles?: boolean }} [options]
 * @returns {Array<{ type: 'text', text: string } | { type: 'image', attachment: any }>}
 */
export function messageParts(blocks, options = {}) {
  const imageMode = normalizeImageMode(options.imageMode)
  const includeFiles = options.includeFiles ?? true
  const parts = []
  for (const block of blocks ?? []) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      parts.push({ type: 'text', text: block.text })
    } else if (block?.type === 'image' && imageMode !== 'none') {
      if (imageMode === 'embed') parts.push({ type: 'image', attachment: block.attachment })
      else parts.push({ type: 'text', text: '[图片]' })
    } else if (block?.type === 'file' && includeFiles) {
      const name = block.attachment?.name
      parts.push({ type: 'text', text: typeof name === 'string' && name !== '' ? `[附件: ${name}]` : '[附件]' })
    }
  }
  return parts
}

/**
 * 条目的内容分段：有 parts 用 parts，否则把条目文本包成单段。
 * 渲染与 Markdown 图片扫描共用，避免两处各判一次形状。
 * @param {{ parts?: readonly any[], text?: string }} entry 转录条目
 * @returns {readonly any[]}
 */
export function entryParts(entry) {
  return Array.isArray(entry?.parts) ? entry.parts : [{ type: 'text', text: entry?.text }]
}

/**
 * 取分段里的文本部分，按原块顺序用换行连接；图片分段不产生文本。
 * @param {readonly { type: string, text?: string }[]} parts 内容分段
 * @returns {string}
 */
export function partsText(parts) {
  return parts
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim()
}

/**
 * 从消息内容块里取可读文本：默认图片与文件都降为占位；显式 imageMode 优先，
 * includeFiles 可独立关闭文件占位。
 * @param {readonly any[] | undefined} blocks 内容块
 * @param {{ includeAttachments?: boolean, includeFiles?: boolean, imageMode?: unknown }} [options]
 * @returns {string}
 */
export function messageText(blocks, options = {}) {
  const includeAttachments = options.includeAttachments ?? true
  const imageMode = options.imageMode ?? (includeAttachments ? 'placeholder' : 'none')
  const includeFiles = options.includeFiles ?? includeAttachments
  return partsText(messageParts(blocks, { imageMode, includeFiles }))
}

/**
 * 把工具调用参数 JSON 压成单行摘要。解析失败时退化为空白折叠后的原文；
 * 超长值单独截断，总长受 {@link TOOL_ARGUMENT_SUMMARY_MAX} 约束。
 * @param {unknown} raw 模型产出的原始参数 JSON 字符串
 * @returns {string}
 */
export function summarizeToolArguments(raw) {
  if (typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return truncate(trimmed.replace(/\s+/g, ' '), TOOL_ARGUMENT_SUMMARY_MAX)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return truncate(JSON.stringify(parsed), TOOL_ARGUMENT_SUMMARY_MAX)
  }
  const parts = []
  for (const [key, value] of Object.entries(parsed)) {
    const rendered = typeof value === 'string' ? value : JSON.stringify(value)
    // 参数值里的换行、制表符会把“单行摘要”撑成多行，统一折叠为空格。
    const normalized = String(rendered ?? '').replace(/\s+/g, ' ')
    const label = key.replace(/\s+/g, ' ').trim() || '(空键)'
    parts.push(`${label}=${truncate(normalized, TOOL_ARGUMENT_VALUE_MAX)}`)
    if (parts.join(', ').length >= TOOL_ARGUMENT_SUMMARY_MAX) break
  }
  return truncate(parts.join(', '), TOOL_ARGUMENT_SUMMARY_MAX)
}

/**
 * 按会话日志顺序折叠转录。默认图片占位、文件不加入；`tools` 加入工具调用，
 * `attachments` 只加入文件附件占位，`imageMode` 控制图片的不导出/占位/嵌入。
 * @param {readonly any[]} events `sessionQuery.readSession` 返回的事件数组
 * @param {{ include?: readonly string[], imageMode?: unknown }} [options] 导出内容选择
 * @returns {Array<{ kind: 'user' | 'assistant', seq: number, text?: string, parts?: any[] } | { kind: 'tool', seq: number, name: string, summary: string }>}
 */
export function foldTranscript(events, options = {}) {
  const include = new Set(normalizeInclude(options.include))
  const imageMode = normalizeImageMode(options.imageMode)
  const includeFiles = include.has('attachments')
  const entries = []
  const pushMessage = (kind, seq, blocks) => {
    const parts = messageParts(blocks, { imageMode, includeFiles })
    const hasImage = parts.some((part) => part.type === 'image')
    const text = partsText(parts)
    if (text === '' && !hasImage) return
    entries.push({ kind, seq, text, ...(hasImage ? { parts } : {}) })
  }

  for (const event of events ?? []) {
    switch (event?.type) {
      case 'user/message': {
        if (!isHumanUserMessage(event)) break
        pushMessage('user', event.seq, event.data?.content)
        break
      }
      case 'assistant/message': {
        pushMessage('assistant', event.seq, event.data?.message?.content)
        break
      }
      case 'tool/call': {
        if (!include.has('tools')) break
        const rawName = typeof event.data?.name === 'string' && event.data.name !== '' ? event.data.name : '(未命名工具)'
        const name = rawName.replace(/\s+/g, ' ').trim() || '(未命名工具)'
        entries.push({ kind: 'tool', seq: event.seq, name, summary: summarizeToolArguments(event.data?.arguments) })
        break
      }
      default:
        break
    }
  }
  return entries
}


function truncate(value, maximum) {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`
}
