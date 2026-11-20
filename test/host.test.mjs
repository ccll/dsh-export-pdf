// 测试锚点: R-01-012/AC-07
// 宿主插件把路由注册到 Connection 的 /api fetch 注册表：鉴权与 Host/Origin
// 栅栏由宿主该通道统一施加，插件只在该边界内做参数与导出编排。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply, createLocalImageReader, inject, name } from '../src/host.mjs'
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

test('本地图片读取器经宿主文件服务解析路径、按附件上限读取', async () => {
  const calls = []
  const target = { targetKey: '/tmp/a.png' }
  const fs = {
    lstat: async (path, options) => {
      calls.push(['lstat', path, options])
      return { type: 'file', size: 4 }
    },
    resolve: async (path, options) => {
      calls.push(['resolve', path, options])
      return target
    },
    readBytes: async (value, signal, maxBytes) => {
      calls.push(['readBytes', value, signal, maxBytes])
      return new Uint8Array([1, 2, 3, 4])
    },
  }
  const read = createLocalImageReader({ getFs: () => fs, maxBytes: () => 1024 })
  assert.deepEqual(await read('/tmp/a.png', { cwd: '/work' }), new Uint8Array([1, 2, 3, 4]))
  assert.deepEqual(calls, [
    ['lstat', '/tmp/a.png', { cwd: '/work' }],
    ['resolve', '/tmp/a.png', { cwd: '/work' }],
    ['readBytes', target, undefined, 1024],
  ])
})

test('本地图片读取器在服务缺失、非文件、上限未配置与依赖缺失时明确失败', async () => {
  const readWithoutFs = createLocalImageReader({ getFs: () => undefined, maxBytes: () => 1024 })
  await assert.rejects(readWithoutFs('/tmp/a.png'), { message: /宿主文件服务不可用/, code: 'LOCAL_IMAGE_FS_UNAVAILABLE' })

  const readDirectory = createLocalImageReader({
    getFs: () => ({ lstat: async () => ({ type: 'directory' }), resolve: async () => ({ targetKey: 'd' }), readBytes: async () => new Uint8Array([1]) }),
    maxBytes: () => 1024,
  })
  await assert.rejects(readDirectory('/tmp'), /常规文件/)

  const readWithoutLimit = createLocalImageReader({
    getFs: () => ({ resolve: async () => ({ targetKey: 'f' }), lstat: async () => ({ type: 'file' }), readBytes: async () => new Uint8Array([1]) }),
    maxBytes: () => 0,
  })
  await assert.rejects(readWithoutLimit('/tmp/a.png'), { message: /大小上限/, code: 'LOCAL_IMAGE_LIMIT_MISSING' })

  assert.throws(() => createLocalImageReader({}), /getFs/)
  assert.throws(() => createLocalImageReader({ getFs: () => undefined }), /maxBytes/)
})

test('本地图片读取器拒绝最终符号链接，与聊天文件服务一致', async () => {
  const readSymlink = createLocalImageReader({
    getFs: () => ({ lstat: async () => ({ type: 'symlink' }), resolve: async () => ({ targetKey: 'link' }), readBytes: async () => new Uint8Array([1]) }),
    maxBytes: () => 1024,
  })
  await assert.rejects(readSymlink('/tmp/link.png'), { code: 'LOCAL_IMAGE_NOT_FILE', message: /常规文件/ })
})

test('本地图片读取器把宿主超限与空文件错误原样交给调用方', async () => {
  const readOversize = createLocalImageReader({
    getFs: () => ({
      lstat: async () => ({ type: 'file' }),
      resolve: async () => ({ targetKey: 'f' }),
      readBytes: async () => {
        throw Object.assign(new Error('file exceeds byte limit'), { code: 'FS_TOO_LARGE' })
      },
    }),
    maxBytes: () => 1024,
  })
  await assert.rejects(readOversize('/tmp/a.png'), { code: 'FS_TOO_LARGE' })

  const readEmpty = createLocalImageReader({
    getFs: () => ({ lstat: async () => ({ type: 'file' }), resolve: async () => ({ targetKey: 'f' }), readBytes: async () => new Uint8Array() }),
    maxBytes: () => 1024,
  })
  await assert.rejects(readEmpty('/tmp/a.png'), { code: 'LOCAL_IMAGE_EMPTY' })
})
