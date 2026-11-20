import { escapeHtml } from './html.mjs'

const SAFE_LINK = /^(?:https?:\/\/|mailto:)/i
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*(.*?)\s*$/
const HR = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/
const UL_ITEM = /^ {0,3}[-+*]\s+(.*)$/
const OL_ITEM = /^ {0,3}(\d{1,9})[.)]\s+(.*)$/
const QUOTE = /^ {0,3}>\s?(.*)$/
const TABLE_SEPARATOR = /^ {0,3}\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/
const SETEXT = /^ {0,3}(?:=+|-+)\s*$/
/** 引用块递归上限；超过后按普通段落呈现剩余文本，避免恶意输入耗尽调用栈。 */
const MAX_QUOTE_DEPTH = 32
/** 块级递归总上限；列表与引用交替嵌套也不能无限下钻。 */
const MAX_BLOCK_DEPTH = 32

/**
 * 把消息文本渲染成受控 HTML。解析顺序先块级后行内；代码片段先占位，
 * 避免强调/链接规则破坏代码内容。原始 HTML 不进入输出。
 * `context.renderImage` 可为 Markdown 图片返回已转义的内联 HTML（嵌入原图），
 * 不返回时按占位文字呈现。
 * @param {unknown} source Markdown 文本
 * @param {{ renderImage?: (href: string, alt: string) => string | undefined }} [context] 渲染上下文
 * @returns {string}
 */
export function renderMarkdown(source, context = {}) {
  const text = String(source ?? '').replace(/\r\n?/g, '\n')
  if (text.trim() === '') return ''
  return renderBlocks(text.split('\n'), context)
}

/**
 * 取出消息文本里 Markdown 图片的目标地址，供导出层按地址解析本地图片。
 * 与渲染使用同一套括号配对扫描，保证地址形状一致。
 * @param {unknown} source Markdown 文本
 * @returns {string[]}
 */
export function markdownImageSources(source) {
  const sources = []
  // 围栏代码与行内代码在渲染前就被 token 化，图片语法在其中不生效；扫描同样跳过，
  // 免得读取代码示例里的路径并记失败日志。
  replaceLinks(withoutCode(String(source ?? '')), (label, href, image) => {
    if (image) sources.push(href)
    return ''
  })
  return sources
}

/**
 * 去掉围栏代码块与行内代码，保留其余正文。
 * @param {string} text Markdown 文本
 * @returns {string}
 */
