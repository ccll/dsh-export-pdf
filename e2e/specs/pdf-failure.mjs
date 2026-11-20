// 测试锚点: R-01-006/AC-01 R-01-006/AC-02 R-01-013/AC-03
// 失败路径：把 browserPath 配成不存在的文件，导出必须在渲染前给出页内可读
// 提示，不产生预览/下载，也不留下空文件；重试仍显式失败而不是空白。
export const boot = { pluginConfig: { browserPath: '/definitely/missing/dsh-pdf-browser' } }

import { clickPdfTab, openApp, sendHeroMessage, until, visibleText } from '../helpers.mjs'

const USER_TEXT = 'e2e:pdf 失败路径探针'
const ASSISTANT_TEXT = '导出探针回复：中文可读，包含标点与 12345。'

export default async function pdfFailure({ page, url, assert }) {
  await openApp(page, url)
  await sendHeroMessage(page, USER_TEXT)
  await until('助手回复出现', async () => visibleText(page, ASSISTANT_TEXT), 30_000)

  const headResponse = page.waitForResponse(
    (response) => response.url().includes('/api/session.pdf') && response.request().method() === 'HEAD',
    { timeout: 60_000 },
  )
  assert.equal(await clickPdfTab(page), true, '会话视图区应有 PDF 页签')
  const response = await headResponse
  assert.equal(response.status(), 503, '浏览器缺失应返回 503')

  const error = page.locator('.dxp-error').first()
  await error.waitFor({ timeout: 30_000 })
  const message = await error.textContent()
  assert.ok(message.includes('没有可用的浏览器'), `应显示浏览器缺失原因，实际：${message}`)
  assert.ok(!message.includes('/definitely/missing'), '不得回显配置路径')
  assert.equal(await page.locator('iframe[title="PDF 预览"]').count(), 0, '失败时不显示预览')
  const download = page.getByRole('button', { name: '下载 PDF' }).first()
  assert.equal(await download.count(), 1, '保留下载入口但不允许点击')
  assert.equal(await download.isDisabled(), true, '失败时下载不可用')

  const retry = page.getByRole('button', { name: '重试' }).first()
  assert.equal(await retry.count(), 1, '失败时提供重试')
  const retryResponse = page.waitForResponse(
    (response) => response.url().includes('/api/session.pdf') && response.request().method() === 'HEAD',
    { timeout: 30_000 },
  )
  await retry.click()
  assert.equal((await retryResponse).status(), 503, '重试仍返回 503')
  await until('重试后仍显示失败原因', async () => (await error.textContent()).includes('没有可用的浏览器'), 30_000)

  // R-01-006/AC-01：会话不存在时，页内显示 404 原因且不交付文件。
  // 这里拦截路由以稳定构造宿主侧失败；真实 404 由 test/route.test.mjs 覆盖。
  await page.route('**/api/session.pdf*', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'text/plain; charset=utf-8',
      body: '会话不存在或日志不可读\n',
      headers: { 'x-dsh-export-error': 'session' },
    })
  })
  const missingResponse = page.waitForResponse(
    (response) => response.url().includes('/api/session.pdf') && response.request().method() === 'HEAD',
    { timeout: 30_000 },
  )
  await retry.click()
  assert.equal((await missingResponse).status(), 404, '会话缺失返回 404')
  await until('404 原因显示', async () => (await error.textContent()).includes('会话不存在'), 30_000)
  assert.equal(await page.locator('iframe[title="PDF 预览"]').count(), 0, '404 时不显示预览')
  assert.equal(await download.isDisabled(), true, '404 时下载不可用')
  await page.unroute('**/api/session.pdf*')

  // R-01-006/AC-02：渲染失败时显示 500 原因，不产生预览或半份文件。
  await page.route('**/api/session.pdf*', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'text/plain; charset=utf-8',
      body: 'PDF 渲染失败\n',
      headers: { 'x-dsh-export-error': 'render' },
    })
  })
  const renderResponse = page.waitForResponse(
    (response) => response.url().includes('/api/session.pdf') && response.request().method() === 'HEAD',
    { timeout: 30_000 },
  )
  await retry.click()
  assert.equal((await renderResponse).status(), 500, '渲染失败返回 500')
  await until('500 原因显示', async () => (await error.textContent()).includes('PDF 渲染失败'), 30_000)
  assert.equal(await page.locator('iframe[title="PDF 预览"]').count(), 0, '500 时不显示预览')
  assert.equal(await download.isDisabled(), true, '500 时下载不可用')
  await page.unroute('**/api/session.pdf*')

  // R-01-006/AC-02：HEAD 成功但预览 GET 失败时，页面必须回到失败态而不是停在“预览已就绪”。
  await page.route('**/api/session.pdf*', async (route) => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/pdf', 'content-length': '0' },
        body: '',
      })
      return
    }
    await route.fulfill({
      status: 500,
      contentType: 'text/plain; charset=utf-8',
      body: '预览校验失败\n',
      headers: { 'x-dsh-export-error': 'render' },
    })
  })
  const headThenGetFailure = page.waitForResponse(
    (response) => response.url().includes('/api/session.pdf') && response.request().method() === 'HEAD',
    { timeout: 30_000 },
  )
  const previewGetFailure = page.waitForResponse(
    (response) => response.url().includes('/api/session.pdf') && response.request().method() === 'GET' && response.status() === 500,
    { timeout: 30_000 },
  )
  await retry.click()
  assert.equal((await headThenGetFailure).status(), 200, 'HEAD 先返回 200')
  assert.equal((await previewGetFailure).status(), 500, '预览校验 GET 返回 500')
  await until('GET 失败后显示失败原因', async () => (await error.textContent()).includes('预览校验失败'), 30_000)
  assert.equal(await page.locator('iframe[title="PDF 预览"]').count(), 0, 'GET 失败时不显示预览')
  assert.equal(await download.isDisabled(), true, 'GET 失败时下载不可用')
  await page.unroute('**/api/session.pdf*')

  // R-01-013/AC-03：失败状态下缩到窄视口，不得出现“打开完整 PDF”入口。
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.dxp-error').waitFor()
  assert.equal(await page.getByRole('link', { name: '打开完整 PDF' }).count(), 0, '失败时不显示打开完整 PDF')
  assert.equal(await page.locator('iframe[title="PDF 预览"]').count(), 0, '失败时不显示 iframe')
}
