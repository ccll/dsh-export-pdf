// 测试锚点: R-01-003/AC-02 R-01-006/AC-01 R-01-006/AC-04 R-01-007/AC-02 R-01-011/AC-02 R-01-011/AC-04 R-01-011/AC-05 R-01-012/AC-03 R-01-012/AC-05
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createExporter } from '../src/exporter.mjs'
import { FontUnavailableError, RenderFailedError, SessionUnavailableError, SubagentExportError } from '../src/errors.mjs'

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const delay = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms))

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function snapshot(events, header = {}) {
  return { session: { id: 's', origin: 'main', delegationDepth: 0, ...header }, events }
}

function userEvent(seq, text = `用户 ${seq}`) {
  return { type: 'user/message', seq, time: seq, data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } }
}

function imageEvent(seq, ref) {
  return { type: 'user/message', seq, time: seq, data: { source: { kind: 'user' }, content: [{ type: 'image', attachment: ref }] } }
}

function makeExporter({
  events = [userEvent(1)],
  readSession,
  readImage,
  renderPdf = async () => PDF,
  hasCjkFont = async () => true,
  loadPageStyle = () => ({ text: 'body {}', version: 'v1' }),
  maxConcurrentRenders = 2,
  cacheMaxEntries,
  logError = () => {},
} = {}) {
  return createExporter({
    readSession: readSession ?? (async () => snapshot(events)),
    readImage,
    renderPdf,
    hasCjkFont,
    loadPageStyle,
    maxConcurrentRenders,
    ...(cacheMaxEntries === undefined ? {} : { cacheMaxEntries }),
    logError,
  })
}

test('同日志长度命中缓存，不重复渲染', async () => {
  let reads = 0
  let renders = 0
  const exporter = makeExporter({
    readSession: async () => {
      reads += 1
      return snapshot([userEvent(1)])
    },
    renderPdf: async () => {
      renders += 1
      return PDF
    },
  })
  const first = await exporter.exportSession('s')
  const second = await exporter.exportSession('s')
  assert.equal(first.kind, 'pdf')
  assert.deepEqual(first.bytes, PDF)
  assert.equal(second.bytes, first.bytes)
  assert.equal(renders, 1)
  assert.equal(reads, 2, '每次请求仍读取日志长度以判断过期')
})

test('日志增长后重新渲染并替换缓存', async () => {
  const events = [userEvent(1)]
  let renders = 0
  const exporter = makeExporter({
    events,
    readSession: async () => snapshot([...events]),
    renderPdf: async () => {
      renders += 1
      return new Uint8Array([...PDF, renders])
    },
  })
  const first = await exporter.exportSession('s')
  events.push(userEvent(2))
  const second = await exporter.exportSession('s')
  const third = await exporter.exportSession('s')
  assert.equal(renders, 2)
  assert.notDeepEqual(first.bytes, second.bytes)
  assert.deepEqual(third.bytes, second.bytes)
})

test('不同 include 使用独立缓存与渲染，默认最简不含工具行', async () => {
  const events = [
    userEvent(1),
    { type: 'tool/call', seq: 2, time: 2, data: { name: 'bash', arguments: '{"command":"echo 1"}' } },
  ]
  let renders = 0
  const htmls = []
  const exporter = makeExporter({
    events,
    renderPdf: async (html) => {
      renders += 1
      htmls.push(html)
      return new Uint8Array([...PDF, renders])
    },
  })
  const minimal = await exporter.exportSession('s')
  const minimalAgain = await exporter.exportSession('s')
  const tools = await exporter.exportSession('s', ['tools'])
  const toolsAgain = await exporter.exportSession('s', ['tools'])
  assert.equal(renders, 2, '默认选择与 tools 选择各渲染一次，同选择命中缓存')
  assert.equal(minimal.kind, 'pdf')
  assert.deepEqual(minimalAgain.bytes, minimal.bytes)
  assert.deepEqual(toolsAgain.bytes, tools.bytes)
  assert.notDeepEqual(tools.bytes, minimal.bytes)
  assert.ok(!htmls[0].includes('工具调用'), '默认最简不得包含工具行')
  assert.ok(htmls[1].includes('工具调用'), '勾选 tools 后包含工具行')
})

