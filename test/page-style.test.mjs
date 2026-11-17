import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { PAGE_STYLE_PATH, readPageStyle } from '../src/page-style.mjs'

async function withDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-page-style-'))
  try {
    return await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('样式表按内容取版本，同长度替换也能区分', () =>
  withDirectory(async (directory) => {
    const path = join(directory, 'style.css')
    await writeFile(path, 'body { color: #111111; }\n')
    const first = readPageStyle(path)
    assert.equal(first.text, 'body { color: #111111; }\n')
    assert.equal(typeof first.version, 'string')

    const second = readPageStyle(path)
    assert.equal(second.version, first.version, '内容不变时版本不变')

    await writeFile(path, 'body { color: #222222; }\n')
    const third = readPageStyle(path)
    assert.equal(third.text, 'body { color: #222222; }\n')
    assert.notEqual(third.version, first.version, '同长度内容替换后版本变化')
  }))

test('空样式表被拒绝', () =>
  withDirectory(async (directory) => {
    const path = join(directory, 'empty.css')
    await writeFile(path, '  \n')
    assert.throws(() => readPageStyle(path), /页面样式表 .* 为空/)
  }))

test('样式表不可读时报错并保留原因', () =>
  withDirectory(async (directory) => {
    assert.throws(() => readPageStyle(join(directory, 'missing.css')), /无法读取页面样式表/)
  }))

test('默认路径指向随包发布的样式表', () => {
  assert.ok(PAGE_STYLE_PATH.endsWith('page-style.css'))
  const style = readPageStyle()
  assert.match(style.text, /@page \{ size: A4; margin: 18mm 16mm; \}/)
})
