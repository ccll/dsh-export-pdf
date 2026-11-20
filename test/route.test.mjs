// 测试锚点: R-01-003/AC-01 R-01-006/AC-01 R-01-006/AC-02 R-01-011/AC-02 R-01-011/AC-06
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SESSION_PDF_PATH, handlePdfRequest } from '../src/route.mjs'
import {
  BrowserUnavailableError,
  FontUnavailableError,
  RenderFailedError,
  SessionUnavailableError,
  SubagentExportError,
} from '../src/errors.mjs'

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const SESSION_ID = 'session-1b9b2ef9-13be-47a9-ac78-17248553017f'

function request(query = '', method = 'GET') {
  return new Request(`http://127.0.0.1:3080${SESSION_PDF_PATH}${query}`, { method })
}

function exporterReturning(result) {
  return { exportSession: async () => result }
}

function exporterThrowing(error) {
  return {
    exportSession: async () => {
      throw error
    },
  }
}

test('GET 成功返回 PDF 与 inline 文件名', async () => {
  const response = await handlePdfRequest(request(`?sessionId=${encodeURIComponent(SESSION_ID)}`), exporterReturning({ kind: 'pdf', bytes: PDF }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/pdf')
  assert.equal(response.headers.get('content-disposition'), 'inline; filename="dsh-session-1b9b2ef9.pdf"')
  assert.equal(response.headers.get('content-length'), String(PDF.byteLength))
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PDF)
})

test('注入的 helpers 决定词表与文件名', async () => {
  const helpers = {
    INCLUDE_TOKENS: ['hot'],
    IMAGE_MODES: ['none', 'placeholder', 'embed'],
    normalizeInclude: (value) => value,
    normalizeImageMode: (value) => value,
    pdfFilename: () => 'hot.pdf',
  }
  const ok = await handlePdfRequest(
    request(`?sessionId=${SESSION_ID}&include=hot`),
    exporterReturning({ kind: 'pdf', bytes: PDF }),
    { helpers },
  )
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('content-disposition'), 'inline; filename="hot.pdf"')

  const rejected = await handlePdfRequest(
    request(`?sessionId=${SESSION_ID}&include=tools`),
    exporterReturning({ kind: 'pdf', bytes: PDF }),
    { helpers },
  )
  assert.equal(rejected.status, 400, '注入词表之外的 token 被拒绝')
})

test('attachment 取 disposition 参数', async () => {
  const response = await handlePdfRequest(
    request(`?sessionId=${SESSION_ID}&disposition=attachment`),
    exporterReturning({ kind: 'pdf', bytes: PDF }),
  )
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="dsh-session-1b9b2ef9.pdf"')
})

