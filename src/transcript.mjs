/** 工具调用参数摘要的最大字符数。 */
export const TOOL_ARGUMENT_SUMMARY_MAX = 160
const TOOL_ARGUMENT_VALUE_MAX = 60
/** 导出内容选择的合法 token；顺序即缺省归一顺序。 */
export const INCLUDE_TOKENS = ['tools', 'attachments']

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
 * 把合法 token 归一为固定顺序，丢弃未知值；路由负责在边界上报错。
 * @param {unknown} value 原始选择（数组）
 * @returns {string[]}
 */
export function normalizeInclude(value) {
  const selected = Array.isArray(value) ? value : []
  return INCLUDE_TOKENS.filter((token) => selected.includes(token))
}

/**
 * 从消息内容块里取可读文本：text 原样保留，图片与文件在包含附件占位时
 * 降为占位符，reasoning 与 tool-call 块不进入正文。
 * @param {readonly any[] | undefined} blocks 内容块
 * @param {{ includeAttachments?: boolean }} [options]
 * @returns {string}
 */
export function messageText(blocks, options = {}) {
  const includeAttachments = options.includeAttachments ?? true
  const parts = []
  for (const block of blocks ?? []) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    } else if (block?.type === 'image' && includeAttachments) {
      parts.push('[图片]')
    } else if (block?.type === 'file' && includeAttachments) {
      const name = block.attachment?.name
      parts.push(typeof name === 'string' && name !== '' ? `[附件: ${name}]` : '[附件]')
    }
  }
  return parts.join('\n').trim()
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
 * 按会话日志顺序折叠转录。缺省只保留用户与助手文本；`tools` 加入工具调用，
 * `attachments` 把图片/文件转为占位。思考块、工具结果与失败尝试不进入结果。
 * @param {readonly any[]} events `sessionQuery.readSession` 返回的事件数组
 * @param {{ include?: readonly string[] }} [options] 导出内容选择
 * @returns {Array<{ kind: 'user' | 'assistant' | 'tool', seq: number, text?: string, name?: string, summary?: string }>}
 */
export function foldTranscript(events, options = {}) {
  const include = new Set(normalizeInclude(options.include))
  const includeAttachments = include.has('attachments')
  const entries = []
  for (const event of events ?? []) {
    switch (event?.type) {
      case 'user/message': {
        if (!isHumanUserMessage(event)) break
        const text = messageText(event.data?.content, { includeAttachments })
        if (text !== '') entries.push({ kind: 'user', seq: event.seq, text })
        break
      }
      case 'assistant/message': {
        const text = messageText(event.data?.message?.content, { includeAttachments })
        if (text !== '') entries.push({ kind: 'assistant', seq: event.seq, text })
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
