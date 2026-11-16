// e2e 运行器：每个 spec 使用一套隔离环境（临时 $DSH_HOME + mock LLM + 随机端口），
// 顺序执行；失败时截图并打印 dsh web stderr 尾部。浏览器用宿主机 Chrome，
// 不下载 Playwright 自带浏览器。
import { access } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
import { bootE2e } from './boot.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'
const specDirectory = join(here, 'specs')
const requested = new Set(process.argv.slice(2).map((name) => (name.endsWith('.mjs') ? name : `${name}.mjs`)))
const allSpecs = (await readdir(specDirectory)).filter((name) => name.endsWith('.mjs')).sort()
const specs = requested.size === 0 ? allSpecs : allSpecs.filter((name) => requested.has(name))
if (specs.length === 0 || (requested.size > 0 && specs.length !== requested.size)) {
  console.error(`e2e: 找不到请求的 spec（可用：${allSpecs.join(', ')}）`)
  process.exit(1)
}

try {
  await access(chromePath)
} catch {
  console.error(`e2e: SKIP 全部 spec（找不到浏览器 ${chromePath}；可用 CHROME_PATH 指定）`)
  process.exit(process.env.CI ? 1 : 0)
}

let failed = 0
for (const name of specs) {
  const start = Date.now()
  let environment
  let browser
  let page
  try {
    const specModule = await import(pathToFileURL(join(specDirectory, name)).href)
    environment = await bootE2e(specModule.boot)
    browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
    page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
    await specModule.default({ page, url: environment.url, home: environment.home, mock: environment.mock, assert: (await import('node:assert/strict')).default })
    console.error(`e2e: PASS ${name}（${Date.now() - start}ms）`)
  } catch (error) {
    failed += 1
    console.error(`e2e: FAIL ${name}\n${error?.stack ?? error}`)
    if (page !== undefined) await page.screenshot({ path: join(here, `fail-${name}.png`) }).catch(() => {})
    if (environment?.webStderr.length > 0) console.error(`e2e: dsh web stderr 尾部：\n${environment.webStderr.slice(-15).join('')}`)
  } finally {
    await page?.close().catch(() => {})
    await browser?.close().catch(() => {})
    await environment?.cleanup().catch((error) => {
      failed += 1
      console.error(`e2e: FAIL ${name} cleanup\n${error?.stack ?? error}`)
    })
  }
}

process.exit(failed === 0 ? 0 : 1)