test('HEAD 与 GET 状态码和响应头一致但没有正文', async () => {
  const response = await handlePdfRequest(request(`?sessionId=${SESSION_ID}`, 'HEAD'), exporterReturning({ kind: 'pdf', bytes: PDF }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/pdf')
  assert.equal(response.headers.get('content-disposition'), 'inline; filename="dsh-session-1b9b2ef9.pdf"')
  assert.equal(response.headers.get('content-length'), String(PDF.byteLength))
  assert.equal(await response.text(), '')
})

test('空转录返回 204 无正文', async () => {
  const response = await handlePdfRequest(request(`?sessionId=${SESSION_ID}`), exporterReturning({ kind: 'empty' }))
  assert.equal(response.status, 204)
  assert.equal(await response.text(), '')
  assert.equal(response.headers.get('content-type'), null)
  assert.equal(response.headers.get('cache-control'), 'no-store', '空态不可被浏览器缓存')
})

test('缺失或非法 sessionId 返回 400', async () => {
  for (const query of ['', '?sessionId=', '?sessionId=%20%20', '?sessionId=%20session-1b9b2ef9', `?sessionId=${'a'.repeat(201)}`, '?sessionId=%00', '?sessionId=%E4%BC%9A%E8%AF%9D', '?sessionId=a%22b']) {
    const response = await handlePdfRequest(request(query), exporterReturning({ kind: 'pdf', bytes: PDF }))
    assert.equal(response.status, 400, `query=${query}`)
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8')
    assert.match(await response.text(), /sessionId/)
  }
})

test('include 选择归一、文件名后缀与非法值 400', async () => {
  let seen
  const exporter = {
    exportSession: async (_sessionId, include) => {
      seen = include
      return { kind: 'pdf', bytes: PDF }
    },
  }
  const response = await handlePdfRequest(
    request(`?sessionId=${SESSION_ID}&include=attachments,tools`),
    exporter,
  )
  assert.equal(response.status, 200)
  assert.deepEqual(seen, ['tools', 'attachments'])
  assert.equal(response.headers.get('content-disposition'), 'inline; filename="dsh-session-1b9b2ef9-tools-attachments.pdf"')

  const toolsOnly = await handlePdfRequest(
    request(`?sessionId=${SESSION_ID}&include=tools`),
    exporterReturning({ kind: 'pdf', bytes: PDF }),
  )
  assert.equal(toolsOnly.headers.get('content-disposition'), 'inline; filename="dsh-session-1b9b2ef9-tools.pdf"')

  const emptyInclude = await handlePdfRequest(
    request(`?sessionId=${SESSION_ID}&include=`),
    exporterReturning({ kind: 'pdf', bytes: PDF }),
  )
  assert.equal(emptyInclude.status, 200, 'include= 空串等同缺省选择')
  assert.equal(emptyInclude.headers.get('content-disposition'), 'inline; filename="dsh-session-1b9b2ef9.pdf"')

  for (const include of ['unknown', 'tools,tools', 'tools,', 'tools&include=attachments']) {
    const invalid = await handlePdfRequest(
      request(`?sessionId=${SESSION_ID}&include=${encodeURIComponent(include)}`),
      exporterReturning({ kind: 'pdf', bytes: PDF }),
    )
    assert.equal(invalid.status, 400, `include=${include}`)
    assert.match(await invalid.text(), /include/)
  }
  assert.deepEqual(seen, ['tools', 'attachments'], '非法请求不得再次调用导出器')
})

test('非法 disposition 返回 400', async () => {
  const response = await handlePdfRequest(
    request(`?sessionId=${SESSION_ID}&disposition=download`),
    exporterReturning({ kind: 'pdf', bytes: PDF }),
  )
  assert.equal(response.status, 400)
  assert.match(await response.text(), /disposition/)
})

test('handler 防御：非 GET/HEAD 返回 405 与 Allow（宿主当前不转发）', async () => {
  const response = await handlePdfRequest(request(`?sessionId=${SESSION_ID}`, 'POST'), exporterReturning({ kind: 'pdf', bytes: PDF }))
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('allow'), 'GET, HEAD')
})

test('失败类型映射到契约状态码且只回简要原因', async () => {
  const cases = [
    [new SessionUnavailableError(), 404, /会话不存在/, 'session'],
    [new SubagentExportError(), 400, /子会话/, 'subagent'],
    [new FontUnavailableError(), 503, /中文字体/, 'font'],
    [new BrowserUnavailableError(), 503, /浏览器/, 'browser'],
    [new RenderFailedError('渲染失败', { detail: '/secret/tmp/session.html' }), 500, /渲染失败/, 'render'],
    [new Error('unexpected /secret/path'), 500, /导出失败/, 'internal'],
  ]
  for (const [error, status, pattern, code] of cases) {
    const response = await handlePdfRequest(request(`?sessionId=${SESSION_ID}`), exporterThrowing(error))
    assert.equal(response.status, status)
    assert.equal(response.headers.get('x-dsh-export-error'), code)
    const body = await response.text()
    assert.match(body, pattern)
    assert.ok(!body.includes('/secret'), '错误响应不得回显路径或细节')
  }
  assert.equal(
    (await handlePdfRequest(request(`?sessionId=${SESSION_ID}`), exporterReturning({ kind: 'pdf', bytes: PDF }))).headers.get('x-dsh-export-error'),
    null,
    '成功响应不带错误码',
  )
})

test('HEAD 错误响应没有正文但保留状态码与错误码', async () => {
  const response = await handlePdfRequest(request(`?sessionId=${SESSION_ID}`, 'HEAD'), exporterThrowing(new SessionUnavailableError()))
  assert.equal(response.status, 404)
  assert.equal(response.headers.get('x-dsh-export-error'), 'session')
  assert.equal(await response.text(), '')
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8')
})
test('image 模式缺省占位、合法归一、文件名后缀与非法值 400', async () => {
  let seen
  const exporter = {
    exportSession: async (_sessionId, include, imageMode) => {
      seen = { include, imageMode }
      return { kind: 'pdf', bytes: PDF }
    },
  }
  const base = `?sessionId=${SESSION_ID}`

  const placeholder = await handlePdfRequest(request(base), exporter)
  assert.deepEqual(seen, { include: [], imageMode: 'placeholder' })
  assert.equal(placeholder.headers.get('content-disposition'), 'inline; filename="dsh-session-1b9b2ef9.pdf"')

  const empty = await handlePdfRequest(request(`${base}&image=`), exporter)
  assert.equal(empty.status, 200, 'image= 空串等同缺省占位')
  assert.equal(seen.imageMode, 'placeholder')

  const embed = await handlePdfRequest(request(`${base}&image=embed&include=tools`), exporter)
  assert.deepEqual(seen, { include: ['tools'], imageMode: 'embed' })
  assert.equal(embed.headers.get('content-disposition'), 'inline; filename="dsh-session-1b9b2ef9-tools-images.pdf"')

  const none = await handlePdfRequest(request(`${base}&image=none`), exporter)
  assert.equal(none.headers.get('content-disposition'), 'inline; filename="dsh-session-1b9b2ef9-no-images.pdf"')

  for (const image of ['unknown', 'embed&image=none']) {
    const invalid = await handlePdfRequest(request(`${base}&image=${image}`), exporterReturning({ kind: 'pdf', bytes: PDF }))
    assert.equal(invalid.status, 400, `image=${image}`)
    assert.match(await invalid.text(), /image/)
  }
  assert.deepEqual(seen, { include: [], imageMode: 'none' }, '非法 image 不得再次调用导出器')
})

test('导出结果形状非法时返回 500 render，而不是把异常抛给宿主', async () => {
  for (const result of [null, { kind: 'pdf', bytes: 'not-bytes' }, { kind: 'pdf', bytes: new Uint8Array() }, { kind: 'unknown' }]) {
    const response = await handlePdfRequest(request(`?sessionId=${SESSION_ID}`), { exportSession: async () => result })
    assert.equal(response.status, 500)
    assert.equal(response.headers.get('x-dsh-export-error'), 'render')
  }
})
