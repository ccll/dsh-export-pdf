import assert from 'node:assert/strict'
import { copyFile, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { PIPELINE_MODULES, createPipelineLoader } from '../src/pipeline.mjs'
import { readPageStyle } from '../src/page-style.mjs'

const SOURCE_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])

function userEvent(seq, text = `用户 ${seq}`) {
  return { type: 'user/message', seq, time: seq, data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } }
}

/**
 * 与 `src/host.mjs` 相同的装配：管线换版就重建编排器，样式每次导出读取。
 * 这里用假的 renderPdf 收集 HTML，所以不依赖浏览器；真实 HTTP 装配由 e2e 覆盖。
 */
function createAssembly({ directory, stylePath }) {
  const loader = createPipelineLoader({ directory })
  const rendered = []
  let active = null

  const exportOnce = async () => {
    const pipeline = await loader.load()
    if (active === null || active.pipeline !== pipeline) {
      active = {
        pipeline,
        exporter: pipeline.createExporter({
          readSession: async () => ({ session: { id: 's', origin: 'main', delegationDepth: 0 }, events: [userEvent(1)] }),
          renderPdf: async (html) => {
            rendered.push(html)
            return PDF
          },
          hasCjkFont: async () => true,
          loadPageStyle: () => readPageStyle(stylePath),
        }),
      }
    }
    const result = await active.exporter.exportSession('s')
    assert.equal(result.kind, 'pdf')
    return { html: rendered.at(-1), renders: rendered.length }
  }

  return { exportOnce }
}

async function withAssembly(run) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-hot-reload-'))
  try {
    for (const name of await readdir(SOURCE_DIRECTORY)) {
      await copyFile(join(SOURCE_DIRECTORY, name), join(directory, name))
    }
    const stylePath = join(directory, 'page-style.css')
    await copyFile(join(SOURCE_DIRECTORY, 'page-style.css'), stylePath)
    return await run({ directory, stylePath })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('改样式表后下一次导出重新渲染并使用新样式', () =>
  withAssembly(async ({ directory, stylePath }) => {
    const assembly = createAssembly({ directory, stylePath })

    const first = await assembly.exportOnce()
    assert.ok(first.html.includes('@page { size: A4; margin: 18mm 16mm; }'), '首次导出使用样式表')
    assert.equal(first.renders, 1)

    const style = await readFile(stylePath, 'utf8')
    await writeFile(stylePath, `${style}\nbody { color: #3355ff; }\n`)

    const second = await assembly.exportOnce()
    assert.ok(second.html.includes('#3355ff'), '新样式进入渲染结果')
    assert.equal(second.renders, 2, '样式版本变化使缓存失效并重新渲染')
  }))

test('改渲染模块后下一次导出直接使用新代码', () =>
  withAssembly(async ({ directory, stylePath }) => {
    const assembly = createAssembly({ directory, stylePath })
    await assembly.exportOnce()

    const renderSource = await readFile(join(directory, 'render.mjs'), 'utf8')
    await writeFile(join(directory, 'render.mjs'), renderSource.replace('<span>用户</span>', '<span>用户HOT</span>'))

    const after = await assembly.exportOnce()
    assert.ok(after.html.includes('用户HOT'), '新模块的渲染结果生效')
    assert.equal(after.renders, 2, '管线换版重建编排器并重新渲染')
  }))

test('管线源码未变化时不重建编排器', () =>
  withAssembly(async ({ directory, stylePath }) => {
    const assembly = createAssembly({ directory, stylePath })
    const first = await assembly.exportOnce()
    const second = await assembly.exportOnce()
    assert.equal(second.renders, first.renders, '源码与样式都没变时命中缓存')
  }))

test('管线模块清单与样式表随包发布', async () => {
  const names = await readdir(SOURCE_DIRECTORY)
  for (const name of PIPELINE_MODULES) assert.ok(names.includes(name), `${name} 存在`)
  assert.ok(names.includes('page-style.css'), '样式表随 src/ 发布')
})
