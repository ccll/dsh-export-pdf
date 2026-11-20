// 测试锚点: R-01-007/AC-02
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  PIPELINE_MODULES,
  createPipelineLoader,
  generatePipelineSource,
  pruneStalePipelineDirectories,
  stripModuleSyntax,
} from '../src/pipeline.mjs'

const SOURCE_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])

function userEvent(seq, text = `用户 ${seq}`) {
  return { type: 'user/message', seq, time: seq, data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } }
}

async function copyPipeline(destination) {
  for (const name of [...PIPELINE_MODULES, 'errors.mjs']) {
    await writeFile(join(destination, name), await readFile(join(SOURCE_DIRECTORY, name), 'utf8'))
  }
}

async function withDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-pipeline-'))
  try {
    return await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('拼接片段去掉 import 与 export，并注入错误类型', () => {
  const source = generatePipelineSource(
    [
      ['a.mjs', "import { x } from './x.mjs'\n\nexport const A = 1\n"],
      ['b.mjs', 'export function b() { return A }\n'],
    ],
    { errorsUrl: 'file:///tmp/errors.mjs' },
  )
  assert.ok(source.includes('import { PdfExportError'), '从静态 errors.mjs 注入错误类型')
  assert.ok(/export \{ escapeHtml,/.test(source), '末尾导出管线符号')
  assert.ok(!/^export\s+(?:const|function)/m.test(source), '声明前的 export 已去掉')
  assert.ok(!source.includes("from './x.mjs'"), '相对 import 已去掉')
  assert.match(source, /const A = 1/)
})

test('不支持的模块语法直接报错，不静默丢内容', () => {
  assert.throws(() => stripModuleSyntax('bad.mjs', 'export default 1\n'), /管线不支持的模块语法/)
  assert.throws(() => stripModuleSyntax('bad.mjs', 'export { a }\n'), /管线不支持的模块语法/)
})

test('从真实源码加载管线，渲染与导出可用', () =>
  withDirectory(async (directory) => {
    const pipeline = await createPipelineLoader({ directory: SOURCE_DIRECTORY, cacheDirectory: join(directory, 'cache') }).load()
    assert.equal(typeof pipeline.renderTranscriptHtml, 'function')
    assert.equal(typeof pipeline.createExporter, 'function')
    assert.deepEqual(pipeline.INCLUDE_TOKENS, ['tools', 'attachments'])

    const html = pipeline.renderTranscriptHtml([{ kind: 'user', text: '你好' }], 'body { color: #161616; }')
    assert.ok(html.includes('<style>body { color: #161616; }</style>'), '渲染使用传入的样式文本')
    assert.ok(html.includes('你好'))

    const exporter = pipeline.createExporter({
      readSession: async () => ({ session: { id: 's', origin: 'main', delegationDepth: 0 }, events: [userEvent(1)] }),
      renderPdf: async () => PDF,
      hasCjkFont: async () => true,
      loadPageStyle: () => ({ text: 'body {}', version: 'v1' }),
    })
    const result = await exporter.exportSession('s')
    assert.equal(result.kind, 'pdf')
    assert.deepEqual(result.bytes, PDF)
  }))

test('源码变化后重新加载并生效，内容不变时复用同一管线', () =>
  withDirectory(async (directory) => {
    const cacheDirectory = join(directory, 'cache')
    await copyPipeline(directory)
    const loader = createPipelineLoader({ directory, cacheDirectory })
    const first = await loader.load()
    const again = await loader.load()
    assert.equal(again, first, '源码内容不变时复用同一模块')
    assert.deepEqual(first.INCLUDE_TOKENS, ['tools', 'attachments'])

    const text = await readFile(join(directory, 'selection.mjs'), 'utf8')
    await writeFile(
      join(directory, 'selection.mjs'),
      text.replace("INCLUDE_TOKENS = ['tools', 'attachments']", "INCLUDE_TOKENS = ['tools', 'attachments', 'hot']"),
    )
    const second = await loader.load()
    assert.notEqual(second, first, '源码变化后加载新的模块')
    assert.deepEqual(second.INCLUDE_TOKENS, ['tools', 'attachments', 'hot'])
    assert.deepEqual(first.INCLUDE_TOKENS, ['tools', 'attachments'], '旧模块保持旧内容')
  }))

test('生成文件落在缓存目录，并发加载复用同一模块', () =>
  withDirectory(async (directory) => {
    const cacheDirectory = join(directory, 'cache')
    await copyPipeline(directory)
    const loader = createPipelineLoader({ directory, cacheDirectory })
    const [first, second] = await Promise.all([loader.load(), loader.load()])
    assert.equal(first, second, '并发加载复用同一模块')
    const files = await readdir(cacheDirectory)
    assert.ok(
      files.some((name) => /^pipeline-[0-9a-f]+\.mjs$/.test(name)),
      '生成模块写在缓存目录',
    )
  }))

test('新版本加载失败时沿用上一版并记录日志', () =>
  withDirectory(async (directory) => {
    const cacheDirectory = join(directory, 'cache')
    await copyPipeline(directory)
    const logged = []
    const loader = createPipelineLoader({ directory, cacheDirectory, logError: (message) => logged.push(message) })
    const good = await loader.load()

    const text = await readFile(join(directory, 'render.mjs'), 'utf8')
    await writeFile(join(directory, 'render.mjs'), `${text}\nthis is not javascript\n`)

    const api = await loader.load()
    assert.equal(api, good, '沿用上一版管线')
    assert.equal(logged.length, 1, '失败原因写入日志')
  }))

test('源码读取失败时沿用上一版并记录日志', () =>
  withDirectory(async (directory) => {
    const cacheDirectory = join(directory, 'cache')
    await copyPipeline(directory)
    const logged = []
    const loader = createPipelineLoader({ directory, cacheDirectory, logError: (message) => logged.push(message) })
    const good = await loader.load()

    await rm(join(directory, 'images.mjs'))
    const api = await loader.load()
    assert.equal(api, good, '读源码失败时沿用上一版')
    assert.equal(logged.length, 1, '失败原因写入日志')
  }))

test('管线语法不支持时沿用上一版而不是抛给调用方', () =>
  withDirectory(async (directory) => {
    const cacheDirectory = join(directory, 'cache')
    await copyPipeline(directory)
    const logged = []
    const loader = createPipelineLoader({ directory, cacheDirectory, logError: (message) => logged.push(message) })
    const good = await loader.load()

    const text = await readFile(join(directory, 'render.mjs'), 'utf8')
    await writeFile(join(directory, 'render.mjs'), `${text}\nexport default 1\n`)
    const api = await loader.load()
    assert.equal(api, good, '生成失败时沿用上一版')
    assert.equal(logged.length, 1, '失败原因写入日志')
  }))

test('首次加载就失败时把错误抛给调用方', () =>
  withDirectory(async (directory) => {
    await copyPipeline(directory)
    await writeFile(join(directory, 'markdown.mjs'), 'export function renderMarkdown( { }\n')
    await assert.rejects(
      createPipelineLoader({ directory, cacheDirectory: join(directory, 'cache') }).load(),
      /渲染管线加载失败/,
    )
  }))

test('默认管线缓存使用随机私有目录，dispose 删除目录', async () => {
  const loader = createPipelineLoader({ directory: SOURCE_DIRECTORY })
  const directory = await loader.cacheDirectory()
  assert.match(basename(directory), new RegExp(`^dsh-export-pdf-${process.pid}-`))
  assert.notEqual(directory, join(tmpdir(), 'dsh-export-pdf', `pid-${process.pid}`))
  const stats = await stat(directory)
  if (process.platform !== 'win32') assert.equal(stats.mode & 0o777, 0o700, '私有目录权限应为 0700')
  const api = await loader.load()
  assert.equal(typeof api.createExporter, 'function')
  await loader.dispose()
  await assert.rejects(stat(directory), { code: 'ENOENT' })
})

test('两个加载器的默认缓存目录互不共用', async () => {
  const first = createPipelineLoader({ directory: SOURCE_DIRECTORY })
  const second = createPipelineLoader({ directory: SOURCE_DIRECTORY })
  try {
    const [firstDirectory, secondDirectory] = await Promise.all([first.cacheDirectory(), second.cacheDirectory()])
    assert.notEqual(firstDirectory, secondDirectory)
  } finally {
    await first.dispose()
    await second.dispose()
  }
})

test('启动清理只删除超过 24 小时且进程已不存在的旧目录', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-pipeline-sweep-'))
  try {
    const stale = join(base, 'dsh-export-pdf-424242-stale')
    const live = join(base, 'dsh-export-pdf-424243-live')
    const legacy = join(base, 'dsh-export-pdf', 'pid-424244')
    await mkdir(stale)
    await mkdir(live)
    await mkdir(legacy, { recursive: true })
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000)
    await utimes(stale, old, old)
    await utimes(live, old, old)
    await utimes(legacy, old, old)

    const result = await pruneStalePipelineDirectories({
      baseDirectory: base,
      now: Date.now(),
      isAlive: (pid) => pid === 424243,
    })
    assert.equal(result.removed, 2, '删除死亡进程的私有目录与旧版 pid 目录')
    await assert.rejects(stat(stale), { code: 'ENOENT' })
    await assert.rejects(stat(legacy), { code: 'ENOENT' })
    await stat(live)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})


test('创建加载器本身不产生缓存目录', async () => {
  const prefix = `dsh-export-pdf-${process.pid}-`
  const before = new Set((await readdir(tmpdir())).filter((name) => name.startsWith(prefix)))
  const loader = createPipelineLoader({ directory: SOURCE_DIRECTORY })
  const afterCreate = new Set((await readdir(tmpdir())).filter((name) => name.startsWith(prefix)))
  assert.deepEqual(afterCreate, before, '只创建加载器不应产生导出缓存目录')
  const directory = await loader.cacheDirectory()
  assert.equal(directory.startsWith(join(tmpdir(), prefix)), true)
  await loader.dispose()
})