test('同会话并发请求合并为一次渲染', async () => {
  const gate = deferred()
  let renders = 0
  let reads = 0
  const exporter = makeExporter({
    readSession: async () => {
      reads += 1
      return snapshot([userEvent(1)])
    },
    renderPdf: async () => {
      renders += 1
      return gate.promise
    },
  })
  const first = exporter.exportSession('s')
  const second = exporter.exportSession('s')
  await delay()
  assert.equal(renders, 1, '两个并发请求只启动一个渲染')
  gate.resolve(PDF)
  const results = await Promise.all([first, second])
  assert.deepEqual(results[0].bytes, PDF)
  assert.deepEqual(results[1].bytes, PDF)
  assert.equal(renders, 1)
  assert.equal(reads, 3, '等待者复用结果后重读日志长度（两个请求各读一次，等待者再核对一次）')
})

test('跨会话渲染受并发上限约束，超出排队', async () => {
  const gates = [deferred(), deferred()]
  let started = 0
  let active = 0
  let peak = 0
  const exporter = makeExporter({
    maxConcurrentRenders: 1,
    readSession: async () => snapshot([userEvent(1)]),
    renderPdf: async () => {
      const index = started
      started += 1
      active += 1
      peak = Math.max(peak, active)
      await gates[index].promise
      active -= 1
      return PDF
    },
  })
  const first = exporter.exportSession('a')
  const second = exporter.exportSession('b')
  await delay()
  assert.equal(started, 1, '并发上限 1 时第二个会话排队')
  assert.equal(peak, 1)
  gates[0].resolve()
  await delay()
  assert.equal(started, 2)
  gates[1].resolve()
  await Promise.all([first, second])
  assert.equal(peak, 1)
})

test('空转录返回空态，不探测字体也不启动渲染', async () => {
  let fonts = 0
  let renders = 0
  const exporter = makeExporter({
    events: [{ type: 'user/message', seq: 1, time: 1, data: { source: { kind: 'runtime-context' }, content: [{ type: 'text', text: '注入' }] } }],
    hasCjkFont: async () => {
      fonts += 1
      return true
    },
    renderPdf: async () => {
      renders += 1
      return PDF
    },
  })
  const first = await exporter.exportSession('s')
  const second = await exporter.exportSession('s')
  assert.deepEqual(first, { kind: 'empty' })
  assert.deepEqual(second, { kind: 'empty' })
  assert.equal(fonts, 0)
  assert.equal(renders, 0)
})

test('只有工具调用的会话默认被过滤为空，选 tools 才渲染', async () => {
  let fonts = 0
  let renders = 0
  const exporter = makeExporter({
    events: [{ type: 'tool/call', seq: 1, time: 1, data: { name: 'bash', arguments: '{}' } }],
    hasCjkFont: async () => {
      fonts += 1
      return true
    },
    renderPdf: async () => {
      renders += 1
      return PDF
    },
  })
  assert.deepEqual(await exporter.exportSession('s'), { kind: 'empty' })
  assert.equal(fonts, 0)
  assert.equal(renders, 0)
  const withTools = await exporter.exportSession('s', ['tools'])
  assert.equal(withTools.kind, 'pdf')
  assert.equal(fonts, 1)
  assert.equal(renders, 1)
})

