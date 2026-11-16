// 测试锚点: R-01-008/AC-01
// 宿主插件把路由注册到 Connection 的 /api fetch 注册表：鉴权与 Host/Origin
// 栅栏由宿主该通道统一施加，插件只在该边界内做参数与导出编排。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply, inject, name } from '../src/host.mjs'
import { SESSION_PDF_PATH } from '../src/route.mjs'

function fakeContext() {
  const routes = []
  const warnings = []
  return {
    routes,
    warnings,
    ctx: {
      logger: () => ({ warn: (message) => warnings.push(message) }),
      effect: (effect) => effect(),
      connection: { fetch: { register: (route) => { routes.push(route); return async () => {} } } },
      sessionQuery: {
        readSession: async () => ({
          session: { id: 'session-1b9b2ef9', origin: 'main', delegationDepth: 0 },
          events: [{ type: 'user/message', seq: 1, time: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '你好' }] } }],
        }),
      },
      attachments: {
        readImage: async () => ({ data: new Uint8Array([1]), ref: { attachmentId: 'sha256:img', mediaType: 'image/png', bytes: 1 } }),
      },
    },
  }
}

test('宿主插件注册 GET/HEAD /api/session.pdf 到鉴权通道', () => {
  const { ctx, routes } = fakeContext()
  assert.equal(name, 'dsh-export-pdf')
  assert.deepEqual(inject, ['connection', 'sessionQuery', 'attachments'])
  apply(ctx, {})
  assert.equal(routes.length, 1)
  assert.equal(routes[0].path, SESSION_PDF_PATH)
  assert.equal(routes[0].path, '/api/session.pdf')
  assert.deepEqual(routes[0].methods, ['GET', 'HEAD'])
  assert.equal(routes[0].requestBody, 'buffered')
  assert.equal(typeof routes[0].fetch, 'function')
})

test('宿主插件对非法配置在装载期失败', () => {
  const { ctx } = fakeContext()
  assert.throws(() => apply(ctx, { timeoutMs: 'soon' }), /timeoutMs/)
  assert.throws(() => apply(ctx, { maxConcurrentRenders: 0 }), /maxConcurrentRenders/)
})
