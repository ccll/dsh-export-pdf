// 测试锚点: R-01-001/AC-03 R-01-002/AC-02 R-01-011/AC-04 R-01-011/AC-05
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY_TEXT, FILTERED_EMPTY_TEXT, classifyExportResponse, initialViewState, messageForErrorCode, messageForStatus, pdfRouteUrl, viewNoticeText } from '../src/view-state.mjs'

const BASE = 'http://127.0.0.1:3080/'

test('导出地址按 document base 解析并编码会话标识', () => {
  assert.equal(
    pdfRouteUrl('session-1b9b2ef9-13be-47a9-ac78-17248553017f', { base: BASE }),
    'http://127.0.0.1:3080/api/session.pdf?sessionId=session-1b9b2ef9-13be-47a9-ac78-17248553017f&disposition=inline',
  )
  assert.equal(
    pdfRouteUrl('a b', { base: 'http://127.0.0.1:3080/dsh/', disposition: 'attachment' }),
    'http://127.0.0.1:3080/dsh/api/session.pdf?sessionId=a%20b&disposition=attachment',
  )
  assert.equal(
    pdfRouteUrl('s', { base: BASE, include: ['tools'] }),
    'http://127.0.0.1:3080/api/session.pdf?sessionId=s&disposition=inline&include=tools',
  )
  assert.equal(
    pdfRouteUrl('s', { base: BASE, include: ['attachments', 'tools'] }),
    'http://127.0.0.1:3080/api/session.pdf?sessionId=s&disposition=inline&include=tools%2Cattachments',
  )
})

test('空会话首次渲染直接进入空态，避免发起导出请求', () => {
  assert.deepEqual(initialViewState(true), { kind: 'empty' })
  assert.deepEqual(initialViewState(false), { kind: 'loading' })
  assert.deepEqual(initialViewState(undefined), { kind: 'loading' })
  // 视图主体用同一映射渲染空态文案；宿主渲染该页时必须看得到说明。
  assert.equal(viewNoticeText(initialViewState(true)), EMPTY_TEXT)
  assert.match(EMPTY_TEXT, /没有.*内容/)
  assert.equal(viewNoticeText({ kind: 'empty', message: FILTERED_EMPTY_TEXT }), FILTERED_EMPTY_TEXT)
  assert.match(FILTERED_EMPTY_TEXT, /当前选择/)
})

test('HEAD 无正文时按错误机器码显示具体原因', () => {
  assert.deepEqual(classifyExportResponse(503, '', 'browser'), { kind: 'error', message: '没有可用的浏览器，无法导出 PDF' })
  assert.deepEqual(classifyExportResponse(503, '', 'font'), { kind: 'error', message: '缺少可用的中文字体，无法导出' })
  assert.deepEqual(classifyExportResponse(500, '', 'render'), { kind: 'error', message: 'PDF 渲染失败' })
  // GET 有正文时仍以正文为准。
  assert.deepEqual(classifyExportResponse(503, '宿主自定义原因\n', 'font'), { kind: 'error', message: '宿主自定义原因' })
  assert.equal(messageForErrorCode('nope'), undefined)
  assert.equal(messageForStatus(503, '', null), '导出服务当前不可用')
})

test('响应状态分类为就绪、空态与失败', () => {
  assert.deepEqual(classifyExportResponse(200, ''), { kind: 'ready' })
  assert.deepEqual(classifyExportResponse(204, ''), { kind: 'empty', message: FILTERED_EMPTY_TEXT })
  assert.deepEqual(classifyExportResponse(404, '会话不存在或日志不可读\n'), { kind: 'error', message: '会话不存在或日志不可读' })
  assert.deepEqual(classifyExportResponse(500, ''), { kind: 'error', message: 'PDF 渲染失败' })
  assert.deepEqual(classifyExportResponse(418, ''), { kind: 'error', message: '导出服务返回了意外结果（HTTP 418）' })
})

test('失败文案不把 HTML 错误页当正文显示', () => {
  assert.equal(messageForStatus(503, '<html>bad gateway</html>'), '导出服务当前不可用')
  assert.equal(messageForStatus(400, '  '), '导出请求参数无效')
  assert.equal(messageForStatus(401, ''), '导出服务返回了意外结果（HTTP 401）')
})
