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

/**
 * 把消息文本渲染成受控 HTML。解析顺序先块级后行内；代码片段先占位，
 * 避免强调/链接规则破坏代码内容。原始 HTML 不进入输出。
 * @param {unknown} source Markdown 文本
 * @returns {string}
 */
export function renderMarkdown(source) {
  const text = String(source ?? '').replace(/\r\n?/g, '\n')
  if (text.trim() === '') return ''
  return renderBlocks(text.split('\n'))
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

function renderBlocks(lines) {
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
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
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
      blocks.push(`<blockquote class="md-quote">${renderBlocks(quote)}</blockquote>`)
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
      const list = items.map((item) => `<li>${renderListItem(item)}</li>`).join('')
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
      const headerHtml = header.map((cell, column) => `<th${align[column] ? ` style="text-align:${align[column]}"` : ''}>${renderInline(cell)}</th>`).join('')
      const bodyHtml = rows
        .map((row) => `<tr>${header.map((_, column) => `<td${align[column] ? ` style="text-align:${align[column]}"` : ''}>${renderInline(row[column] ?? '')}</td>`).join('')}</tr>`)
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
      blocks.push(`<h${level}>${renderInline(paragraph.join('\n'))}</h${level}>`)
      index += 1
    } else {
      blocks.push(`<p>${renderInline(paragraph.join('\n'))}</p>`)
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

function renderListItem(content) {
  const lines = String(content).split('\n')
  const task = lines[0].match(/^\[([ xX])\]\s+(.*)$/)
  if (task !== null) {
    const rest = lines.slice(1)
    const checked = task[1].toLowerCase() === 'x'
    return `<span class="md-check">${checked ? '☑' : '☐'}</span> ${renderInline(task[2])}${rest.length === 0 ? '' : renderBlocks(rest)}`
  }
  if (lines.length === 1 && !startsBlock(lines, 0)) return renderInline(lines[0])
  return renderBlocks(lines)
}

function replaceLinks(source, convert) {
  let output = ''
  let index = 0
  while (index < source.length) {
    const image = source[index] === '!' && source[index + 1] === '['
    const labelStart = image ? index + 2 : source[index] === '[' ? index + 1 : -1
    if (labelStart < 0) {
      output += source[index++]
      continue
    }
    let labelEnd = labelStart
    while (labelEnd < source.length && source[labelEnd] !== ']') labelEnd += 1
    if (labelEnd >= source.length) {
      output += source.slice(index)
      break
    }
    if (source[labelEnd + 1] !== '(') {
      output += source.slice(index, labelEnd + 1)
      index = labelEnd + 1
      continue
    }
    let depth = 1
    let cursor = labelEnd + 2
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === '(') depth += 1
      else if (source[cursor] === ')') depth -= 1
      cursor += 1
    }
    if (depth !== 0) {
      output += source[index++]
      continue
    }
    const inside = source.slice(labelEnd + 2, cursor - 1).trim()
    const href = inside.split(/\s+/)[0] ?? ''
    output += convert(source.slice(labelStart, labelEnd), href, image)
    index = cursor
  }
  return output
}

function renderInline(source) {
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
      return token(`<span class="md-image">[图片${alt === '' ? '' : `: ${escapeHtml(alt)}`}]</span>`)
    }
    const safe = safeHref(href)
    if (safe === undefined) return token(renderInline(label))
    return token(`<a href="${safe}" rel="noreferrer">${renderInline(label)}</a>`)
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
