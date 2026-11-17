import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { PIPELINE_MODULES, createPipelineLoader, generatePipelineSource, stripModuleSyntax } from '../src/pipeline.mjs'

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
