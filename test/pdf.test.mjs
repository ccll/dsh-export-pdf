// 测试锚点: R-01-005/AC-01 R-01-005/AC-02 R-01-005/AC-03 R-01-009/AC-01 R-01-009/AC-02 R-01-009/AC-03 R-01-011/AC-02
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { detectCjkFont } from '../src/fonts.mjs'
import { renderPdfWithBrowser, resolveBrowserPath } from '../src/chrome.mjs'
import { foldTranscript } from '../src/transcript.mjs'
import { renderTranscriptHtml } from '../src/render.mjs'

const PARAGRAPHS = 60
const CJK_LINE = '这是一段用于验证中文分页与字形嵌入的正文，包含标点、数字 12345 与 English words。'

function hasCommand(command) {
  try {
    execFileSync('which', [command], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function events() {
  const list = []
  let seq = 1
  list.push({ type: 'user/message', seq: seq++, time: seq, data: { source: { kind: 'user' }, content: [{ type: 'text', text: `用户右对齐标记 中文导出探针 ${CJK_LINE}` }] } })
  // 内部注入不得进入 PDF。
  list.push({ type: 'user/message', seq: seq++, time: seq, data: { source: { kind: 'runtime-context' }, content: [{ type: 'text', text: '内部上下文注入不应出现' }] } })
  list.push({
    type: 'assistant/message',
    seq: seq++,
    time: seq,
    data: {
      message: {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: '思考块正文不应出现' },
          { type: 'text', text: `助手左对齐标记 助手回答 ${CJK_LINE}` },
        ],
      },
    },
  })
  list.push({ type: 'tool/call', seq: seq++, time: seq, data: { name: 'bash', arguments: '{"command":"echo 中文参数探测"}' } })
  for (let index = 1; index <= PARAGRAPHS; index += 1) {
    list.push({
      type: 'user/message',
      seq: seq++,
      time: seq,
      data: { source: { kind: 'user' }, content: [{ type: 'text', text: `第 ${index} 段：${CJK_LINE}` }] },
    })
  }
  return list
}

test('真实浏览器打印：A4、多页、中文字形与转录内容正确', { timeout: 120_000 }, async (context) => {
  const browserPath = await resolveBrowserPath('').catch(() => undefined)
  const skip = (reason) => {
    // CI 已显式安装 Chrome 与 CJK 字体；静默跳过会让 A4/中文断言零覆盖。
    if (process.env.CI) assert.fail(reason)
    context.skip(reason)
  }
  if (browserPath === undefined) {
    skip('宿主没有可用的 Chrome/Chromium')
    return
  }
  if (!(await detectCjkFont())) {
    skip('宿主没有可用的中文字体')
    return
  }
  if (!hasCommand('pdfinfo') || !hasCommand('pdftotext')) {
    skip('宿主缺少 pdfinfo/pdftotext')
    return
  }

  const transcript = foldTranscript(events(), { include: ['tools'] })
  const bytes = await renderPdfWithBrowser({
    html: renderTranscriptHtml(transcript),
    browserPath,
    timeoutMs: 60_000,
  })
  assert.ok(bytes.byteLength > 1_000, 'PDF 非空')
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString('ascii'), '%PDF-')

  const directory = await mkdtemp(join(tmpdir(), 'dsh-pdf-test-'))
  try {
    const pdfPath = join(directory, 'out.pdf')
    await writeFile(pdfPath, bytes)
    const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
    const pages = Number(/^Pages:\s+(\d+)$/m.exec(info)?.[1] ?? '0')
    assert.ok(pages >= 2, `长会话应跨页，实际 ${pages} 页`)
    assert.match(info, /Page size:\s+59[45](?:\.\d+)? x 84[12](?:\.\d+)? pts/, '页面尺寸应为 A4')

    const allText = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' })
    assert.ok(allText.includes('中文导出探针'), '用户中文消息可抽取')
    assert.ok(allText.includes('助手回答'), '助手回复可抽取')
    assert.ok(allText.includes('工具调用'), '工具调用行可抽取')
    assert.ok(allText.includes('bash'), '工具名可抽取')
    assert.ok(allText.includes('echo 中文参数探测'), '工具参数摘要可抽取')
    assert.ok(!allText.includes('思考块正文不应出现'), '思考块不得进入 PDF')
    assert.ok(!allText.includes('内部上下文注入不应出现'), '内部注入不得进入 PDF')
    assert.ok(!allText.includes('file://'), '不得打印临时文件路径')
    assert.ok(!allText.includes('\uFFFD'), '不得出现缺字替换符')

    const firstPage = execFileSync('pdftotext', ['-f', '1', '-l', '1', pdfPath, '-'], { encoding: 'utf8' })
    const lastPage = execFileSync('pdftotext', ['-f', String(pages), '-l', String(pages), pdfPath, '-'], { encoding: 'utf8' })
    assert.ok(firstPage.includes('第 1 段'), '第一页包含开头内容')
    assert.ok(!firstPage.includes(`第 ${PARAGRAPHS} 段`), '末段不在第一页，内容确实分页')
    assert.ok(lastPage.includes(`第 ${PARAGRAPHS} 段`), '末页续排到最后一段')

    // R-01-005/AC-02 与 R-01-009/AC-03：词框不得越过页面右边界（A4 宽 595pt，右侧留白 45pt）。
    const bbox = execFileSync('pdftotext', ['-bbox', pdfPath, '-'], { encoding: 'utf8' })
    const rightEdges = [...bbox.matchAll(/xMax="([\d.]+)"/g)].map((match) => Number(match[1]))
    assert.ok(rightEdges.length > 0, 'bbox 应包含词框')
    const maxRight = Math.max(...rightEdges)
    assert.ok(maxRight < 550, `内容不得越出页面右边界，实际 xMax=${maxRight}`)

    // R-01-009/AC-01、AC-02：用户消息整体右移，助手回复从左侧起排。
    const wordXMin = (marker) => {
      const line = bbox.split('\n').find((value) => value.includes(marker))
      const match = /xMin="([\d.]+)"/.exec(line ?? '')
      return match === null ? undefined : Number(match[1])
    }
    const userX = wordXMin('用户右对齐标记')
    const assistantX = wordXMin('助手左对齐标记')
    assert.ok(userX !== undefined && assistantX !== undefined, 'bbox 应包含两侧标记词')
    assert.ok(assistantX < 300, `助手回复应从左侧起排，实际 xMin=${assistantX}`)
    assert.ok(userX > assistantX + 80, `用户消息应右移，用户 xMin=${userX}，助手 xMin=${assistantX}`)
    assert.ok(maxRight > 500, `用户消息应抵达版心右缘，实际 xMax=${maxRight}`)

    // 角色标签也必须贴合各自的边缘：用户“用户”在右缘，助手“助手”在左缘。
    const labelXMin = (label) => {
      const line = bbox.split('\n').find((value) => value.includes(`>${label}</word>`))
      const match = /xMin="([\d.]+)"/.exec(line ?? '')
      return match === null ? undefined : Number(match[1])
    }
    const userLabelX = labelXMin('用户')
    const assistantLabelX = labelXMin('助手')
    assert.ok(userLabelX > 500, `用户角色标签应贴近右缘，实际 xMin=${userLabelX}`)
    assert.ok(assistantLabelX < 100, `助手角色标签应贴近左缘，实际 xMin=${assistantLabelX}`)
    // 第一页正文应从用户消息开始，而不是 Chrome 默认页眉的日期。
    assert.ok(firstPage.includes('中文导出探针'), '第一页包含用户消息')
    assert.ok(!/^\s*\d{1,2}\/\d{1,2}\/\d{2}/.test(firstPage), '第一页不得出现 Chrome 默认页眉日期')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