function withoutCode(text) {
  const lines = []
  let fence = null
  for (const line of text.split('\n')) {
    // 引用块里的围栏带 `> ` 前缀；判断围栏时剥掉前缀，保留原行用于扫描其它语法。
    const bare = line.replace(/^(?: {0,3}> ?)+/, '')
    if (fence === null) {
      const opening = bare.match(FENCE)
      if (opening) {
        fence = { marker: opening[1][0], length: opening[1].length }
        continue
      }
      lines.push(line)
      continue
    }
    const closing = new RegExp(`^ {0,3}${fence.marker === '`' ? '`' : '~'}{${fence.length},}\\s*$`)
    if (closing.test(bare)) fence = null
  }
  // 行内代码逐行剥离：渲染按块处理，跨段配对会把真实图片误当成代码吞掉。
  return lines.map((line) => line.replace(/(`+)([\s\S]*?)\1/g, ' ')).join('\n')
}

function isBlank(line) {
  return line.trim() === ''
}

function isTableStart(lines, index) {
  return lines[index]?.includes('|') && TABLE_SEPARATOR.test(lines[index + 1] ?? '')
}

function startsBlock(lines, index) {
  const line = lines[index] ?? ''
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    HR.test(line) ||
    QUOTE.test(line) ||
    UL_ITEM.test(line) ||
    OL_ITEM.test(line) ||
    SETEXT.test(line) ||
    isTableStart(lines, index)
  )
}

function renderBlocks(lines, context, depth = 0) {
  if (depth > MAX_BLOCK_DEPTH) return `<p>${renderInline(lines.join('\n'), context)}</p>`
  const blocks = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (isBlank(line)) {
      index += 1
      continue
    }

    const fence = line.match(FENCE)
    if (fence) {
      const marker = fence[1][0]
      const length = fence[1].length
      const language = fence[2].trim().split(/\s+/)[0] ?? ''
      const code = []
      index += 1
      const closing = new RegExp(`^ {0,3}${marker === '`' ? '`' : '~'}{${length},}\\s*$`)
      while (index < lines.length && !closing.test(lines[index])) code.push(lines[index++])
      if (index < lines.length) index += 1
      const langAttr = language === '' ? '' : ` data-lang="${escapeHtml(language)}"`
      blocks.push(`<pre class="md-code"${langAttr}><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    const heading = line.match(HEADING)
    if (heading) {
      const level = heading[1].length
      blocks.push(`<h${level}>${renderInline(heading[2], context)}</h${level}>`)
      index += 1
      continue
    }

    if (HR.test(line)) {
      blocks.push('<hr>')
      index += 1
      continue
    }

    if (QUOTE.test(line)) {
      const quote = []
      while (index < lines.length) {
        const match = lines[index].match(QUOTE)
        if (!match) break
        quote.push(match[1])
        index += 1
      }
      const quoteHtml = depth >= MAX_QUOTE_DEPTH
        ? `<p>${renderInline(quote.join('\n'), context)}</p>`
        : renderBlocks(quote, context, depth + 1)
      blocks.push(`<blockquote class="md-quote">${quoteHtml}</blockquote>`)
      continue
    }

    if (UL_ITEM.test(line) || OL_ITEM.test(line)) {
      const ordered = OL_ITEM.test(line)
      const items = []
      let start = 1
      const first = line.match(ordered ? OL_ITEM : UL_ITEM)
      if (ordered) start = Number(first[1])
      while (index < lines.length) {
        const match = lines[index].match(ordered ? OL_ITEM : UL_ITEM)
        if (!match) break
        const itemIndent = (lines[index].match(/^ */) ?? [''])[0].length
        let content = ordered ? match[2] : match[1]
        index += 1
        while (index < lines.length) {
          const next = lines[index]
          if (isBlank(next)) break
          const nextIndent = (next.match(/^ */) ?? [''])[0].length
          const nextItem = next.match(ordered ? OL_ITEM : UL_ITEM)
          if (nextItem && nextIndent <= itemIndent) break
          if (!/^\s{2,}/.test(next)) break
          const remove = Math.min(next.length, nextIndent <= itemIndent + 1 ? nextIndent : itemIndent + 2)
          content += `\n${next.slice(remove).trimEnd()}`
          index += 1
        }
        items.push(content)
        if (index < lines.length && isBlank(lines[index])) {
          let probe = index
          while (probe < lines.length && isBlank(lines[probe])) probe += 1
          if (probe < lines.length && (ordered ? OL_ITEM : UL_ITEM).test(lines[probe])) {
            index = probe
            continue
          }
          break
        }
      }
      const list = items.map((item) => `<li>${renderListItem(item, context, depth)}</li>`).join('')
      blocks.push(ordered && start !== 1 ? `<ol class="md-list" start="${start}">${list}</ol>` : `<${ordered ? 'ol' : 'ul'} class="md-list">${list}</${ordered ? 'ol' : 'ul'}>`)
      continue
    }

    if (isTableStart(lines, index)) {
      const header = splitTableRow(lines[index])
      const separator = splitTableRow(lines[index + 1])
      const align = separator.map((cell) => {
        const left = cell.startsWith(':')
        const right = cell.endsWith(':')
        return left && right ? 'center' : right ? 'right' : left ? 'left' : ''
      })
      index += 2
      const rows = []
      while (index < lines.length && !isBlank(lines[index]) && lines[index].includes('|')) {
        rows.push(splitTableRow(lines[index]))
        index += 1
      }
      const headerHtml = header.map((cell, column) => `<th${align[column] ? ` style="text-align:${align[column]}"` : ''}>${renderInline(cell, context)}</th>`).join('')
      const bodyHtml = rows
        .map((row) => `<tr>${header.map((_, column) => `<td${align[column] ? ` style="text-align:${align[column]}"` : ''}>${renderInline(row[column] ?? '', context)}</td>`).join('')}</tr>`)
        .join('')
      blocks.push(`<table class="md-table"><thead><tr>${headerHtml}</tr></thead>${bodyHtml === '' ? '' : `<tbody>${bodyHtml}</tbody>`}</table>`)
      continue
    }

    const paragraph = [line]
    index += 1
    while (index < lines.length && !isBlank(lines[index]) && !startsBlock(lines, index)) {
      paragraph.push(lines[index++])
    }
    if (index < lines.length && SETEXT.test(lines[index])) {
      const level = lines[index].trim().startsWith('=') ? 1 : 2
      blocks.push(`<h${level}>${renderInline(paragraph.join('\n'), context)}</h${level}>`)
      index += 1
    } else {
      blocks.push(`<p>${renderInline(paragraph.join('\n'), context)}</p>`)
    }
  }
  return blocks.join('\n')
}

function splitTableRow(line) {
  let value = line.trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|')) value = value.slice(0, -1)
  return value.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'))
}

function safeHref(raw) {
  const value = String(raw ?? '').trim()
  if (!SAFE_LINK.test(value)) return undefined
  return escapeHtml(value)
}

function renderListItem(content, context, depth = 0) {
  const lines = String(content).split('\n')
  const task = lines[0].match(/^\[([ xX])\]\s+(.*)$/)
  if (task !== null) {
    const rest = lines.slice(1)
    const checked = task[1].toLowerCase() === 'x'
    return `<span class="md-check">${checked ? '☑' : '☐'}</span> ${renderInline(task[2], context)}${rest.length === 0 ? '' : renderBlocks(rest, context, depth + 1)}`
  }
  if (lines.length === 1 && !startsBlock(lines, 0)) return renderInline(lines[0], context)
  return renderBlocks(lines, context, depth + 1)
}

function replaceLinks(source, convert) {
  const length = source.length
  // 预计算最近右方括号与括号配对，避免每个未闭合的 `[`/`![` 都向后扫到末尾。
  const nextCloseBracket = new Int32Array(length + 1).fill(-1)
  let nextBracket = -1
  for (let cursor = length - 1; cursor >= 0; cursor -= 1) {
    if (source[cursor] === ']') nextBracket = cursor
    nextCloseBracket[cursor] = nextBracket
  }
  const matchingParen = new Int32Array(length + 1).fill(-1)
  const openParens = []
  for (let cursor = 0; cursor < length; cursor += 1) {
    if (source[cursor] === '(') openParens.push(cursor)
    else if (source[cursor] === ')') {
      const open = openParens.pop()
      if (open !== undefined) matchingParen[open] = cursor
    }
  }

  let output = ''
  let index = 0
  while (index < length) {
    const image = source[index] === '!' && source[index + 1] === '['
    const labelStart = image ? index + 2 : source[index] === '[' ? index + 1 : -1
    if (labelStart < 0) {
      output += source[index++]
      continue
    }
    const labelEnd = nextCloseBracket[labelStart]
    if (labelEnd < 0) {
      output += source.slice(index)
      break
    }
    if (source[labelEnd + 1] !== '(') {
      output += source.slice(index, labelEnd + 1)
      index = labelEnd + 1
      continue
    }
    const closing = matchingParen[labelEnd + 1]
    if (closing < 0) {
      output += source[index++]
      continue
    }
    const inside = source.slice(labelEnd + 2, closing).trim()
    const href = markdownDestination(inside)
    output += convert(source.slice(labelStart, labelEnd), href, image)
    index = closing + 1
  }
  return output
}

/**
 * 从 `(…)` 内的目标串取出地址：CommonMark 允许用 `<…>` 包裹含空格的目标地址，
 * 其余情况取第一个空白前的片段（忽略可选标题）。
 * @param {string} inside 括号内的原始内容
 * @returns {string}
 */
function markdownDestination(inside) {
  if (inside.startsWith('<')) {
    const end = inside.indexOf('>')
    if (end > 0) return inside.slice(1, end)
  }
  return inside.split(/\s+/)[0] ?? ''
}

function renderInline(source, context = {}) {
  const tokens = []
  const token = (html) => {
    const key = `\uE000MD${tokens.length}\uE001`
    tokens.push(html)
    return key
  }
  let text = String(source ?? '')

  // 代码片段先占位，后续强调规则不会改动其内部字符。
  text = text.replace(/(`+)([\s\S]*?)\1/g, (_, ticks, code) => token(`<code class="md-inline-code">${escapeHtml(String(code).trim())}</code>`))
  // 反斜杠转义的 Markdown 元字符按字面量保留。
  text = text.replace(/\\([\\`*_[\]{}()#+.!~-])/g, (_, character) => token(escapeHtml(character)))
  // 尖括号自动链接只接受白名单协议。
  text = text.replace(/<(https?:\/\/[^>\s]+|mailto:[^>\s]+)>/g, (_, href) => token(`<a href="${safeHref(href)}" rel="noreferrer">${escapeHtml(href)}</a>`))
  // 图片与链接用括号配对扫描，避免 URL 里的 ) 被截断后把剩余字符漏到正文。
  text = replaceLinks(text, (label, href, image) => {
    if (image) {
      const alt = String(label).trim()
      // 嵌入由导出层决定：能解析出内联图片时用它，否则按占位文字呈现。
      const embedded = context.renderImage?.(href, alt)
      if (typeof embedded === 'string' && embedded !== '') return token(embedded)
      return token(`<span class="md-image">[图片${alt === '' ? '' : `: ${escapeHtml(alt)}`}]</span>`)
    }
    const safe = safeHref(href)
    if (safe === undefined) return token(renderInline(label, context))
    return token(`<a href="${safe}" rel="noreferrer">${renderInline(label, context)}</a>`)
  })

  text = escapeHtml(text)
  text = text
    .replace(/(?<!\*)\*\*\*(?![\s*])([^*\n]*?[^\s*])\*\*\*(?!\*)/g, '<strong><em>$1</em></strong>')
    .replace(/(?<![\w_])___(?![\s_])([^_\n]*?[^\s_])___(?![\w_])/g, '<strong><em>$1</em></strong>')
    .replace(/(?<!\*)\*\*(?![\s*])([^*\n]*?[^\s*])\*\*(?!\*)/g, '<strong>$1</strong>')
    .replace(/(?<![\w_])__(?![\s_])([^_\n]*?[^\s_])__(?![\w_])/g, '<strong>$1</strong>')
    .replace(/~~(?![\s~])([^~\n]*?[^\s~])~~/g, '<del>$1</del>')
    .replace(/(?<!\*)\*(?![\s*])([^*\n]*?[^\s*])\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<![\w_])_(?![\s_])([^_\n]*?[^\s_])_(?![\w_])/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
  return text.replace(/\uE000MD(\d+)\uE001/g, (_, index) => tokens[Number(index)] ?? '')
}