test('同会话不同选择并行渲染，按选择各自缓存', async () => {
  const gates = [deferred(), deferred()]
  let started = 0
  const exporter = makeExporter({
    events: [
      userEvent(1),
      { type: 'tool/call', seq: 2, time: 2, data: { name: 'bash', arguments: '{}' } },
    ],
    maxConcurrentRenders: 2,
    renderPdf: async () => {
      const index = started
      started += 1
      await gates[index].promise
      return PDF
    },
  })
  const minimal = exporter.exportSession('s')
  const tools = exporter.exportSession('s', ['tools'])
  await delay()
  assert.equal(started, 2, '不同选择不共用单飞键，可并行启动')
  gates[0].resolve()
  gates[1].resolve()
  const results = await Promise.all([minimal, tools])
  assert.equal(results[0].kind, 'pdf')
  assert.equal(results[1].kind, 'pdf')
})

test('缺少中文字体时在渲染前失败', async () => {
  let renders = 0
  const exporter = makeExporter({
    hasCjkFont: async () => false,
    renderPdf: async () => {
      renders += 1
      return PDF
    },
  })
  await assert.rejects(exporter.exportSession('s'), FontUnavailableError)
  assert.equal(renders, 0)
})

test('子会话在读取后、渲染前被拒绝', async () => {
  let renders = 0
  const exporter = makeExporter({
    readSession: async () => snapshot([userEvent(1)], { origin: 'subagent', delegationDepth: 1 }),
    renderPdf: async () => {
      renders += 1
      return PDF
    },
  })
  await assert.rejects(exporter.exportSession('s'), SubagentExportError)
  assert.equal(renders, 0)
})

test('fork 会话有 parentSession 但 delegationDepth 为 0，允许导出', async () => {
  const exporter = makeExporter({
    readSession: async () => snapshot([userEvent(1)], { parentSession: { id: 'session-parent' }, delegationDepth: 0 }),
  })
  const result = await exporter.exportSession('s')
  assert.equal(result.kind, 'pdf')
})

test('日志读取失败映射为会话不可用并记录原因', async () => {
  const logged = []
  const exporter = makeExporter({
    readSession: async () => {
      throw Object.assign(new Error('boom'), { code: 'SESSION_QUERY_SESSION_NOT_FOUND' })
    },
    logError: (message, error) => logged.push([message, error]),
  })
  await assert.rejects(exporter.exportSession('s'), SessionUnavailableError)
  assert.equal(logged.length, 1)
  assert.match(logged[0][0], /读取会话 s 失败/)
})

test('渲染失败不缓存，下一次请求重试', async () => {
  let renders = 0
  const exporter = makeExporter({
    renderPdf: async () => {
      renders += 1
      if (renders === 1) throw new RenderFailedError('boom')
      return PDF
    },
  })
  await assert.rejects(exporter.exportSession('s'), RenderFailedError)
  const second = await exporter.exportSession('s')
  assert.equal(second.kind, 'pdf')
  assert.equal(renders, 2)
})

test('缓存按条数上限淘汰最久未使用结果', async () => {
  let renders = 0
  const exporter = createExporter({
    readSession: async (sessionId) => snapshot([userEvent(1, sessionId)]),
    renderPdf: async () => {
      renders += 1
      return PDF
    },
    hasCjkFont: async () => true,
    loadPageStyle: () => ({ text: 'body {}', version: 'v1' }),
    cacheMaxEntries: 1,
  })
  await exporter.exportSession('a')
  await exporter.exportSession('b')
  await exporter.exportSession('a')
  assert.equal(renders, 3, '容量 1 时 a 的缓存已被 b 淘汰')
})

test('页面样式版本变化使缓存失效并重渲染', async () => {
  let renders = 0
  let version = 'v1'
  const exporter = createExporter({
    readSession: async () => snapshot([userEvent(1)]),
    renderPdf: async () => {
      renders += 1
      return PDF
    },
    hasCjkFont: async () => true,
    loadPageStyle: () => ({ text: 'body {}', version }),
  })
  await exporter.exportSession('s')
  await exporter.exportSession('s')
  assert.equal(renders, 1, '样式版本不变时命中缓存')
  version = 'v2'
  await exporter.exportSession('s')
  assert.equal(renders, 2, '样式版本变化后重新渲染')
})

