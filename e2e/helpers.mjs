// e2e 共享辅助：只读用户可观察呈现（可见文字、角色、iframe、下载事件）。
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

export const POLL_INTERVAL_MS = 200
const APP_READY_TIMEOUT_MS = 30_000
const HERO_PLACEHOLDER = 'Describe what you want to build'

/** 轮询直到 fn() 返回真值；超时抛错并附最后一次观测值。 */
export async function until(label, fn, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let last
  for (;;) {
    last = await fn()
    if (last) return last
    if (Date.now() > deadline) throw new Error(`等待超时：${label}（最后观测：${JSON.stringify(last)?.slice(0, 200)}）`)
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

/** 打开应用并等到 composer 或 New session 控件可用。 */
export async function openApp(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await until(
    '应用首屏就绪（hero composer 或 New session 按钮）',
    async () => (await page.locator(`[data-placeholder^="${HERO_PLACEHOLDER}"]`).count()) > 0 || (await page.getByRole('button', { name: 'New session' }).count()) > 0,
    APP_READY_TIMEOUT_MS,
  )
}

/** 首屏公告若出现则关闭；没有则跳过。 */
export async function dismissNotice(page) {
  const dialog = page.locator('[role="dialog"]')
  if ((await dialog.count()) === 0) return
  for (const name of ['知道了', '我知道了', 'Got it', 'Continue', '继续']) {
    const button = dialog.getByRole('button', { name, exact: true })
    if ((await button.count()) > 0) {
      await button.first().click().catch(() => {})
      await page.waitForTimeout(200)
      return
    }
  }
}

/** 在 hero composer 发送一条消息；hero 不在场时先点 New session。 */
export async function sendHeroMessage(page, text, timeoutMs = 30_000) {
  const hero = page.locator(`[data-placeholder^="${HERO_PLACEHOLDER}"]`)
  for (let attempt = 0; ; attempt += 1) {
    const visible = await hero.first().waitFor({ timeout: 8_000 }).then(() => true).catch(() => false)
    if (visible) break
    if (attempt >= 1) throw new Error('hero composer 未出现')
    const button = page.getByRole('button', { name: 'New session' }).first()
    if ((await button.count()) === 0) throw new Error('找不到 New session 按钮')
    await button.click()
  }
  await dismissNotice(page)
  await until(
    `发送消息「${text}」`,
    async () => {
      await hero.first().fill(text).catch(() => {})
      await page.waitForTimeout(300)
      if ((await hero.first().textContent().catch(() => '')) !== text) return null
      await page.keyboard.press('Enter')
      await page.waitForTimeout(800)
      return (await hero.count()) === 0
    },
    timeoutMs,
  )
}

/** 当前会话页里对指定文字可见。 */
export async function visibleText(page, text) {
  return (await page.getByText(text, { exact: false }).count()) > 0
}

/** 找到并点击 PDF 视图页签；返回命中数量。 */
export async function clickPdfTab(page) {
  const candidates = [
    page.getByRole('tab', { name: 'PDF', exact: true }),
    page.getByRole('button', { name: 'PDF', exact: true }),
    page.getByText('PDF', { exact: true }),
  ]
  for (const candidate of candidates) {
    const count = await candidate.count()
    if (count > 0) {
      await candidate.first().click()
      return true
    }
  }
  return false
}

/** 取当前导出文件名里的会话标识片段；下载断言用。 */
export function expectedPdfPrefix(sessionId, suffix = '') {
  const raw = String(sessionId)
  const identity = raw.startsWith('session-') ? raw.slice('session-'.length) : raw
  return `dsh-session-${identity.slice(0, 8)}${suffix}.pdf`
}

/** 隔离环境里最近写入的会话日志路径。 */
export async function newestSessionLog(home) {
  const sessionsRoot = join(home, 'sessions')
  let newest
  const stack = [sessionsRoot]
  while (stack.length > 0) {
    const directory = stack.pop()
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile() && /^session\.v\d+\.jsonl\.zstd$/.test(entry.name)) {
        const info = await stat(full)
        if (newest === undefined || info.mtimeMs > newest.mtimeMs) newest = { path: full, mtimeMs: info.mtimeMs }
      }
    }
  }
  return newest?.path
}

/** 会话日志的 sha256；导出前后比对以证明只读。 */
export async function sessionLogDigest(filePath) {
  const bytes = await readFile(filePath)
  return createHash('sha256').update(bytes).digest('hex')
}
