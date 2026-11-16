// 测试锚点: R-01-006/AC-02
import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { renderPdfWithBrowser } from '../src/chrome.mjs'
import { RenderFailedError } from '../src/errors.mjs'

const skipOnWindows = process.platform === 'win32' ? '依赖 POSIX shell 的假浏览器' : false

async function fakeBrowser(source) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-pdf-browser-test-'))
  const path = join(directory, 'fake-browser.sh')
  await writeFile(path, `#!/bin/sh\n${source}\n`, 'utf8')
  await chmod(path, 0o755)
  return { directory, path }
}

test('浏览器超时被终止并报渲染超时', { skip: skipOnWindows }, async () => {
  const fake = await fakeBrowser('sleep 5')
  const started = Date.now()
  try {
    await assert.rejects(
      renderPdfWithBrowser({ html: '<p>超时探针</p>', browserPath: fake.path, timeoutMs: 200 }),
      (error) => error instanceof RenderFailedError && error.message.includes('超时'),
    )
    assert.ok(Date.now() - started < 3_000, '超时后应立即终止，不等待假浏览器自然退出')
  } finally {
    await rm(fake.directory, { recursive: true, force: true })
  }
})

test('浏览器产出非 PDF 字节时拒绝交付', { skip: skipOnWindows }, async () => {
  const fake = await fakeBrowser(
    'for arg in "$@"; do case "$arg" in --print-to-pdf=*) out="${arg#--print-to-pdf=}" ;; esac; done\nprintf "not a pdf" > "$out"',
  )
  try {
    await assert.rejects(
      renderPdfWithBrowser({ html: '<p>垃圾产物探针</p>', browserPath: fake.path, timeoutMs: 5_000 }),
      (error) => error instanceof RenderFailedError && error.message.includes('不是 PDF'),
    )
  } finally {
    await rm(fake.directory, { recursive: true, force: true })
  }
})

test('浏览器未产出文件时拒绝交付', { skip: skipOnWindows }, async () => {
  const fake = await fakeBrowser('exit 0')
  try {
    await assert.rejects(
      renderPdfWithBrowser({ html: '<p>空产物探针</p>', browserPath: fake.path, timeoutMs: 5_000 }),
      (error) => error instanceof RenderFailedError && error.message.includes('未产出'),
    )
  } finally {
    await rm(fake.directory, { recursive: true, force: true })
  }
})