test('页面样式不可读映射为渲染失败', async () => {
  const exporter = createExporter({
    readSession: async () => snapshot([userEvent(1)]),
    renderPdf: async () => PDF,
    hasCjkFont: async () => true,
    loadPageStyle: () => {
      throw new Error('样式表缺失')
    },
  })
  await assert.rejects(exporter.exportSession('s'), RenderFailedError)
})

test('依赖缺失在创建期报错', () => {
  assert.throws(() => createExporter({}), /readSession/)
  assert.throws(() => createExporter({ readSession: async () => snapshot([]) }), /renderPdf/)
  assert.throws(() => createExporter({ readSession: async () => snapshot([]), renderPdf: async () => PDF }), /hasCjkFont/)
  assert.throws(
    () => createExporter({ readSession: async () => snapshot([]), renderPdf: async () => PDF, hasCjkFont: async () => true }),
    /loadPageStyle/,
  )
})
const IMAGE_REF = { attachmentId: 'sha256:img', mediaType: 'image/png', bytes: 4 }
const IMAGE_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

test('图片三模式独立缓存：占位不读图，嵌入读图，失败回退占位', async () => {
  const events = [userEvent(1, '看图'), imageEvent(2, IMAGE_REF), userEvent(3, '后续')]
  let reads = 0
  let renders = 0
  const htmls = []
  const exporter = makeExporter({
    events,
    readImage: async () => {
      reads += 1
      return { data: IMAGE_BYTES, ref: IMAGE_REF }
    },
    renderPdf: async (html) => {
      renders += 1
      htmls.push(html)
      return PDF
    },
  })

  const placeholder = await exporter.exportSession('s')
  assert.equal(placeholder.kind, 'pdf')
  assert.equal(reads, 0, '占位模式不读取附件')
  assert.ok(htmls[0].includes('[图片]'))
  assert.ok(!htmls[0].includes('data:image/png;base64'))

  const embed = await exporter.exportSession('s', [], 'embed')
  const embedAgain = await exporter.exportSession('s', [], 'embed')
  assert.equal(embed.kind, 'pdf')
  assert.equal(reads, 1, '同模式命中缓存不重复读图')
  assert.ok(htmls[1].includes('data:image/png;base64'))
  assert.ok(!htmls[1].includes('[图片]'))
  assert.deepEqual(embedAgain.bytes, embed.bytes)
  assert.equal(renders, 2, '占位与嵌入各渲染一次')

  const none = await exporter.exportSession('s', [], 'none')
  assert.equal(none.kind, 'pdf')
  assert.ok(!htmls[2].includes('data:image/png;base64'))
  assert.ok(!htmls[2].includes('[图片]'), '不导出模式省略图片占位')
  assert.equal(reads, 1)
})

test('嵌入图片读取失败回退占位，不中断整份导出', async () => {
  const logs = []
  const exporter = makeExporter({
    events: [userEvent(1, '前文'), imageEvent(2, IMAGE_REF), userEvent(3, '后文')],
    readImage: async () => {
      throw new Error('附件损坏')
    },
    renderPdf: async (html) => {
      assert.ok(html.includes('[图片]'))
      assert.ok(html.includes('前文'))
      assert.ok(html.includes('后文'))
      return PDF
    },
    logError: (message) => logs.push(message),
  })
  assert.equal((await exporter.exportSession('s', [], 'embed')).kind, 'pdf')
  assert.ok(logs.some((message) => message.includes('图片')))
})

test('纯图片消息在 none 模式折叠为空，不启动渲染', async () => {
  let renders = 0
  const exporter = makeExporter({
    events: [imageEvent(1, IMAGE_REF)],
    readImage: async () => ({ data: IMAGE_BYTES, ref: IMAGE_REF }),
    renderPdf: async () => {
      renders += 1
      return PDF
    },
  })
  assert.deepEqual(await exporter.exportSession('s', [], 'none'), { kind: 'empty' })
  assert.equal(renders, 0)
})
